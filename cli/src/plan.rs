use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
use std::process::{Command, Output};
use std::time::Duration;

pub const RELEASE_URL: &str = "https://github.com/jasenmichael/bros/releases/latest/download/bros.tar.gz";

#[derive(Debug, PartialEq, Eq)]
pub enum Plan {
    Http { method: &'static str, path: String },
    DockerExec,
    Systemd,
    Supervise,
    Stop,
}

pub fn is_source(repo: &Path) -> bool {
    repo.join("cli/Cargo.toml").is_file()
}

pub fn command_plan(command: &str, rest: &[String]) -> Plan {
    match command {
        "check" => Plan::Http { method: "POST", path: "/api/apps/check".into() },
        "update" | "upgrade" => Plan::Http { method: "POST", path: "/api/apps/rebuild".into() },
        "write-apps-compose" => Plan::Http { method: "POST", path: "/api/apps/compose".into() },
        "shell" | "run" => Plan::DockerExec,
        "service" => Plan::Systemd,
        "stop" => Plan::Stop,
        "app" => {
            let id = rest.get(1).map(String::as_str).unwrap_or("");
            match rest.first().map(String::as_str) {
                Some("check") => Plan::Http { method: "GET", path: format!("/api/apps/{id}/update") },
                _ => Plan::Http { method: "POST", path: format!("/api/apps/{id}/update") },
            }
        }
        _ => Plan::Supervise,
    }
}

pub fn needs_rebuild(source: bool, main_newer: bool) -> bool {
    source && main_newer
}

pub fn apply_release(dest: &Path, staging: &Path) -> std::io::Result<()> {
    for entry in fs::read_dir(staging)? {
        let entry = entry?;
        if entry.file_name() == "data" {
            continue;
        }
        replace_entry(&entry.path(), &dest.join(entry.file_name()))?;
    }
    Ok(())
}

fn replace_entry(from: &Path, to: &Path) -> std::io::Result<()> {
    let name = to.file_name().unwrap_or_default().to_string_lossy();
    let tmp = to.with_file_name(format!(".{name}.new"));
    if tmp.is_dir() {
        fs::remove_dir_all(&tmp)?;
    } else if tmp.symlink_metadata().is_ok() {
        fs::remove_file(&tmp)?;
    }
    copy_tree(from, &tmp)?;
    if to.is_dir() && !to.is_symlink() {
        fs::remove_dir_all(to)?;
    } else if to.symlink_metadata().is_ok() {
        fs::remove_file(to)?;
    }
    fs::rename(&tmp, to)
}

fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    if from.is_dir() {
        fs::create_dir_all(to)?;
        for entry in fs::read_dir(from)? {
            let entry = entry?;
            copy_tree(&entry.path(), &to.join(entry.file_name()))?;
        }
        return Ok(());
    }
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::copy(from, to).map(|_| ())
}

pub fn release_missing(url: &str) -> String {
    format!("release not found: {url}\nInstall from source: install.sh --from-src")
}

pub fn http_status(addr: &str, method: &str, path: &str, bearer: Option<&str>) -> Result<(u16, String), String> {
    let mut stream = TcpStream::connect(addr).map_err(|err| err.to_string())?;
    stream.set_read_timeout(Some(Duration::from_secs(30))).ok();
    let auth = bearer.map(|token| format!("Authorization: Bearer {token}\r\n")).unwrap_or_default();
    let req = format!("{method} {path} HTTP/1.1\r\nHost: {addr}\r\n{auth}Content-Length: 0\r\nConnection: close\r\n\r\n");
    stream.write_all(req.as_bytes()).map_err(|err| err.to_string())?;
    let mut buf = String::new();
    stream.read_to_string(&mut buf).map_err(|err| err.to_string())?;
    let (head, body) = buf.split_once("\r\n\r\n").unwrap_or((buf.as_str(), ""));
    let line = head.lines().next().unwrap_or("");
    let code = line.split_whitespace().nth(1).and_then(|code| code.parse().ok()).ok_or_else(|| buf.clone())?;
    Ok((code, decode_body(head, body)))
}

fn decode_body(head: &str, body: &str) -> String {
    if !head.to_ascii_lowercase().contains("transfer-encoding: chunked") {
        return body.to_string();
    }
    // ponytail: one chunked body, no extensions or trailers
    let mut out = String::new();
    let mut rest = body;
    loop {
        let Some((size, next)) = rest.split_once("\r\n") else { break };
        let Ok(n) = usize::from_str_radix(size.trim().split(';').next().unwrap_or(""), 16) else { break };
        if n == 0 { break }
        if next.len() < n { break }
        out.push_str(&next[..n]);
        rest = next[n..].strip_prefix("\r\n").unwrap_or(&next[n..]);
    }
    out
}

#[cfg_attr(not(test), allow(dead_code))]
pub fn docker_output(args: &[String]) -> std::io::Result<Output> {
    Command::new("docker").args(args).output()
}

