#!/usr/bin/env bash
# Write the Bros product version and commit it on the current branch.
# Does not push.
#
#   scripts/bump.sh patch|minor|major
#   scripts/bump.sh --self-check
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

next_version() {
  python3 - "$1" "$2" <<'PY'
import sys
cur, kind = sys.argv[1], sys.argv[2]
parts = cur.split(".")
if len(parts) != 3 or any(not p.isdigit() for p in parts):
    raise SystemExit(f"VERSION is not X.Y.Z: {cur}")
major, minor, patch = (int(p) for p in parts)
if kind == "major":
    # Stay on 0.x until an intentional 1.0.0; feat! while major==0 bumps minor.
    if major == 0:
        minor, patch = minor + 1, 0
    else:
        major, minor, patch = major + 1, 0, 0
elif kind == "minor":
    minor, patch = minor + 1, 0
elif kind == "patch":
    patch += 1
else:
    raise SystemExit(f"unknown bump: {kind}")
print(f"{major}.{minor}.{patch}")
PY
}

write_versions() {
  python3 - "$1" <<'PY'
import pathlib, re, sys
version = sys.argv[1]
files = [
    "cli/Cargo.toml",
    "src/package.json",
    "src/ui/package.json",
    "src/website/package.json",
    "src/layers/theme/package.json",
    "src/layers/docs/package.json",
]

def set_package_json(path: pathlib.Path) -> None:
    text = path.read_text()
    nl = "\r\n" if "\r\n" in text else "\n"
    lines = text.splitlines(keepends=True)
    key_indent = "  "
    for line in lines:
        match = re.match(r'^([ \t]+)"[^"]+"\s*:', line)
        if match:
            key_indent = match.group(1)
            break
    replaced = False
    out = []
    for line in lines:
        match = re.match(r'^' + re.escape(key_indent) + r'"version"\s*:\s*"[^"]*"', line)
        if match and not replaced:
            out.append(f'{key_indent}"version": "{version}"{line[match.end():]}')
            replaced = True
        else:
            out.append(line)
    if replaced:
        path.write_text("".join(out))
        return
    if not text.lstrip().startswith("{"):
        raise SystemExit(f"{path} does not start with an object")
    prefix, rest = text.split("{", 1)
    if rest.startswith(nl):
        rest = rest[len(nl):]
    comma = "" if rest.lstrip().startswith("}") else ","
    path.write_text(prefix + "{" + nl + f'{key_indent}"version": "{version}"{comma}' + nl + rest)

def set_cargo_package(path: pathlib.Path) -> None:
    lines = path.read_text().splitlines(keepends=True)
    in_package = False
    replaced = False
    out = []
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("[") and stripped.endswith("]"):
            in_package = stripped == "[package]"
        if in_package and not replaced:
            match = re.match(r'^version\s*=\s*"[^"]*"', line)
            if match:
                out.append(f'version = "{version}"{line[match.end():]}')
                replaced = True
                continue
        out.append(line)
    if not replaced:
        raise SystemExit(f"no [package] version in {path}")
    path.write_text("".join(out))

def set_cargo_lock(path: pathlib.Path) -> None:
    text = path.read_text()
    new, n = re.subn(
        r'(\[\[package\]\]\nname = "bros"\nversion = ")[^"]+(")',
        rf'\g<1>{version}\2',
        text,
        count=1,
    )
    if n != 1:
        raise SystemExit(f"no bros package version in {path}")
    path.write_text(new)

pathlib.Path("VERSION").write_text(version + "\n")
for rel in files:
    path = pathlib.Path(rel)
    if path.name == "Cargo.toml":
        set_cargo_package(path)
    else:
        set_package_json(path)
lock = pathlib.Path("cli/Cargo.lock")
if lock.is_file():
    set_cargo_lock(lock)
PY
}

commit_bump() {
  local msg="$1"
  shift
  git add "$@"
  if git diff --cached --quiet; then
    printf 'nothing to commit\n' >&2
    exit 1
  fi
  if git config user.name >/dev/null 2>&1 && git config user.email >/dev/null 2>&1; then
    git commit -m "$msg"
  else
    git -c user.name="$(git log -1 --format='%an')" -c user.email="$(git log -1 --format='%ae')" commit -m "$msg"
  fi
}

case "${1:-}" in
  --self-check)
    [[ "$(next_version 0.0.1 patch)" == "0.0.2" ]]
    [[ "$(next_version 0.0.1 minor)" == "0.1.0" ]]
    [[ "$(next_version 0.0.6 major)" == "0.1.0" ]]
    [[ "$(next_version 0.1.3 major)" == "0.2.0" ]]
    [[ "$(next_version 1.2.3 major)" == "2.0.0" ]]
    printf 'self-check ok\n' >&2
    ;;
  patch|minor|major)
    cur="$(tr -d '[:space:]' < VERSION)"
    next="$(next_version "$cur" "$1")"
    write_versions "$next"
    commit_bump "chore: bump $1 to $next" \
      VERSION \
      cli/Cargo.toml \
      cli/Cargo.lock \
      src/package.json \
      src/ui/package.json \
      src/website/package.json \
      src/layers/theme/package.json \
      src/layers/docs/package.json
    printf '%s\n' "$next"
    ;;
  *)
    printf 'usage: scripts/bump.sh patch|minor|major\n' >&2
    exit 2
    ;;
esac
