use std::env;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, IsTerminal, Read, Write};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicI32, AtomicU8, Ordering};
use std::thread;
use std::time::{Duration, Instant};

static HITS: AtomicU8 = AtomicU8::new(0);
static DISCARD: AtomicBool = AtomicBool::new(false);
static VERBOSE: AtomicBool = AtomicBool::new(false);
static ENGINE: AtomicI32 = AtomicI32::new(0);
static UI_PID: AtomicI32 = AtomicI32::new(0);

mod plan;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum UiHost {
    Host,
    Runner,
}

struct Opts {
    dev: bool,
    use_runner: bool,
    verbose: bool,
    daemon: bool,
    config: Option<String>,
    command: String,
    rest: Vec<String>,
    help: bool,
    version: bool,
}

fn main() {
    let opts = parse_args(env::args().skip(1).collect());
    let repo = repo_root();
    if opts.help {
        print_help(&repo);
        return;
    }
    if opts.version {
        println!("bros {}", version_of(&repo));
        return;
    }
    maybe_rebuild(&repo);
    load_dotenv(&repo.join(".env"));
    let use_runner = opts.use_runner || env::var("BROS_USE_RUNNER").ok().as_deref() == Some("1");
    if opts.dev && use_runner {
        die("dev does not use the UI runner");
    }
    if opts.dev {
        env::set_var("BROS_DEV", "1");
    }
    VERBOSE.store(opts.verbose, Ordering::SeqCst);
    if opts.verbose {
        env::set_var("BROS_VERBOSE", "1");
    }
    let mut daemon = opts.daemon;
    if opts.dev && daemon && is_stack_start(&opts.command) {
        say("warning: -D ignored when BROS_DEV=1; dev stays interactive");
        daemon = false;
    }
    env::set_var("BROS_DAEMON", if daemon { "1" } else { "0" });
    if opts.dev && !plan::is_source(&repo) {
        die("dev requires a source checkout");
    }
    if plan::is_source(&repo) && needs_dev_tools(&opts.command) {
        if let Err(msg) = require_dev_tools(opts.dev, on_path("pnpm"), on_path("cargo")) {
            die(msg);
        }
    }
    if opts.command != "uninstall" {
        preflight_docker();
    }
    let paths = export_host_env(&repo, opts.config.as_deref());
    match opts.command.as_str() {
        "start" => cmd_start(&repo, &paths, opts.dev, use_runner, daemon, true),
        "stop" => cmd_stop(&paths),
        "restart" => {
            cmd_stop(&paths);
            cmd_start(&repo, &paths, opts.dev, use_runner, daemon, true);
        }
        "status" => cmd_status(&repo, &paths, opts.dev),
        "run" => cmd_exec(&opts.rest),
        "shell" => cmd_exec(&["bash".into()]),
        "update" | "upgrade" => cmd_update(&repo, &paths, opts.dev, use_runner),
        "check" => cmd_http(&paths, "POST", "/api/apps/check"),
        "service" => cmd_service(&opts.rest),
        "uninstall" => cmd_uninstall(&repo, &paths, &opts.rest),
        "app" => cmd_app(&paths, &opts.rest),
        "write-apps-compose" => cmd_http(&paths, "POST", "/api/apps/compose"),
        other => die(&format!("unknown command: {other}")),
    }
}

fn parse_args(args: Vec<String>) -> Opts {
    let mut dev = env::var("BROS_DEV").ok().as_deref() == Some("1");
    let mut use_runner = false;
    let mut verbose = false;
    let mut daemon = false;
    let mut config = None;
    let mut command = String::new();
    let mut rest = Vec::new();
    let mut help = false;
    let mut version = false;
    let mut i = 0;
    while i < args.len() {
        let arg = &args[i];
        match arg.as_str() {
            "-h" | "--help" => help = true,
            "-v" | "--version" => version = true,
            "--dev" => dev = true,
            "--use-runner" => use_runner = true,
            "--verbose" => verbose = true,
            "-D" | "--daemon" => daemon = true,
            "-i" | "--interactive" => daemon = false,
            "-c" | "--config" => {
                i += 1;
                let Some(path) = args.get(i) else {
                    die("--config requires a PATH");
                };
                config = Some(path.clone());
            }
            "run" | "shell" if command.is_empty() => {
                command = arg.clone();
                rest.extend(args[i + 1..].iter().cloned());
                break;
            }
            _ if command.is_empty() && !arg.starts_with('-') => command = arg.clone(),
            _ => rest.push(arg.clone()),
        }
        i += 1;
    }
    if command.is_empty() {
        command = "start".into();
    }
    Opts { dev, use_runner, verbose, daemon, config, command, rest, help, version: version && !help }
}

fn is_stack_start(command: &str) -> bool {
    command == "start" || command == "restart"
}

fn needs_dev_tools(command: &str) -> bool {
    matches!(command, "start" | "restart" | "update" | "upgrade" | "check" | "service" | "app" | "write-apps-compose")
        || !matches!(command, "start" | "stop" | "restart" | "status" | "run" | "shell" | "update" | "upgrade" | "help" | "version" | "uninstall")
}

fn repo_root() -> PathBuf {
    if let Some(found) = walk_for_repo(env::current_exe().ok().as_deref()) {
        return found;
    }
    if let Some(found) = walk_for_repo(Some(Path::new("."))) {
        return found;
    }
    env::current_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn walk_for_repo(start: Option<&Path>) -> Option<PathBuf> {
    let mut dir = start?.canonicalize().ok()?;
    if dir.is_file() {
        dir.pop();
    }
    for _ in 0..8 {
        if dir.join("lib/desktop/docker-compose.yml").is_file() && dir.join("docs").join("cli.md").is_file() {
            return Some(dir);
        }
        if !dir.pop() {
            break;
        }
    }
    None
}

fn version_of(repo: &Path) -> String {
    if let Ok(text) = fs::read_to_string(repo.join("VERSION")) {
        let text = text.trim();
        if !text.is_empty() {
            return text.to_string();
        }
    }
    if let Ok(text) = fs::read_to_string(repo.join("src/package.json")) {
        if let Some(ver) = json_string(&text, "version") {
            return ver;
        }
    }
    "0.0.1".into()
}

fn json_string(text: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\"");
    let at = text.find(&needle)?;
    let rest = &text[at + needle.len()..];
    let colon = rest.find(':')?;
    let rest = rest[colon + 1..].trim_start();
    let rest = rest.strip_prefix('"')?;
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

fn print_help(repo: &Path) {
    let path = repo.join("docs/cli.md");
    let text = fs::read_to_string(&path).unwrap_or_else(|_| die(&format!("missing {}", path.display())));
    let mut skip = false;
    let mut first = true;
    for line in text.lines() {
        if first && line == "---" {
            skip = true;
            first = false;
            continue;
        }
        first = false;
        if skip && line == "---" {
            skip = false;
            continue;
        }
        if !skip {
            println!("{line}");
        }
    }
}

fn say(msg: &str) {
    if std::io::stdout().is_terminal() {
        println!("\x1b[34m[bros]\x1b[0m {msg}");
    } else {
        println!("[bros] {msg}");
    }
}

fn die(msg: &str) -> ! {
    eprintln!("[bros] error: {msg}");
    std::process::exit(1);
}

fn on_path(bin: &str) -> bool {
    Command::new("sh")
        .args(["-c", &format!("command -v {bin} >/dev/null")])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn require_dev_tools(dev: bool, pnpm: bool, cargo: bool) -> Result<(), &'static str> {
    if !dev {
        return Ok(());
    }
    if !pnpm {
        return Err("dev requires host pnpm");
    }
    if !cargo {
        return Err("dev requires host cargo");
    }
    Ok(())
}

/// `host_js`: host can serve the UI (`pnpm` and/or `node` on PATH).
fn choose_ui(source: bool, dev: bool, host_js: bool, use_runner: bool) -> Result<UiHost, &'static str> {
    if dev && use_runner {
        return Err("dev does not use the UI runner");
    }
    if !source && dev {
        return Err("dev requires a source checkout");
    }
    if source {
        require_dev_tools(dev, host_js, true)?;
    }
    // Prod: host Node/pnpm when available unless --use-runner. Release and source share this rule.
    if dev || (host_js && !use_runner) {
        Ok(UiHost::Host)
    } else {
        Ok(UiHost::Runner)
    }
}

fn desktop_up_args(dev: bool) -> Vec<&'static str> {
    if dev {
        vec!["up", "-d", "--no-deps", "bros"]
    } else {
        vec!["up", "--build", "-d", "--no-deps", "bros"]
    }
}

fn resolve_bros_dir(repo: &str, dir: Option<&str>) -> String {
    dir.filter(|s| !s.is_empty()).unwrap_or(repo).to_string()
}

