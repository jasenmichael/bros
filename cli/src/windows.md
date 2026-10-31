# Windows `bros.exe`

Not in the current release. This note is the implementation spec. Linux and macOS behavior stays as it is when the new environment variables below are unset.

**bros** is the CLI. A working Windows build means `bros.exe` with no arguments (start) and `bros.exe stop` on 64-bit Windows. The UI host is container `bros-ui`. The browser app is `http://127.0.0.1:3055`. Desktop is still the Linux container `bros` (Wayland), running in Docker Desktop's WSL2 engine.

Out of scope: Windows arm64, `bros --dev`, `bros service`, a host `pnpm` UI host, and GPU docker apps. GPU stays optional. Start must succeed with no GPU.

## What the user installs

Bros does not turn on WSL and does not install Docker. The install script checks and exits with the command or the link. The user needs:

- Windows 10 or 11, 64-bit (`AMD64` only)
- WSL2 turned on
- Docker Desktop running, Linux container engine (WSL2 backend). `docker` on `PATH`. Compose v2 ships with Docker Desktop.
- Windows `tar.exe` (present on supported Windows 10 and 11)

`docker info --format "{{.OSType}}"` must print `linux`. Output `windows` means Docker Desktop is in Windows-container mode. Desktop and the UI host will not start in that mode.

## Why it does not compile today

`cli/src/main.rs` imports `std::os::unix::process::CommandExt` at the top of the file. These calls are Unix-only and fail the `x86_64-pc-windows-msvc` build:

| Site | Call | Role |
| --- | --- | --- |
| `spawn_ui` | `pre_exec` + `libc::setsid` | UI host process group |
| `kill_ui_process`, `kill_ui_listeners`, `kill_pid` | `libc::kill` | stop and Ctrl+C |
| `maybe_rebuild`, `cmd_update`, `release_update` | `Command::exec` | replace the process after a rebuild or unpack |
| `parent_pid`, `is_ui_process` | read `/proc/<pid>/stat` and `/proc/<pid>/cmdline` | find the host UI host |
| `listener_pids` | `ss -ltnp` | find the process on `BROS_PORT` |

`cli/src/plan.rs` `release_asset_name` returns an error for every OS other than `linux` and `darwin`. `scripts/pack-release.sh` rejects any target other than the four Linux and macOS triples, and it always stages the binary as `bros` (no `.exe`).

`libc` itself is already a dependency. The Unix symbols must sit behind `#[cfg(unix)]`.

## What still fails after a compile-only port

A release tree has no `cli/Cargo.toml`. `choose_ui` then selects container `bros-ui`, so start does not need a host Node process. These host calls still run on every start and will fail or pass bad paths to Compose:

- `on_path` runs `sh -c "command -v <bin>"`. cmd.exe and PowerShell have no `sh`. `preflight_docker` then reports that Docker is missing when `docker.exe` is on `PATH`.
- `curl_ok` runs `curl -o /dev/null`. Windows `curl.exe` must write to `NUL`. Prefer `plan::http_status_for` and drop the `curl` process.
- `release_update` downloads with `curl` and unpacks with `tar`. Both exist on supported Windows. It then re-execs `repo.join("bros")`. The file name is `bros.exe`, and `exec` does not exist. Spawn that process and exit.
- `id -u` and `getent group docker` are absent. The existing fallbacks (user id `1000`, Docker group id `0`) are enough for `PUID`, `PGID`, and `BROS_DOCKER_GID` inside the Linux image. Keep them. Change the warning text so it does not mention only `/var/run/docker.sock`.
- `lan_urls` runs `ip -4 addr`. Missing `ip` already returns an empty list. The browser app still opens on `127.0.0.1`.
- `HOME` is often unset. Use `USERPROFILE`.
- Compose treats `\` as an escape. Write every path that enters the Compose environment with forward slashes (`C:/Users/...`).
- `lib/desktop/docker-compose.yml` bind-mounts `$BROS_HOST_REPO` at that same path, and bind-mounts `$BROS_HOST_HOME_BIND` at that same path. `C:\Users\me` is not a path inside a Linux container, so `docker compose up` fails.
- The same file bind-mounts `/var/run/docker.sock` from the host. From Docker Desktop that source must be `//var/run/docker.sock` so the engine inside WSL2 sees its socket. The container target stays `/var/run/docker.sock`. `bros-ui` has the same mount. `lib/apps/core/ollama/docker-compose.yml` bind-mounts the host home at `/host-home` and has the same source problem.