pub fn docker_exec_args(tty: bool, command: &[String]) -> Vec<String> {
    let mut args = vec!["exec".into(), if tty { "-it".into() } else { "-T".into() }, "bros".into()];
    args.extend(command.iter().cloned());
    args
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{BufRead, BufReader, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn command_plan_splits_http_exec_and_systemd() {
        assert_eq!(command_plan("check", &[]), Plan::Http { method: "POST", path: "/api/apps/check".into() });
        assert_eq!(command_plan("update", &[]), Plan::Http { method: "POST", path: "/api/apps/rebuild".into() });
        assert_eq!(command_plan("upgrade", &[]), Plan::Http { method: "POST", path: "/api/apps/rebuild".into() });
        assert_eq!(
            command_plan("app", &["check".into(), "pi".into()]),
            Plan::Http { method: "GET", path: "/api/apps/pi/update".into() },
        );
        assert_eq!(
            command_plan("app", &["update".into(), "pi".into()]),
            Plan::Http { method: "POST", path: "/api/apps/pi/update".into() },
        );
        assert_eq!(command_plan("write-apps-compose", &[]), Plan::Http { method: "POST", path: "/api/apps/compose".into() });
        assert_eq!(command_plan("shell", &[]), Plan::DockerExec);
        assert_eq!(command_plan("run", &["agent".into()]), Plan::DockerExec);
        assert_eq!(command_plan("service", &["install".into()]), Plan::Systemd);
        assert_eq!(command_plan("start", &[]), Plan::Supervise);
        assert_eq!(command_plan("stop", &[]), Plan::Stop);
        assert_ne!(command_plan("start", &[]), Plan::Http { method: "POST", path: "/api/apps/compose".into() });
    }

    #[test]
    fn rebuild_only_when_source_main_is_newer() {
        assert!(needs_rebuild(true, true));
        assert!(!needs_rebuild(true, false));
        assert!(!needs_rebuild(false, true));
        assert!(!needs_rebuild(false, false));
    }

    #[test]
    fn release_apply_keeps_data_bytes() {
        let root = std::env::temp_dir().join(format!("bros-rel-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        let dest = root.join("dest");
        let staging = root.join("staging");
        fs::create_dir_all(dest.join("data")).unwrap();
        fs::write(dest.join("data/keep"), "same").unwrap();
        fs::write(dest.join("bros"), "old").unwrap();
        fs::create_dir_all(staging.join("data")).unwrap();
        fs::write(staging.join("data/keep"), "nope").unwrap();
        fs::write(staging.join("bros"), "new").unwrap();
        apply_release(&dest, &staging).unwrap();
        assert_eq!(fs::read_to_string(dest.join("data/keep")).unwrap(), "same");
        assert_eq!(fs::read_to_string(dest.join("bros")).unwrap(), "new");
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn http_hits_the_paths_on_localhost() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap();
        let paths = [
            "/api/health",
            "/api/apps/check",
            "/api/apps/rebuild",
            "/api/apps/pi/update",
            "/api/apps/compose",
        ];
        let server = thread::spawn(move || {
            for _ in 0..6 {
                let (mut sock, _) = listener.accept().unwrap();
                let mut lines = BufReader::new(sock.try_clone().unwrap());
                let mut req = String::new();
                lines.read_line(&mut req).unwrap();
                let mut throw = String::new();
                loop {
                    throw.clear();
                    if lines.read_line(&mut throw).unwrap() <= 2 {
                        break;
                    }
                }
                let path = req.split_whitespace().nth(1).unwrap().to_string();
                assert!(paths.contains(&path.as_str()), "{path}");
                sock.write_all(b"HTTP/1.1 204 No Content\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").unwrap();
            }
        });
        let addr = format!("{}:{}", addr.ip(), addr.port());
        for (method, path) in [
            ("GET", "/api/health"),
            ("POST", "/api/apps/check"),
            ("POST", "/api/apps/rebuild"),
            ("GET", "/api/apps/pi/update"),
            ("POST", "/api/apps/pi/update"),
            ("POST", "/api/apps/compose"),
        ] {
            assert_eq!(http_status(&addr, method, path, None).unwrap().0, 204, "{method} {path}");
        }
        server.join().unwrap();
    }

    #[test]
    fn docker_run_and_compose_fixture() {
        let info = Command::new("docker").arg("info").output().expect("docker");
        assert!(info.status.success(), "docker info failed: {}", String::from_utf8_lossy(&info.stderr));
        let ran = docker_output(&["run".into(), "--rm".into(), "--entrypoint".into(), "echo".into(), "bros:latest".into(), "hi".into()]).unwrap();
        assert!(ran.status.success(), "{}", String::from_utf8_lossy(&ran.stderr));
        assert_eq!(String::from_utf8_lossy(&ran.stdout).trim(), "hi");
        let dir = std::env::temp_dir().join(format!("bros-compose-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("compose.yml"), "services:\n  one:\n    image: bros:latest\n    entrypoint: [\"echo\", \"one\"]\n").unwrap();
        let up = Command::new("docker")
            .args(["compose", "-f", "compose.yml", "run", "--rm", "one"])
            .current_dir(&dir)
            .output()
            .unwrap();
        assert!(up.status.success(), "{}", String::from_utf8_lossy(&up.stderr));
        assert!(String::from_utf8_lossy(&up.stdout).contains("one"));
        let _ = fs::remove_dir_all(&dir);
    }
}
