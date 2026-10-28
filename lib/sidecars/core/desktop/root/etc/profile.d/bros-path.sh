# Sidecar CLI wrappers. Package bins come from the Devbox hook in the Desktop home.
export PATH="/home/bros/.local/sidecar-bins:${PATH}"
# No GPU in this container. Do not set LD_LIBRARY_PATH here; that breaks Nix glibc.
export LIBGL_ALWAYS_SOFTWARE=1