`scripts/bros-tunnel.sh` is bash. `tunnel()` already ignores a failed `bash`. The host tunnel stays off when bash is absent. Do not block start on it.

Ctrl+C uses the `ctrlc` crate, which works on Windows. The handler must not call `libc::kill`. It sets the stop flag. `finish_stop` then stops containers with `docker`. On Windows the kill helpers are empty.

## Code changes

`cli/src/main.rs`

- Put the `CommandExt` import, `pre_exec` / `setsid`, `libc::kill`, `ss`, and `/proc` reads behind `#[cfg(unix)]`. Windows kill helpers return without doing work.
- Replace the three `.exec()` sites with a small helper: Unix keeps `exec`. Windows `spawn`s and `std::process::exit`s with the child status.
- `on_path` walks `PATH` and `PATHEXT` (`.exe` included). No `sh`.
- Health checks call `plan::http_status_for`. No `curl`, no `/dev/null`.
- Home directory: `HOME`, else `USERPROFILE`.
- Binary path: `bros` plus `std::env::consts::EXE_SUFFIX` (`bros.exe` on Windows, `bros` elsewhere). `release_update` re-execs that name. `BROS_BIN` defaults to `std::env::current_exe()` on Windows.
- Before Compose runs, rewrite Windows paths in the environment to forward slashes.
- `bros --dev` on Windows exits with one line: dev needs a Linux or macOS host.
- `cmd_service` on Windows exits before any systemd call: `bros service` is a Linux systemd user unit. Start Docker Desktop and run `bros.exe`.

`cli/src/plan.rs`

- `release_asset_name("windows" | "Windows", "x86_64" | "amd64")` returns `bros-windows-amd64.tar.gz`.
- Add helpers the CLI calls before Compose, so the tests do not need a Windows machine:
  - container repo path: `/bros/repo` on Windows, otherwise the host repo path
  - home volume source: user profile on Windows, otherwise `BROS_HOST_HOME_BIND`
  - socket source: `//var/run/docker.sock` on Windows, otherwise `/var/run/docker.sock`
  - forward-slash conversion for `C:\...`

Compose. Unset variables keep today's Linux mounts.

- `lib/desktop/docker-compose.yml`: repo volume source is the host path. The target and the container environment `BROS_HOST_REPO` are `${BROS_CONTAINER_REPO:-${BROS_HOST_REPO}}`. Windows sets `BROS_CONTAINER_REPO=/bros/repo`.
- Home volume source is `${BROS_HOST_HOME_SOURCE:-${BROS_HOST_HOME_BIND}}` mounted at `/host-home`. Windows sets the source to the user profile. Container code keeps using `/host-home`.
- Move the same-path home bind (`$HOME:$HOME` on both sides) into a compose file that `compose_args` adds only on Unix. Leaving it in the base file makes Windows `docker compose up` fail.
- Socket source is `${BROS_DOCKER_SOCK:-/var/run/docker.sock}`. Windows sets `BROS_DOCKER_SOCK=//var/run/docker.sock`. Target stays `/var/run/docker.sock`. Apply that to service `bros` and service `bros-ui`.
- `lib/apps/core/ollama/docker-compose.yml` home source uses `BROS_HOST_HOME_SOURCE` with the same fallback.

Preflight text on Windows only:

- `docker` missing: `Install Docker Desktop, turn on the WSL2 engine, start Docker, and retry. https://docs.docker.com/desktop/setup/install/windows-install/`
- `docker info` fails: `Start Docker Desktop and retry.`
- `OSType` is `windows`: `Switch Docker Desktop to Linux containers and retry.`

Linux preflight text stays.

Release packing, when a Windows asset is built:

- Target `x86_64-pc-windows-msvc` on a `windows-latest` runner. The runner already has the Microsoft C toolchain. Rustup adds the target. Pack with Git Bash (`bash scripts/pack-release.sh`). The UI artifact is the same prebuilt `app/ui/.output` as the other archives.
- `scripts/pack-release.sh` accepts that target. Cargo writes `cli/target/<triple>/release/bros.exe`. Stage it as `bros.exe`. Other targets stay staged as `bros`.
- Asset name `bros-windows-amd64.tar.gz` plus `.sha256`.

`scripts/install.sh` stays bash and keeps rejecting Windows. Git Bash is not the Windows install path. See the script below.