fn data_dir_for(bros_dir: &str, set: Option<&str>) -> String {
    match set.map(str::trim).filter(|s| !s.is_empty()) {
        Some(dir) => expand_dotenv_value(dir, Some(bros_dir)),
        None => format!("{bros_dir}/data"),
    }
}

/// Refuse paths that would make Docker create junk under BROS_DIR (literal `$HOME`, `#`, relative).
fn host_path_problem(name: &str, path: &str) -> Option<String> {
    if path.contains('$') || path.contains('#') {
        return Some(format!(
            "{name} is not expanded ({path}). Fix .env ($HOME/… or an absolute path; same-line # comments are stripped). A literal $ makes Docker create dirs under BROS_DIR."
        ));
    }
    if !Path::new(path).is_absolute() {
        return Some(format!(
            "{name} must be absolute (got {path}). Relative paths resolve under BROS_DIR and can create junk dirs."
        ));
    }
    None
}

fn reject_bad_host_path(name: &str, path: &str) {
    if let Some(msg) = host_path_problem(name, path) {
        die(&msg);
    }
}

/// Drop an unquoted trailing ` # comment` (space + hash).
fn strip_unquoted_inline_comment(val: &str) -> &str {
    match val.find(" #") {
        Some(i) => &val[..i],
        None => val,
    }
}

/// Expand `~`, `$HOME` / `${HOME}`, and `$BROS_DIR` / `${BROS_DIR}` in a .env value.
fn expand_dotenv_value(val: &str, bros_dir: Option<&str>) -> String {
    let home = env::var("HOME").unwrap_or_default();
    let mut out = val.to_string();
    if out == "~" {
        return home;
    }
    if let Some(rest) = out.strip_prefix("~/") {
        out = format!("{home}/{rest}");
    }
    if !home.is_empty() {
        out = out.replace("${HOME}", &home);
        out = out.replace("$HOME/", &format!("{home}/"));
        if out == "$HOME" {
            out = home;
        }
    }
    if let Some(bd) = bros_dir.filter(|s| !s.is_empty()) {
        out = out.replace("${BROS_DIR}", bd);
        out = out.replace("$BROS_DIR/", &format!("{bd}/"));
        if out == "$BROS_DIR" {
            out = bd.to_string();
        }
    }
    out
}

fn parse_dotenv_value(raw: &str) -> Option<String> {
    let val = raw.trim();
    if val.is_empty() {
        return None;
    }
    let bytes = val.as_bytes();
    let quoted = val.len() >= 2
        && ((bytes[0] == b'"' && bytes[val.len() - 1] == b'"') || (bytes[0] == b'\'' && bytes[val.len() - 1] == b'\''));
    let owned = if quoted {
        val[1..val.len() - 1].to_string()
    } else {
        strip_unquoted_inline_comment(val).trim().to_string()
    };
    if owned.is_empty() {
        return None;
    }
    Some(expand_dotenv_value(&owned, env::var("BROS_DIR").ok().as_deref()))
}

fn container_data_dir(data: &str) -> bool {
    matches!(data, "" | "/app/data" | "/data")
}

fn host_path(path: &str) -> bool {
    let path = path.trim().trim_end_matches('/');
    !path.is_empty() && path != "/app/data" && !path.starts_with("/app/data/")
}

fn resolve_workspace(data: &str, env_workspace: Option<&str>, yaml_workspace: Option<&str>) -> Option<String> {
    if let Some(set) = env_workspace.map(str::trim).filter(|s| !s.is_empty()) {
        return Some(set.to_string());
    }
    if container_data_dir(data) {
        return None;
    }
    if let Some(yaml) = yaml_workspace.map(str::trim).filter(|s| host_path(s)) {
        return Some(yaml.to_string());
    }
    Some(format!("{data}/home/workspace"))
}

/// Rewrite install-preserved `.env` keys: `BROS_HOST_DATA_DIR` → `BROS_DATA_DIR`,
/// `BROS_HOST_WORKSPACE` → `BROS_WORKSPACE`. Drops the old key when the new one exists.
fn migrate_legacy_dotenv(text: &str) -> Option<String> {
    let mut has_data = false;
    let mut has_workspace = false;
    for raw in text.lines() {
        let mut line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(rest) = line.strip_prefix("export ") {
            line = rest.trim();
        }
        let Some((key, _)) = line.split_once('=') else { continue };
        match key.trim() {
            "BROS_DATA_DIR" => has_data = true,
            "BROS_WORKSPACE" => has_workspace = true,
            _ => {}
        }
    }

    let mut changed = false;
    let mut out = Vec::with_capacity(text.lines().count());
    for raw in text.lines() {
        let trimmed = raw.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            let next = scrub_legacy_dotenv_names(raw);
            if next != raw {
                changed = true;
            }
            out.push(next);
            continue;
        }
        let export = trimmed.strip_prefix("export ");
        let body = export.unwrap_or(trimmed);
        let Some((key, val)) = body.split_once('=') else {
            out.push(scrub_legacy_dotenv_names(raw));
            continue;
        };
        let key = key.trim();
        let scrubbed = scrub_legacy_dotenv_names(val);
        if scrubbed != val {
            changed = true;
        }
        let (keep, new_key) = match key {
            "BROS_HOST_DATA_DIR" if has_data => {
                changed = true;
                (false, key)
            }
            "BROS_HOST_DATA_DIR" => {
                changed = true;
                has_data = true;
                (true, "BROS_DATA_DIR")
            }
            "BROS_HOST_WORKSPACE" if has_workspace => {
                changed = true;
                (false, key)
            }
            "BROS_HOST_WORKSPACE" => {
                changed = true;
                has_workspace = true;
                (true, "BROS_WORKSPACE")
            }
            _ => (true, key),
        };
        if !keep {
            continue;
        }
        let prefix = if export.is_some() { "export " } else { "" };
        let indent: String = raw.chars().take_while(|c| c.is_whitespace()).collect();
        out.push(format!("{indent}{prefix}{new_key}={scrubbed}"));
    }
    if !changed {
        return None;
    }
    let mut next = out.join("\n");
    if text.ends_with('\n') {
        next.push('\n');
    }
    Some(next)
}

fn scrub_legacy_dotenv_names(s: &str) -> String {
    // Bare replace also covers `$BROS_HOST_DATA_DIR` / `${…}` forms.
    s.replace("BROS_HOST_DATA_DIR", "BROS_DATA_DIR")
        .replace("BROS_HOST_WORKSPACE", "BROS_WORKSPACE")
}

fn load_dotenv(path: &Path) {
    let Ok(text) = fs::read_to_string(path) else { return };
    let text = match migrate_legacy_dotenv(&text) {
        Some(next) => {
            let _ = fs::write(path, &next);
            next
        }
        None => text,
    };
    for raw in text.lines() {
        let mut line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(rest) = line.strip_prefix("export ") {
            line = rest.trim();
        }
        let Some((key, val)) = line.split_once('=') else { continue };
        let key = key.trim();
        if key.is_empty() || !key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            continue;
        }
        if env::var_os(key).is_some() {
            continue;
        }
        let Some(val) = parse_dotenv_value(val) else { continue };
        env::set_var(key, val);
    }
}

fn api_unauthorized_hint(paths: &Paths, code: u16) -> String {
    if code != 401 {
        return format!("HTTP {code}");
    }
    let key = paths.data.join("proxy-key");
    format!(
        "HTTP 401 Unauthorized (Bearer proxy-key under {})",
        key.display()
    )
}

fn yaml_top(path: &Path, key: &str) -> Option<String> {
    let text = fs::read_to_string(path).ok()?;
    let prefix = format!("{key}:");
    for line in text.lines() {
        if line.starts_with(' ') || line.starts_with('\t') {
            continue;
        }
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let Some(rest) = trimmed.strip_prefix(&prefix) else { continue };
        let val = rest.trim().trim_matches(|c| c == '"' || c == '\'');
        if val.is_empty() || matches!(val, "|" | ">" | "~" | "null") {
            return None;
        }
        return Some(val.to_string());
    }
    None
}

fn resolve_config(data: &str, bros_dir: &str, flag: Option<&str>) -> Option<PathBuf> {
    if let Some(flag) = flag {
        let path = PathBuf::from(flag);
        if !path.is_file() {
            die(&format!("config file not found: {flag}"));
        }
        return Some(path);
    }
    let home_file = Path::new(bros_dir).join("bros.yml");
    if home_file.is_file() {
        return Some(home_file);
    }
    // Legacy path until ensure_dirs migrates it to $BROS_DIR/bros.yml.
    let data_file = Path::new(data).join("config/bros.yml");
    if data_file.is_file() {
        return Some(data_file);
    }
    None
}

