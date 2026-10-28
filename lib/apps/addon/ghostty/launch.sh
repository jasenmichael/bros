#!/bin/sh
# shortcut: no GPU, so this Nix build uses system Mesa llvmpipe. Drop this if /dev/dri appears.
real=/home/bros/.local/share/devbox/global/default/.devbox/nix/profile/default/bin/ghostty
[ -x "$real" ] || exit 127
deps=/home/bros/.local/lib/ghostty-mesa
mkdir -p "$deps"
ldd /usr/lib/x86_64-linux-gnu/libEGL_mesa.so.0 2>/dev/null | awk '/=> \// { print $3 }' | while read -r p; do
  b=${p##*/}
  case "$b" in
    libc.so.*|libm.so.*|libgcc_s.so.*|ld-linux-*) continue ;;
  esac
  ln -sfn "$p" "$deps/$b"
done
printf '%s\n' '{"file_format_version":"1.0.0","ICD":{"library_path":"/usr/lib/x86_64-linux-gnu/libEGL_mesa.so.0"}}' > /home/bros/.local/lib/ghostty-mesa.json
export LIBGL_ALWAYS_SOFTWARE=1
export LIBGL_DRIVERS_PATH=/usr/lib/x86_64-linux-gnu/dri
export LD_LIBRARY_PATH="$deps${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
export __EGL_VENDOR_LIBRARY_FILENAMES=/home/bros/.local/lib/ghostty-mesa.json
exec "$real" "$@"
