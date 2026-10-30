#!/bin/bash
# Print gap words and exit 1 until Selkies, ttyd, XWayland, and labwc answer.
gaps=
tcp() {
  timeout 2 bash -c "echo >/dev/tcp/127.0.0.1/$1" >/dev/null 2>&1
}
tcp 3000 || gaps="${gaps:+$gaps }selkies"
tcp 7681 || gaps="${gaps:+$gaps }ttyd"
[ -S /tmp/.X11-unix/X0 ] || gaps="${gaps:+$gaps }x11"
[ -S /home/bros/.XDG/wayland-0 ] || gaps="${gaps:+$gaps }wayland"
printf '%s' "$gaps"
[ -z "$gaps" ]