struct Paths {
    data: PathBuf,
}

fn export_host_env(repo: &Path, config_flag: Option<&str>) -> Paths {
    let repo_s = repo.to_string_lossy().to_string();
    let dir = resolve_bros_dir(&repo_s, env::var("BROS_DIR").ok().as_deref());
    let data = data_dir_for(&dir, env::var("BROS_DATA_DIR").ok().as_deref());
    reject_bad_host_path("BROS_DATA_DIR", &data);
    env::set_var("BROS_DIR", &dir);
    // Host path for Compose binds and UI (same tree → Bearer/proxy-key stay aligned).
    if !container_data_dir(&data) {
        env::set_var("BROS_DATA_DIR", &data);
    }
    env::set_var("BROS_HOST_REPO", env::var("BROS_HOST_REPO").unwrap_or(repo_s));
    let config = resolve_config(&data, &dir, config_flag);
    let yaml_workspace = config.as_ref().and_then(|path| yaml_top(path, "workspace"));
    let env_workspace = env::var("BROS_WORKSPACE").ok().map(|s| expand_dotenv_value(&s, Some(&dir)));
    if let Some(ref ws) = env_workspace {
        reject_bad_host_path("BROS_WORKSPACE", ws);
    }
    if let Some(workspace) = resolve_workspace(&data, env_workspace.as_deref(), yaml_workspace.as_deref()) {
        env::set_var("BROS_WORKSPACE", workspace);
    }
    if let Some(path) = &config {
        env::set_var("BROS_CONFIG_HOST", path);
    }
    env::set_var("BROS_PORT", env::var("BROS_PORT").unwrap_or_else(|_| "3055".into()));
    env::set_var("BROS_HOST", env::var("BROS_HOST").unwrap_or_else(|_| "0.0.0.0".into()));
    env::set_var("BROS_STREAM_PORT", env::var("BROS_STREAM_PORT").unwrap_or_else(|_| "3300".into()));
    env::set_var("BROS_TTYD_PORT", env::var("BROS_TTYD_PORT").unwrap_or_else(|_| "7681".into()));
    if env::var("BROS_DESKTOP_STREAM_ORIGIN").ok().filter(|s| !s.is_empty()).is_none() {
        let port = env::var("BROS_STREAM_PORT").unwrap_or_else(|_| "3300".into());
        env::set_var("BROS_DESKTOP_STREAM_ORIGIN", format!("http://127.0.0.1:{port}"));
    }
    if env::var("BROS_TERMINAL_ORIGIN").ok().filter(|s| !s.is_empty()).is_none() {
        let port = env::var("BROS_TTYD_PORT").unwrap_or_else(|_| "7681".into());
        env::set_var("BROS_TERMINAL_ORIGIN", format!("http://127.0.0.1:{port}"));
    }
    env::set_var("BROS_HOST_UID", env::var("BROS_HOST_UID").unwrap_or_else(|_| id_flag("-u")));
    env::set_var("BROS_HOST_GID", env::var("BROS_HOST_GID").unwrap_or_else(|_| id_flag("-g")));
    if env::var("BROS_DOCKER_GID").ok().filter(|s| !s.is_empty()).is_none() {
        env::set_var("BROS_DOCKER_GID", docker_gid());
    }
    if env::var("BROS_NODE_VERSION").ok().filter(|s| !s.is_empty()).is_none() {
        env::set_var("BROS_NODE_VERSION", node_version());
    }
    let home_bind = env::var("HOME").unwrap_or_else(|_| dir.clone());
    if env::var("BROS_HOST_HOME_BIND").ok().filter(|s| !s.is_empty()).is_none() {
        env::set_var("BROS_HOST_HOME_BIND", home_bind);
    }
    if env::var("BROS_BIN").ok().filter(|s| !s.is_empty()).is_none() {
        if let Some(user_home) = env::var_os("HOME") {
            env::set_var("BROS_BIN", Path::new(&user_home).join(".local/bin/bros"));
        }
    }
    Paths { data: PathBuf::from(data) }
}

fn id_flag(flag: &str) -> String {
    Command::new("id")
        .arg(flag)
        .output()
        .ok()
        .filter(|out| out.status.success())
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "1000".into())
}

fn docker_gid() -> String {
    let out = Command::new("getent").args(["group", "docker"]).output();
    if let Ok(out) = out {
        if out.status.success() {
            if let Ok(text) = String::from_utf8(out.stdout) {
                if let Some(gid) = text.split(':').nth(2) {
                    if !gid.trim().is_empty() {
                        return gid.trim().to_string();
                    }
                }
            }
        }
    }
    say("warning: no docker group; BROS_DOCKER_GID=0 so the app can still use /var/run/docker.sock");
    "0".into()
}

fn node_version() -> String {
    let out = Command::new("node").arg("-v").output();
    if let Ok(out) = out {
        if let Ok(text) = String::from_utf8(out.stdout) {
            let ver = text.trim().trim_start_matches('v');
            if !ver.is_empty() {
                return ver.to_string();
            }
        }
    }
    "26.7.0".into()
}

fn preflight_docker() {
    if !on_path("docker") {
        die("Docker is not installed or not on PATH. Install Docker: https://docs.docker.com/get-docker/");
    }
    if !Command::new("docker").arg("info").stdout(Stdio::null()).stderr(Stdio::null()).status().map(|s| s.success()).unwrap_or(false) {
        die("Docker daemon is not reachable. Start Docker and retry (tried: docker info).");
    }
    if !Command::new("docker").args(["compose", "version"]).stdout(Stdio::null()).stderr(Stdio::null()).status().map(|s| s.success()).unwrap_or(false) {
        die("Docker Compose plugin missing. Need 'docker compose' (v2 plugin), not only 'docker-compose'.");
    }
}

fn ensure_dirs(repo: &Path, data: &Path) {
    for rel in [
        "",
        "build/desktop",
        "config/apps",
        "config/skills",
        "home/.local/app-bins",
        "home/workspace",
        "home/.agents/skills",
        "home/nix",
        "apps/ollama/bros-model",
        "cache/apt/archives",
        "cache/apt/lists",
        "cache/deb",
        "var/logs",
        "var/logs/apps",
        "var/tunnel",
    ] {
        let _ = fs::create_dir_all(data.join(rel));
    }
    let generated = data.join("build/desktop/Dockerfile");
    let use_generated = fs::read_to_string(&generated).map(|t| t.contains("AS production")).unwrap_or(false);
    if use_generated {
        env::set_var("BROS_DESKTOP_DOCKERFILE", &generated);
    } else {
        let _ = fs::remove_file(&generated);
        env::set_var("BROS_DESKTOP_DOCKERFILE", repo.join("lib/desktop/Dockerfile"));
    }
    // Canonical bootstrap YAML is $BROS_DIR/bros.yml (repo root for an install).
    let home = env::var("BROS_DIR").map(PathBuf::from).unwrap_or_else(|_| repo.to_path_buf());
    let dest = home.join("bros.yml");
    let legacy = data.join("config/bros.yml");
    if legacy.is_dir() {
        let _ = fs::remove_dir_all(&legacy);
    }
    if legacy.is_file() && !dest.is_file() {
        let _ = fs::rename(&legacy, &dest);
    }
    if !dest.is_file() {
        let _ = fs::write(
            &dest,
            "# Bros bootstrap. Host layout is BROS_DIR + $BROS_DIR/data.\n# Compose sets in-container working_dir=/app and data at /app/data.\n# Uncomment to enable a named Cloudflare tunnel:\n# public_url: https://bros.example.com\n",
        );
    }
    env::set_var("BROS_CONFIG_HOST", &dest);
}

fn compose_args(repo: &Path, dev: bool, data: &Path) -> Vec<String> {
    let mut args = vec!["compose".into()];
    if !VERBOSE.load(Ordering::SeqCst) {
        args.extend(["--progress".into(), "plain".into()]);
    }
    args.extend(["--project-directory".into(), repo.to_string_lossy().into()]);
    args.extend(["-f".into(), repo.join("lib/desktop/docker-compose.yml").to_string_lossy().into()]);
    let overlay = if dev { "docker-compose.dev.yml" } else { "docker-compose.prod.yml" };
    args.extend(["-f".into(), repo.join("lib/desktop").join(overlay).to_string_lossy().into()]);
    let apps = data.join("config/apps-compose.yml");
    if apps.is_file() {
        args.extend(["-f".into(), apps.to_string_lossy().into()]);
    }
    args
}

