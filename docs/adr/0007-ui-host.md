# 0007. UI host outside the desktop

## Status

Accepted. Supersedes the host-Node rejection in [0005](0005-one-bros-container.md).

## Decision

The UI host is the Node process that serves the browser app. It is not a process in the desktop container.

Dev requires host `pnpm` and `cargo` and always runs the UI on the host. Prod requires Docker. Prod uses host `pnpm` for the UI when it is on `PATH`, otherwise container `bros-ui`.

The CLI is a Rust binary. It starts and stops the desktop, the UI, and docker apps. After `/api/health` it calls the API. A desktop recreate does not restart docker apps unless a shared volume host path changed.

Selkies and ttyd publish on `127.0.0.1` high ports. The UI host listens on `BROS_PORT`.
