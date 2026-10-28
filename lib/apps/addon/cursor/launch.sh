#!/bin/sh
# shortcut: only agent/version/help stay on the deb CLI, other subcommands open the GUI
case "${1:-}" in
  agent|-v|--version|-h|--help) exec /usr/bin/cursor "$@" ;;
esac
if [ -t 1 ]; then
  /usr/share/cursor/cursor --no-sandbox "$@" >/dev/null 2>&1 &
  exit 0
fi
exec /usr/share/cursor/cursor --no-sandbox "$@"
