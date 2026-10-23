#!/bin/sh
set -eu
export HOME=/home/bros
export PATH="$HOME/.local/bin:$PATH"
if [ ! -x "$HOME/.local/bin/paperclipai" ]; then
  npx --registry https://registry.npmjs.org paperclipai@latest install --yes
fi
if [ ! -d "$HOME/.paperclip/instances" ]; then
  paperclipai onboard --yes --bind lan
fi
exec paperclipai run