fn cmd_start(repo: &Path, paths: &Paths, dev: bool, use_runner: bool, daemon: bool, announce: bool) {
    ensure_dirs(repo, &paths.data);
    arm_signals();
    let mode = if dev { "dev" } else { "prod" };
    let how = if daemon { "daemon" } else { "interactive" };
    if announce {
        say(&format!("Bros start ({mode}, {how})…"));
        if !daemon {
            say("Ctrl+C stops the full stack (core + docker apps).");
        }
    }
    tunnel(repo, "bros_tunnel_cleanup_dockerApp");
    tunnel(repo, "bros_tunnel_startup");
    if HITS.load(Ordering::SeqCst) > 0 {
        finish_stop();
    }
    ensure_network();
    ensure_volume();
    remove_old_prefix();
    let source = plan::is_source(repo);
    // Source host UI needs pnpm workspace. Release host UI runs prebuilt .output with node.
    let host_js = if source {
        on_path("pnpm")
    } else {
        on_path("node") || on_path("pnpm")
    };
    let ui = choose_ui(source, dev, host_js, use_runner).unwrap_or_else(|msg| die(msg));
    let log = paths.data.join("var/logs/bros.log");
    if ui == UiHost::Host && source {
        ensure_node_modules(repo, &log);
    }
    if HITS.load(Ordering::SeqCst) > 0 {
        finish_stop();
    }
    stop_other_ui(ui);
    let child = match ui {
        UiHost::Host => start_host_ui(repo, dev, daemon, &log),
        UiHost::Runner => {
            start_runner_ui(repo, dev, &paths.data, daemon, &log);
            None
        }
    };
    let url = listen_url();
    let ready = wait_health(&url, if daemon { 60 } else { 120 });
    if ready {
        let (code, body) = http_code(&paths, "POST", "/api/apps/compose");
        if !(200..300).contains(&code) {
            if code == 401 {
                say(&format!("warning: write-apps-compose failed ({})", api_unauthorized_hint(paths, code)));
            } else {
                let detail = body.trim().replace('\n', " ");
                let detail = if detail.len() > 160 { &detail[..160] } else { detail.as_str() };
                say(&format!("warning: write-apps-compose failed (HTTP {code}) {detail}"));
            }
        }
    } else if HITS.load(Ordering::SeqCst) > 0 {
        finish_stop();
    } else {
        say(&format!("UI not ready yet: {url}"));
    }
    let mut up = compose_args(repo, dev, &paths.data);
    up.extend(desktop_up_args(dev).into_iter().map(str::to_string));
    let mut cmd = Command::new("docker");
    cmd.args(&up).current_dir(repo);
    let code = run_logged(cmd, &log);
    if HITS.load(Ordering::SeqCst) > 0 || code == 130 {
        finish_stop();
    }
    if code != 0 {
        die("desktop compose up failed");
    }
    if announce && ready {
        say(&url);
        for extra in lan_urls() {
            say(&extra);
        }
        if let Some(tunnel_url) = tunnel_url(repo) {
            say(&tunnel_url);
        }
    }
    if daemon {
        return;
    }
    wait_foreground(child);
}

fn ensure_node_modules(repo: &Path, log: &Path) {
    if repo.join("src/node_modules/citty").exists() {
        return;
    }
    say("pnpm install…");
    let mut cmd = Command::new("pnpm");
    cmd.current_dir(repo).args([
        "--dir",
        "src",
        "install",
        "--filter",
        "@bros/ui...",
        "--no-frozen-lockfile",
    ]);
    if run_logged(cmd, log) != 0 {
        die("pnpm install failed");
    }
}

fn finish_stop() -> ! {
    say("Stopping Bros (full stack)…");
    stop_stack();
    std::process::exit(0);
}

fn cmd_stop(paths: &Paths) {
    let _ = paths;
    say("Bros stop (core + docker apps)…");
    stop_stack();
}

fn stop_stack() {
    DISCARD.store(true, Ordering::SeqCst);
    kill_pid(UI_PID.load(Ordering::SeqCst));
    kill_ui_pidfile();
    say("Stopping host tunnel helper…");
    if let Some(repo) = walk_for_repo(env::current_exe().ok().as_deref()) {
        tunnel(&repo, "bros_tunnel_stop_helper");
    }
    say("Stopping docker apps (bros-*)…");
    stop_filter("bros-");
    say("Stopping Bros…");
    docker_status(&["rm", "-f", "bros"]);
    say("Bros exited.");
}

fn stop_other_ui(ui: UiHost) {
    kill_ui_pidfile();
    if ui == UiHost::Host {
        docker_status(&["stop", "-t", "5", "bros-ui"]);
        docker_status(&["rm", "-f", "bros-ui"]);
    }
}

fn start_host_ui(repo: &Path, dev: bool, daemon: bool, log: &Path) -> Option<std::process::Child> {
    env::set_var("PORT", env::var("BROS_PORT").unwrap_or_else(|_| "3055".into()));
    env::set_var("HOST", env::var("BROS_HOST").unwrap_or_else(|_| "0.0.0.0".into()));
    let built = repo.join("src/ui/.output/server/index.mjs");
    // Release tarball has .output but no workspace package.json — run node directly.
    if !dev && !plan::is_source(repo) {
        if !built.is_file() {
            die("prebuilt UI missing at src/ui/.output; reinstall or use --use-runner");
        }
        if !on_path("node") {
            die("host node not found; install Node or use --use-runner");
        }
        let mut cmd = Command::new("node");
        cmd.arg(&built).current_dir(repo);
        return spawn_ui(cmd, log, daemon);
    }
    let mut cmd = Command::new("pnpm");
    cmd.current_dir(repo).arg("--dir").arg("src");
    if dev {
        cmd.args(["--filter", "@bros/ui", "dev"]);
    } else {
        if !built.is_file() {
            say("Building UI…");
            let mut build = Command::new("pnpm");
            build.current_dir(repo).args(["--dir", "src", "--filter", "@bros/ui", "build"]);
            let code = run_logged(build, log);
            if code != 0 {
                die("UI build failed");
            }
        }
        cmd.args(["exec", "node", "ui/.output/server/index.mjs"]);
    }
    spawn_ui(cmd, log, daemon)
}

fn start_runner_ui(repo: &Path, dev: bool, data: &Path, daemon: bool, log: &Path) {
    let _ = (dev, daemon);
    let mut args = compose_args(repo, false, data);
    args.extend(["--profile".into(), "ui".into(), "up".into(), "-d".into(), "--build".into(), "bros-ui".into()]);
    let mut cmd = Command::new("docker");
    cmd.args(&args).current_dir(repo);
    let code = run_logged(cmd, log);
    if code != 0 {
        die("bros-ui failed to start");
    }
}

fn spawn_ui(mut cmd: Command, log: &Path, daemon: bool) -> Option<std::process::Child> {
    if let Some(parent) = log.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let Ok(out) = OpenOptions::new().create(true).append(true).open(log) else {
        die("cannot open UI log");
    };
    let Ok(err) = out.try_clone() else { die("cannot open UI log"); };
    cmd.stdin(Stdio::null()).stdout(out).stderr(err);
    unsafe {
        cmd.pre_exec(|| {
            if libc::setsid() == -1 {
                return Err(std::io::Error::last_os_error());
            }
            Ok(())
        });
    }
    let child = cmd.spawn().unwrap_or_else(|err| die(&format!("UI failed to start: {err}")));
    UI_PID.store(child.id() as i32, Ordering::SeqCst);
    if let Ok(data) = env::var("BROS_DATA_DIR") {
        let path = Path::new(&data).join("var/ui.pid");
        let _ = fs::write(path, format!("{}\n", child.id()));
    }
    if daemon {
        return None;
    }
    Some(child)
}

fn wait_foreground(mut child: Option<std::process::Child>) {
    loop {
        if HITS.load(Ordering::SeqCst) > 0 {
            finish_stop();
        }
        if let Some(proc) = child.as_mut() {
            match proc.try_wait() {
                Ok(Some(status)) => {
                    say("UI exited.");
                    std::process::exit(status.code().unwrap_or(1));
                }
                Ok(None) => {}
                Err(_) => std::process::exit(1),
            }
        }
        thread::sleep(Duration::from_millis(200));
    }
}

fn wait_health(url: &str, secs: u64) -> bool {
    let deadline = Instant::now() + Duration::from_secs(secs);
    let frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let tty = std::io::stdout().is_terminal();
    let mut i = 0;
    while Instant::now() < deadline {
        if HITS.load(Ordering::SeqCst) > 0 {
            return false;
        }
        if curl_ok(&format!("{url}/api/health")) {
            if tty {
                print!("\r\x1b[2K");
                let _ = std::io::stdout().flush();
            }
            return true;
        }
        if tty {
            print!("\r\x1b[2K\x1b[34m[bros]\x1b[0m Starting UI… {}", frames[i % frames.len()]);
            let _ = std::io::stdout().flush();
            i += 1;
        } else if i == 0 {
            say("Starting UI…");
            i = 1;
        }
        thread::sleep(Duration::from_millis(200));
    }
    if tty {
        print!("\r\x1b[2K");
        let _ = std::io::stdout().flush();
    }
    false
}

