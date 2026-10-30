# One Bros container

The HTTP server and the Selkies session share container `bros`. Image and Compose service use that same name. Host port `BROS_PORT` (3055) is the server. The stream stays on container port 3000 with no host publish. ttyd stays on container port 7681. `/desktop` and `/terminal` proxy to `127.0.0.1` in that container.

Ollama and Whisper stay their own images. A docker app stays its own Compose project. Folding those into the Selkies image would mix a GPU overlay and optional services into the desktop OS.

The server uses the Node baked into the image so it can listen before Devbox, Nix, and the desktop Node exist. Those three stay the ensure path for the desktop user. The CLI stays a Docker launcher. It does not need Node.

Rejected: a host Node process beside a desktop container, and a stock webtop image that draws on the host display.