Docs to update in the same change: `SPEC.md` (Windows start needs Docker Desktop with the WSL2 engine; dev and `bros service` stay Linux), `docs/install.md`, `docs/cli.md`, `docs/desktop.md` (on Windows the repo mount inside Desktop and `bros-ui` is `/bros/repo`).

Tests, all on the Linux dev machine:

- `release_asset_name("windows", "x86_64")` equals `bros-windows-amd64.tar.gz`. `arm64` on Windows is still an error.
- The compose helper: a `C:\Users\me\bros` repo becomes forward slashes, container repo `/bros/repo`, home source is the profile, socket `//var/run/docker.sock`, and the same-path compose file is absent from the Windows `-f` list.
- Unix inputs leave container repo, home source, and socket on the existing values, and the same-path file stays in the `-f` list.

## Install script

A script is required for the same install `install.sh` does on Linux: download, unpack, `.env`, and a `bros` command on `PATH`. Unpacking the tar by hand still starts Bros after the code changes above, if the user runs `bros.exe` from that directory and Docker Desktop is already up. Hand unpack does not put `bros` on `PATH` and does not check WSL2.

Do not extend `install.sh`. Symlinks into `~/.local/bin` need Developer Mode or an elevated process, and cmd.exe will not run a file named `bros` with no extension (`PATHEXT` is `.COM;.EXE;.BAT;.CMD`).

Add `scripts/install.ps1`, copied into website `public/` beside `install.sh` on docs build. One command:

```powershell
irm https://jasenmichael.github.io/bros/install.ps1 | iex
```

The script does not enable Windows features, does not install Docker, does not clone the repo, and does not build with cargo. `--from-src` and a service install do not exist on Windows. Dev and `bros service` stay Linux.

Environment, matching the bash script where it still applies:

| Name | Default | Meaning |
| --- | --- | --- |
| `BROS_DIR` | `%USERPROFILE%\.bros` | Install directory. `BROS_DIR` is an alias when `BROS_DIR` is unset. |
| `BROS_RELEASE_URL` | latest `bros-windows-amd64.tar.gz` | Exact archive URL. |
| `BROS_BIN` | `%USERPROFILE%\.bros\bros.exe` | No separate symlink. The user `PATH` gains `BROS_DIR`. |

Steps, in order. Each failure prints one line and exits `1`.

1. Refuse a non-64-bit process and refuse `PROCESSOR_ARCHITECTURE` other than `AMD64`. Arm64 is unsupported.
2. WSL2. Run `wsl.exe --status`. Success and a default version of 2 continues. Any other result prints both lines and exits. Do not run them.
   - `wsl --install` (Administrator, then reboot)
   - Install Docker Desktop: `https://docs.docker.com/desktop/setup/install/windows-install/`
3. `Get-Command docker`. Missing: same Docker Desktop link, exit.
4. `docker info`. Failure: `Start Docker Desktop and retry.`
5. `docker info --format "{{.OSType}}"`. Value `linux` continues. Value `windows`: `Switch Docker Desktop to Linux containers and retry.`
6. `docker compose version`. Failure: Docker Desktop is too old or the Compose plugin is disabled. Point at the same install page.
7. If `BROS_DIR` contains a `.git` directory, exit. That directory is a source checkout. Windows has no `--from-src`.
8. Download the archive and `bros-windows-amd64.tar.gz.sha256` to a temp directory. Verify with `Get-FileHash -Algorithm SHA256`. Mismatch deletes the temp directory and exits.
9. `tar.exe -xzf` into `BROS_DIR`. `tar.exe` lives at `$env:SystemRoot\System32\tar.exe`. Do not depend on Git Bash tar.
10. If `example.env` exists and `.env` does not, copy it.
11. Confirm `Join-Path $BROS_DIR 'bros.exe'` exists.
12. User `PATH`: read `[Environment]::GetEnvironmentVariable('Path','User')`. If `BROS_DIR` is absent, append it and write back with `SetEnvironmentVariable`. Do not call `setx` (it truncates at 1024 characters). The current process does not see the new user `PATH` until a new terminal opens. Say that.
13. Print the install directory and the next commands: open a new terminal, start Docker Desktop if it is not running, run `bros`. `bros` with no arguments starts. `bros stop` stops. Do not print `bros service`.

Update the Pages install docs with that `irm` line and the dependency list from the top of this note. Leave the bash one-liner as the Linux and macOS install.