fn listen_url() -> String {
    let mut host = env::var("BROS_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    if host == "0.0.0.0" || host == "::" || host == "[::]" {
        host = "127.0.0.1".into();
    }
    let port = env::var("BROS_PORT").unwrap_or_else(|_| "3055".into());
    format!("http://{host}:{port}")
}

fn lan_urls() -> Vec<String> {
    let host = env::var("BROS_HOST").unwrap_or_else(|_| "0.0.0.0".into());
    if host != "0.0.0.0" && host != "::" && host != "[::]" {
        return Vec::new();
    }
    let port = env::var("BROS_PORT").unwrap_or_else(|_| "3055".into());
    let Ok(out) = Command::new("ip").args(["-4", "-o", "addr", "show", "scope", "global"]).output() else {
        return Vec::new();
    };
    let text = String::from_utf8(out.stdout).unwrap_or_default();
    lan_addrs(&text).into_iter().map(|ip| format!("http://{ip}:{port}")).collect()
}

fn lan_addrs(text: &str) -> Vec<String> {
    let mut ips = Vec::new();
    for line in text.lines() {
        let mut parts = line.split_whitespace();
        let _n = parts.next();
        let iface = parts.next().unwrap_or("");
        if iface.starts_with("docker") || iface.starts_with("br-") || iface.starts_with("veth") || iface.starts_with("tun") || iface.starts_with("tailscale") || iface.starts_with("zt") || iface == "lo" {
            continue;
        }
        let Some(cidr) = parts.find(|part| part.contains('.')) else { continue };
        let ip = cidr.split('/').next().unwrap_or("");
        if ip.is_empty() || ip.starts_with("127.") {
            continue;
        }
        ips.push(ip.to_string());
    }
    ips
}

fn curl_ok(url: &str) -> bool {
    Command::new("curl")
        .args(["-fsS", "-o", "/dev/null", "--max-time", "1", url])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn curl_body(url: &str) -> String {
    let Ok(out) = Command::new("curl").args(["-fsS", "--max-time", "3", url]).output() else {
        return String::new();
    };
    String::from_utf8(out.stdout).unwrap_or_default()
}

fn cmd_status(repo: &Path, paths: &Paths, dev: bool) {
    let args = compose_args(repo, dev, &paths.data);
    let mut cmd = Command::new("docker");
    cmd.args(args).arg("ps").current_dir(repo);
    let code = cmd.status().map(|s| s.code().unwrap_or(1)).unwrap_or(1);
    let url = listen_url();
    if curl_ok(&format!("{url}/api/health")) {
        say(&format!("Health: ok ({url}/api/health)"));
    } else {
        say(&format!("Health: unreachable ({url}/api/health)"));
    }
    let port = env::var("BROS_OLLAMA_PORT").unwrap_or_else(|_| "11435".into());
    let base = format!("http://127.0.0.1:{port}");
    if !curl_ok(&format!("{base}/api/version")) {
        say("Ollama docker app: down");
    } else {
        let tags = curl_body(&format!("{base}/api/tags"));
        if tags.contains("\"bros\"") || tags.contains("\"bros:") {
            say("Ollama docker app: up (model bros installed)");
        } else {
            say("Ollama docker app: up (model bros missing)");
        }
    }
    if code != 0 {
        std::process::exit(code);
    }
}

fn cmd_exec(args: &[String]) {
    if args.is_empty() {
        die("usage: bros run <command> [args...]  (example: bros run agent)");
    }
    if !container_running("bros") {
        die("Bros is not running. Start Bros first: bros");
    }
    let tty = std::io::stdin().is_terminal() && std::io::stdout().is_terminal();
    let exec_args = plan::docker_exec_args(tty, args);
    let mut cmd = Command::new("docker");
    cmd.args(&exec_args);
    let code = cmd.status().map(|s| s.code().unwrap_or(1)).unwrap_or(1);
    std::process::exit(code);
}

fn container_running(name: &str) -> bool {
    Command::new("docker")
        .args(["inspect", "-f", "{{.State.Running}}", name])
        .output()
        .ok()
        .filter(|out| out.status.success())
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim() == "true")
        .unwrap_or(false)
}

fn git_update(repo: &Path) {
    let branch = Command::new("git")
        .args(["-C", &repo.to_string_lossy(), "rev-parse", "--abbrev-ref", "HEAD"])
        .output()
        .ok()
        .filter(|out| out.status.success())
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".into());
    if branch == "main" || branch == "master" {
        let code = Command::new("git")
            .args(["-C", &repo.to_string_lossy(), "pull", "--ff-only"])
            .status()
            .map(|s| s.code().unwrap_or(1))
            .unwrap_or(1);
        if code != 0 {
            std::process::exit(code);
        }
    } else {
        eprintln!();
        eprintln!("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        eprintln!("SKIP git pull: branch is '{branch}' (not main/master).");
        eprintln!("Rebuild continues without syncing remote.");
        eprintln!("!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!");
        eprintln!();
    }
    let code = Command::new("git")
        .args(["-C", &repo.to_string_lossy(), "submodule", "update", "--init"])
        .status()
        .map(|s| s.code().unwrap_or(1))
        .unwrap_or(1);
    if code != 0 {
        std::process::exit(code);
    }
}

fn maybe_rebuild(repo: &Path) {
    if env::var("BROS_REEXEC").ok().as_deref() == Some("1") {
        return;
    }
    let newer = env::current_exe().ok().and_then(|exe| file_newer(&repo.join("cli/src/main.rs"), &exe)).unwrap_or(false);
    if !plan::needs_rebuild(plan::is_source(repo), newer) {
        return;
    }
    if !cargo_release(repo) {
        die("cargo build failed");
    }
    let bin = repo.join("cli/target/release/bros");
    let err = Command::new(&bin).args(env::args().skip(1)).env("BROS_REEXEC", "1").exec();
    die(&format!("re-exec failed: {err}"));
}

fn file_newer(left: &Path, right: &Path) -> Option<bool> {
    let left = fs::metadata(left).ok()?.modified().ok()?;
    let right = fs::metadata(right).ok()?.modified().ok()?;
    Some(left > right)
}

fn cargo_release(repo: &Path) -> bool {
    Command::new("cargo")
        .current_dir(repo)
        .args(["build", "--release", "--manifest-path", "cli/Cargo.toml"])
        .status()
        .map(|status| status.success())
        .unwrap_or(false)
}

fn proxy_key(data: &Path) -> Option<String> {
    fs::read_to_string(data.join("proxy-key")).ok().map(|text| text.trim().to_string()).filter(|text| !text.is_empty())
}

fn api_addr() -> String {
    let port = env::var("BROS_PORT").unwrap_or_else(|_| "3055".into());
    format!("127.0.0.1:{port}")
}

fn http_code(paths: &Paths, method: &str, path: &str) -> (u16, String) {
    http_code_wait(paths, method, path, 30)
}

fn http_code_wait(paths: &Paths, method: &str, path: &str, timeout_secs: u64) -> (u16, String) {
    let bearer = proxy_key(&paths.data);
    plan::http_status_for(&api_addr(), method, path, bearer.as_deref(), timeout_secs).unwrap_or((0, String::new()))
}

fn model_version_file(repo: &Path) -> std::path::PathBuf {
    repo.join("lib/apps/core/ollama/BROS_MODEL_VERSION")
}

fn fetch_packaged_model(repo: &Path, paths: &Paths) {
    let want_raw = fs::read_to_string(model_version_file(repo)).unwrap_or_default();
    let want = want_raw.trim().trim_start_matches('v').trim();
    if want.is_empty() {
        return;
    }
    let dest = paths.data.join("apps/ollama/bros-model");
    let stamp_path = dest.join(".bros-model-version");
    let have = fs::read_to_string(&stamp_path).ok();
    if !plan::model_needs_fetch(have.as_deref(), want) {
        return;
    }
    let url = format!("https://github.com/jasenmichael/bros-model/releases/download/v{want}/bros-model.tar.gz");
    let tmp = std::env::temp_dir().join(format!("bros-model-{}.tar.gz", std::process::id()));
    let _ = fs::remove_file(&tmp);
    let ok = Command::new("curl")
        .args(["-fL", "--retry", "2", "-o"])
        .arg(&tmp)
        .arg(&url)
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if !ok {
        let _ = fs::remove_file(&tmp);
        die(&format!("model release not found: {url}"));
    }
    fs::create_dir_all(&dest).unwrap_or_else(|err| die(&err.to_string()));
    for part in ["models", "ollama", "scripts"] {
        let _ = fs::remove_dir_all(dest.join(part));
    }
    let unpacked = Command::new("tar")
        .args(["-xzf"])
        .arg(&tmp)
        .arg("-C")
        .arg(&dest)
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    let _ = fs::remove_file(&tmp);
    if !unpacked {
        die("could not unpack model release");
    }
    fs::write(&stamp_path, format!("{want}\n")).unwrap_or_else(|err| die(&err.to_string()));
    say(&format!("model {want}"));
}

fn install_packaged_model(repo: &Path, paths: &Paths, dev: bool, use_runner: bool) {
    if !model_version_file(repo).is_file() {
        return;
    }
    fetch_packaged_model(repo, paths);
    let url = format!("{}/api/health", listen_url());
    if !curl_ok(&url) {
        say("Starting UI…");
        cmd_start(repo, paths, dev, use_runner, true, false);
    }
    let (code, _) = http_code_wait(paths, "GET", "/api/providers", 200);
    if !(200..300).contains(&code) {
        say(&format!(
            "warning: GET /api/providers failed ({}) — check BROS_DATA_DIR and proxy-key",
            api_unauthorized_hint(paths, code)
        ));
    }
}

fn cmd_http(paths: &Paths, method: &str, path: &str) -> ! {
    let url = format!("{}/api/health", listen_url());
    if !curl_ok(&url) {
        die("UI is not up");
    }
    let (code, body) = http_code(paths, method, path);
    if !(200..300).contains(&code) {
        die(&format!("{method} {path} returned {code}"));
    }
    if !body.trim().is_empty() {
        println!("{body}");
    }
    std::process::exit(0);
}

fn cmd_app(paths: &Paths, rest: &[String]) {
    let plan = plan::command_plan("app", rest);
    let plan::Plan::Http { method, path } = plan else {
        die("usage: bros app check|update <id>");
    };
    if rest.len() < 2 {
        die("usage: bros app check|update <id>");
    }
    cmd_http(paths, method, &path);
}

fn cmd_update(repo: &Path, paths: &Paths, dev: bool, use_runner: bool) {
    if env::var("BROS_MODEL_SETUP").ok().as_deref() == Some("1") {
        install_packaged_model(repo, paths, dev, use_runner);
        return;
    }
    if env::var("BROS_RELEASE_DONE").ok().as_deref() == Some("1") {
        install_packaged_model(repo, paths, dev, use_runner);
        say("updated");
        return;
    }
    if env::var("BROS_UPDATE_PHASE").ok().as_deref() == Some("api") {
        install_packaged_model(repo, paths, dev, use_runner);
        finish_image_update(repo, paths, dev, use_runner);
        return;
    }
    if !plan::is_source(repo) {
        release_update(repo);
    }
    git_update(repo);
    if !cargo_release(repo) {
        die("cargo build failed");
    }
    let bin = repo.join("cli/target/release/bros");
    let err = Command::new(&bin)
        .args(env::args().skip(1))
        .env("BROS_REEXEC", "1")
        .env("BROS_UPDATE_PHASE", "api")
        .exec();
    die(&format!("re-exec failed: {err}"));
}

fn finish_image_update(repo: &Path, paths: &Paths, dev: bool, use_runner: bool) {
    let url = format!("{}/api/health", listen_url());
    if !curl_ok(&url) {
        say("Starting UI…");
        cmd_start(repo, paths, dev, use_runner, true, false);
    }
    let (code, _) = http_code(paths, "POST", "/api/apps/check");
    if !(200..300).contains(&code) {
        say("Restarting UI…");
        kill_ui_listeners();
        cmd_start(repo, paths, dev, use_runner, true, false);
    }
    let (code, _) = http_code(paths, "POST", "/api/apps/rebuild");
    if !(200..300).contains(&code) {
        die(&format!("POST /api/apps/rebuild returned {code}"));
    }
    say("Image rebuilt.");
}

fn release_download_url() -> String {
    if let Ok(url) = env::var("BROS_RELEASE_URL") {
        let url = url.trim();
        if !url.is_empty() {
            return url.to_string();
        }
    }
    plan::default_release_url().unwrap_or_else(|err| die(&err))
}

fn release_update(repo: &Path) -> ! {
    let url = release_download_url();
    let tmp = repo.join(".release-next");
    let _ = fs::remove_dir_all(&tmp);
    fs::create_dir_all(&tmp).unwrap_or_else(|err| die(&err.to_string()));
    let tar = tmp.join("bros.tar.gz");
    let ok = Command::new("curl")
        .args(["-fL", "--retry", "2", "-o"])
        .arg(&tar)
        .arg(&url)
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if !ok {
        let _ = fs::remove_dir_all(&tmp);
        die(&plan::release_missing(&url));
    }
    let tree = tmp.join("tree");
    fs::create_dir_all(&tree).unwrap_or_else(|err| die(&err.to_string()));
    let unpacked = Command::new("tar")
        .args(["-xzf"])
        .arg(&tar)
        .arg("-C")
        .arg(&tree)
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    if !unpacked {
        die("could not unpack release");
    }
    if let Err(err) = plan::apply_release(repo, &tree) {
        die(&err.to_string());
    }
    if let Err(err) = plan::ensure_dotenv(repo) {
        die(&err.to_string());
    }
    let _ = fs::remove_dir_all(&tmp);
    let bin = repo.join("bros");
    let err = Command::new(&bin).args(env::args().skip(1)).env("BROS_REEXEC", "1").env("BROS_RELEASE_DONE", "1").exec();
    die(&format!("re-exec failed: {err}"));
}

fn remove_bros_bin_link(repo: &Path) {
    let Ok(bin) = env::var("BROS_BIN") else { return };
    let path = PathBuf::from(&bin);
    let Ok(meta) = fs::symlink_metadata(&path) else { return };
    if !meta.file_type().is_symlink() && !meta.is_file() {
        return;
    }
    let target = fs::canonicalize(&path).ok();
    let repo_bin = repo.join("bros");
    let repo_canon = fs::canonicalize(&repo_bin).ok();
    if target.is_some() && target != repo_canon {
        say(&format!("leaving {bin} (does not point at this install)"));
        return;
    }
    let _ = fs::remove_file(&path);
    say(&format!("Removed {bin}"));
}

fn remove_shipped_tree(repo: &Path) {
    for name in [
        "bros",
        "VERSION",
        "example.env",
        ".dockerignore",
        "uninstall.sh",
        "lib",
        "scripts",
        "docs",
        "src",
    ] {
        let path = repo.join(name);
        if !path.exists() {
            continue;
        }
        let result = if path.is_dir() {
            fs::remove_dir_all(&path)
        } else {
            fs::remove_file(&path)
        };
        if let Err(err) = result {
            say(&format!("warning: could not remove {}: {err}", path.display()));
        }
    }
}

fn cmd_uninstall(repo: &Path, paths: &Paths, rest: &[String]) {
    let purge = rest.iter().any(|a| a == "--purge");
    if plan::is_source(repo) {
        die("uninstall is for a release install, not a source checkout");
    }
    say("Stopping stack…");
    cmd_stop(paths);
    let unit = systemd_user_dir().join("bros.service");
    if unit.is_file() {
        let _ = systemd(&["disable", "--now", "bros.service"]);
        let _ = fs::remove_file(&unit);
        let _ = systemd(&["daemon-reload"]);
        say("Removed systemd --user unit bros.service");
    }
    remove_bros_bin_link(repo);
    if purge {
        say(&format!("Purging {}", repo.display()));
        if let Err(err) = fs::remove_dir_all(repo) {
            die(&format!("purge failed: {err}"));
        }
        say("Uninstalled (purged).");
        return;
    }
    remove_shipped_tree(repo);
    say(&format!(
        "Uninstalled shipped files under {}. Kept data/, .env, and bros.yml when present. Reinstall: curl -fsSL https://jasenmichael.github.io/bros/install.sh | bash",
        repo.display()
    ));
}

fn cmd_service(rest: &[String]) {
    let action = rest.first().map(String::as_str).unwrap_or("");
    let dir = systemd_user_dir();
    let unit = dir.join("bros.service");
    match action {
        "install" => {
            fs::create_dir_all(&dir).unwrap_or_else(|err| die(&err.to_string()));
            fs::write(&unit, unit_text()).unwrap_or_else(|err| die(&err.to_string()));
            systemd(&["daemon-reload"]);
            let code = systemd(&["enable", "--now", "bros.service"]);
            say(&format!("Installed {}", unit.display()));
            say("Without loginctl enable-linger, this unit stops on logout.");
            std::process::exit(code);
        }
        "uninstall" => {
            systemd(&["disable", "--now", "bros.service"]);
            let _ = fs::remove_file(&unit);
            let code = systemd(&["daemon-reload"]);
            say("Removed systemd --user unit bros.service");
            std::process::exit(code);
        }
        "status" => std::process::exit(systemd(&["status", "bros.service", "--no-pager"])),
        _ => die("unknown service action (install|uninstall|status)"),
    }
}

fn systemd_user_dir() -> PathBuf {
    if let Ok(xdg) = env::var("XDG_CONFIG_HOME") {
        if !xdg.is_empty() {
            return PathBuf::from(xdg).join("systemd/user");
        }
    }
    let home = env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join(".config/systemd/user")
}

fn unit_text() -> String {
    let bin = env::current_exe().map(|path| path.display().to_string()).unwrap_or_else(|_| "bros".into());
    let home = env::var("BROS_DIR").unwrap_or_else(|_| env::var("HOME").unwrap_or_else(|_| ".".into()));
    let data = env::var("BROS_DATA_DIR").unwrap_or_else(|_| format!("{home}/data"));
    let config = env::var("BROS_CONFIG").unwrap_or_else(|_| format!("{home}/bros.yml"));
    format!(
        "[Unit]\nDescription=Bros local AI control plane\nAfter=docker.socket\nWants=docker.socket\n\n[Service]\nType=oneshot\nRemainAfterExit=yes\nEnvironment=BROS_DIR={home}\nEnvironment=BROS_DATA_DIR={data}\nEnvironment=BROS_CONFIG={config}\nExecStart={bin} -D\nExecStop={bin} stop\n\n[Install]\nWantedBy=default.target\n"
    )
}

fn systemd(args: &[&str]) -> i32 {
    let mut cmd = Command::new("systemctl");
    cmd.arg("--user").args(args);
    cmd.status().map(|status| status.code().unwrap_or(1)).unwrap_or(1)
}

fn ensure_network() {
    let net = env::var("BROS_NETWORK").unwrap_or_else(|_| "bros".into());
    let ok = Command::new("docker")
        .args(["network", "inspect", &net])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if ok {
        return;
    }
    let _ = Command::new("docker").args(["network", "create", "--driver", "bridge", &net]).stdout(Stdio::null()).status();
}

fn ensure_volume() {
    let ok = Command::new("docker")
        .args(["volume", "inspect", "bros-x11"])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if !ok {
        let _ = Command::new("docker").args(["volume", "create", "bros-x11"]).stdout(Stdio::null()).status();
    }
}

fn remove_old_prefix() {
    let ids = ps_ids("bros-sc-");
    if ids.is_empty() {
        return;
    }
    say("Removing old bros-sc-* containers…");
    docker_status(["stop", "-t", "10"].into_iter().map(str::to_string).chain(ids.iter().cloned()));
    docker_status(["rm", "-f"].into_iter().map(str::to_string).chain(ids));
}

fn ps_ids(filter: &str) -> Vec<String> {
    let Ok(out) = Command::new("docker").args(["ps", "-aq", "--filter", &format!("name={filter}")]).output() else {
        return Vec::new();
    };
    String::from_utf8(out.stdout)
        .unwrap_or_default()
        .split_whitespace()
        .map(str::to_string)
        .collect()
}

fn stop_filter(filter: &str) {
    let ids = ps_ids(filter);
    if ids.is_empty() {
        return;
    }
    let mut stop = vec!["stop".into(), "-t".into(), "10".into()];
    stop.extend(ids.iter().cloned());
    docker_status(stop);
    let mut rm = vec!["rm".into(), "-f".into()];
    rm.extend(ids);
    docker_status(rm);
}

fn docker_status(args: impl IntoIterator<Item = impl AsRef<std::ffi::OsStr>>) {
    let mut cmd = Command::new("docker");
    cmd.args(args);
    if !VERBOSE.load(Ordering::SeqCst) {
        cmd.stdout(Stdio::null()).stderr(Stdio::null());
    }
    let _ = cmd.status();
}

fn tunnel(repo: &Path, func: &str) {
    let script = repo.join("scripts/bros-tunnel.sh");
    if !script.is_file() {
        return;
    }
    let _ = Command::new("bash")
        .args(["-c", "source \"$1\"; \"$2\"", "bros", &script.to_string_lossy(), func])
        .status();
}

fn tunnel_url(repo: &Path) -> Option<String> {
    let script = repo.join("scripts/bros-tunnel.sh");
    let out = Command::new("bash")
        .args(["-c", "source \"$1\"; bros_tunnel_advertised_url", "bros", &script.to_string_lossy()])
        .output()
        .ok()?;
    let text = String::from_utf8(out.stdout).ok()?;
    let text = text.trim();
    if text.is_empty() { None } else { Some(text.to_string()) }
}

fn kill_ui_pidfile() {
    let Ok(data) = env::var("BROS_DATA_DIR") else { return };
    let path = Path::new(&data).join("var/ui.pid");
    let Ok(text) = fs::read_to_string(&path) else {
        kill_ui_listeners();
        return;
    };
    if let Ok(pid) = text.trim().parse::<i32>() {
        kill_ui_process(pid);
    }
    let _ = fs::remove_file(path);
    kill_ui_listeners();
}

fn kill_ui_process(pid: i32) {
    if pid <= 1 {
        return;
    }
    unsafe {
        libc::kill(-pid, libc::SIGTERM);
        libc::kill(pid, libc::SIGTERM);
    }
}

fn kill_ui_listeners() {
    let port = env::var("BROS_PORT").unwrap_or_else(|_| "3055".into());
    for pid in listener_pids(&port) {
        let mut chain = vec![pid];
        let mut cur = pid;
        for _ in 0..4 {
            let Some(parent) = parent_pid(cur) else { break };
            if parent <= 1 || !is_ui_process(parent) {
                break;
            }
            chain.push(parent);
            cur = parent;
        }
        for pid in chain {
            kill_pid(pid);
        }
    }
    for _ in 0..25 {
        if listener_pids(&port).is_empty() {
            return;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    for pid in listener_pids(&port) {
        if pid > 1 {
            unsafe { libc::kill(pid, libc::SIGKILL); }
        }
    }
}

fn listener_pids(port: &str) -> Vec<i32> {
    let Ok(out) = Command::new("ss").args(["-ltnp", &format!("sport = :{port}")]).output() else {
        return Vec::new();
    };
    pids_in_ss(&String::from_utf8_lossy(&out.stdout))
}

fn pids_in_ss(text: &str) -> Vec<i32> {
    let mut pids = Vec::new();
    let mut rest = text;
    while let Some(at) = rest.find("pid=") {
        rest = &rest[at + 4..];
        let num: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(pid) = num.parse::<i32>() {
            if pid > 1 && !pids.contains(&pid) {
                pids.push(pid);
            }
        }
    }
    pids
}

fn parent_pid(pid: i32) -> Option<i32> {
    let text = fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
    let rest = text.split_once(") ")?.1;
    rest.split_whitespace().nth(1)?.parse().ok()
}

fn is_ui_process(pid: i32) -> bool {
    let cmd = fs::read(format!("/proc/{pid}/cmdline")).ok().map(|bytes| String::from_utf8_lossy(&bytes).replace('\0', " ")).unwrap_or_default();
    cmd.contains("ui/.output/server/index.mjs") || cmd.contains("@bros/ui") || (cmd.contains("pnpm") && cmd.contains("exec") && cmd.contains("node"))
}

fn kill_pid(pid: i32) {
    if pid <= 0 {
        return;
    }
    unsafe { libc::kill(pid, libc::SIGTERM); }
}

fn arm_signals() {
    let _ = ctrlc::set_handler(|| {
        let n = HITS.fetch_add(1, Ordering::SeqCst);
        DISCARD.store(true, Ordering::SeqCst);
        if n >= 1 {
            std::process::exit(130);
        }
        kill_pid(ENGINE.load(Ordering::SeqCst));
        kill_ui_process(UI_PID.load(Ordering::SeqCst));
    });
}

fn run_logged(mut cmd: Command, log: &Path) -> i32 {
    if let Some(parent) = log.parent() {
        let _ = fs::create_dir_all(parent);
    }
    cmd.stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = match cmd.spawn() {
        Ok(child) => child,
        Err(err) => {
            say(&format!("error: {err}"));
            return 1;
        }
    };
    ENGINE.store(child.id() as i32, Ordering::SeqCst);
    let verbose = VERBOSE.load(Ordering::SeqCst);
    if let Some(out) = child.stdout.take() {
        let path = log.to_path_buf();
        thread::spawn(move || drain(out, &path, verbose));
    }
    if let Some(err) = child.stderr.take() {
        let path = log.to_path_buf();
        thread::spawn(move || drain(err, &path, verbose));
    }
    let status = loop {
        if HITS.load(Ordering::SeqCst) > 0 {
            let _ = child.kill();
            let _ = child.wait();
            ENGINE.store(0, Ordering::SeqCst);
            return 130;
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(200)),
            Err(_) => {
                ENGINE.store(0, Ordering::SeqCst);
                return 1;
            }
        }
    };
    ENGINE.store(0, Ordering::SeqCst);
    status.code().unwrap_or(1)
}

fn drain(reader: impl Read, log: &Path, verbose: bool) {
    let mut lines = BufReader::new(reader);
    let mut buf = Vec::new();
    let mut file = OpenOptions::new().create(true).append(true).open(log).ok();
    loop {
        buf.clear();
        let n = match lines.read_until(b'\n', &mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        if DISCARD.load(Ordering::SeqCst) {
            continue;
        }
        if let Some(file) = file.as_mut() {
            let _ = file.write_all(&buf[..n]);
        }
        if verbose {
            let _ = std::io::stdout().write_all(&buf[..n]);
            let _ = std::io::stdout().flush();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bros_dir_defaults_to_repo() {
        assert_eq!(resolve_bros_dir("/repo", None), "/repo");
        assert_eq!(resolve_bros_dir("/repo", Some("")), "/repo");
        assert_eq!(resolve_bros_dir("/repo", Some("/opt/bros")), "/opt/bros");
    }

    #[test]
    fn data_defaults_under_bros_dir() {
        assert_eq!(data_dir_for("/opt/bros", None), "/opt/bros/data");
        assert_eq!(data_dir_for("/opt/bros", Some("/var/bros")), "/var/bros");
        assert_eq!(data_dir_for("/opt/bros", Some("$BROS_DIR/data")), "/opt/bros/data");
    }

    #[test]
    fn dotenv_strips_inline_comment() {
        assert_eq!(strip_unquoted_inline_comment("$HOME/dev/bros/data # persistent binds"), "$HOME/dev/bros/data");
        assert_eq!(strip_unquoted_inline_comment("plain"), "plain");
    }

    #[test]
    fn dotenv_expands_home_and_bros_dir() {
        env::set_var("HOME", "/home/me");
        assert_eq!(expand_dotenv_value("$HOME/dev/bros/data", None), "/home/me/dev/bros/data");
        assert_eq!(expand_dotenv_value("${HOME}/dev/bros/data", None), "/home/me/dev/bros/data");
        assert_eq!(expand_dotenv_value("~/dev/bros/data", None), "/home/me/dev/bros/data");
        assert_eq!(expand_dotenv_value("$BROS_DIR/data", Some("/opt/bros")), "/opt/bros/data");
    }

    #[test]
    fn dotenv_parse_strips_comment_then_expands_home() {
        env::set_var("HOME", "/home/me");
        assert_eq!(
            parse_dotenv_value("$HOME/dev/bros/data # persistent binds").as_deref(),
            Some("/home/me/dev/bros/data")
        );
        let resolved = parse_dotenv_value("$HOME/dev/bros/data # persistent binds").unwrap();
        assert!(host_path_problem("BROS_DATA_DIR", &resolved).is_none());
    }

    #[test]
    fn migrate_legacy_dotenv_renames_host_data_dir() {
        let next = migrate_legacy_dotenv(
            "# $BROS_HOST_DATA_DIR note\nBROS_HOST_DATA_DIR=/home/me/dev/bros/data # binds\n# BROS_HOST_WORKSPACE=$BROS_HOST_DATA_DIR/home/workspace\n",
        )
        .expect("rewrites");
        assert!(next.contains("BROS_DATA_DIR=/home/me/dev/bros/data # binds"));
        assert!(!next.contains("BROS_HOST_DATA_DIR"));
        assert!(next.contains("# $BROS_DATA_DIR note"));
        assert!(next.contains("# BROS_WORKSPACE=$BROS_DATA_DIR/home/workspace"));
        assert!(migrate_legacy_dotenv(&next).is_none());
    }

    #[test]
    fn migrate_legacy_dotenv_drops_old_when_new_exists() {
        let next = migrate_legacy_dotenv(
            "BROS_DATA_DIR=/keep\nBROS_HOST_DATA_DIR=/drop\nBROS_HOST_WORKSPACE=/ws\n",
        )
        .expect("rewrites");
        assert!(next.contains("BROS_DATA_DIR=/keep"));
        assert!(!next.contains("/drop"));
        assert!(next.contains("BROS_WORKSPACE=/ws"));
        assert!(!next.contains("BROS_HOST_"));
    }

    #[test]
    fn host_data_dir_rejects_literal_dollar_and_relative() {
        assert!(host_path_problem("BROS_DATA_DIR", "$HOME/dev/bros/data").is_some());
        assert!(host_path_problem("BROS_DATA_DIR", "/home/me/.bros/$HOME/x").is_some());
        assert!(host_path_problem("BROS_DATA_DIR", "data # bad").is_some());
        assert!(host_path_problem("BROS_DATA_DIR", "relative/data").is_some());
        assert!(host_path_problem("BROS_DATA_DIR", "/home/me/dev/bros/data").is_none());
    }

    #[test]
    fn workspace_keeps_env_and_skips_container_data() {
        assert_eq!(resolve_workspace("/app/data", Some("/keep"), Some("/yaml")).as_deref(), Some("/keep"));
        assert_eq!(resolve_workspace("/app/data", None, Some("/yaml")), None);
        assert_eq!(resolve_workspace("/data", None, None), None);
        assert_eq!(resolve_workspace("", None, None), None);
        assert_eq!(resolve_workspace("/h/data", None, Some("/work")).as_deref(), Some("/work"));
        assert_eq!(resolve_workspace("/h/data", None, Some("/app/data/home/workspace")).as_deref(), Some("/h/data/home/workspace"));
        assert_eq!(resolve_workspace("/h/data", None, None).as_deref(), Some("/h/data/home/workspace"));
    }

    #[test]
    fn dev_requires_pnpm_prod_uses_runner_without_it() {
        assert_eq!(require_dev_tools(true, false, true), Err("dev requires host pnpm"));
        assert_eq!(require_dev_tools(true, true, false), Err("dev requires host cargo"));
        assert_eq!(require_dev_tools(false, false, false), Ok(()));
        assert_eq!(choose_ui(true, true, true, false), Ok(UiHost::Host));
        assert_eq!(choose_ui(true, false, true, false), Ok(UiHost::Host));
        assert_eq!(choose_ui(true, false, false, false), Ok(UiHost::Runner));
        assert_eq!(choose_ui(false, false, true, false), Ok(UiHost::Host));
        assert_eq!(choose_ui(false, false, false, false), Ok(UiHost::Runner));
        assert_eq!(choose_ui(false, false, true, true), Ok(UiHost::Runner));
        assert_eq!(choose_ui(true, true, false, false), Err("dev requires host pnpm"));
        assert_eq!(choose_ui(true, false, true, true), Ok(UiHost::Runner));
        assert_eq!(choose_ui(true, true, true, true), Err("dev does not use the UI runner"));
        assert_eq!(choose_ui(false, true, true, false), Err("dev requires a source checkout"));
    }

    #[test]
    fn desktop_up_does_not_start_apps() {
        let dev = desktop_up_args(true);
        let prod = desktop_up_args(false);
        assert!(dev.contains(&"--no-deps"));
        assert!(prod.contains(&"--no-deps"));
        assert_eq!(dev.last(), Some(&"bros"));
        assert_eq!(prod.last(), Some(&"bros"));
        assert!(!dev.contains(&"--build"));
        assert!(prod.contains(&"--build"));
        assert!(!dev.iter().any(|a| a.contains("bros-")));
    }

    #[test]
    fn lan_addr_is_the_cidr_not_the_word_inet() {
        let text = "2: wlp2s0    inet 192.168.1.42/24 brd 192.168.1.255 scope global dynamic wlp2s0\n3: docker0    inet 172.17.0.1/16 brd 172.17.255.255 scope global docker0\n";
        assert_eq!(lan_addrs(text), vec!["192.168.1.42".to_string()]);
    }

    #[test]
    fn ss_listener_pid_is_parsed() {
        let text = "LISTEN 0 511 0.0.0.0:3055 0.0.0.0:* users:((\"node-MainThread\",pid=2546089,fd=24))\n";
        assert_eq!(pids_in_ss(text), vec![2546089]);
        assert!(pids_in_ss("no listeners").is_empty());
    }
}
