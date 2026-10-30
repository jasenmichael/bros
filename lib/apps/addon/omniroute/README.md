# OmniRoute

Addon docker app. Image `diegosouzapw/omniroute:3.8.52`. Dashboard and `/v1` listen on container port 20128. Published host port is `${BROS_OMNIROUTE_PORT:-20128}`. Redis is `omniroute-redis` on network `bros` and has no host port.

`OMNIROUTE_JWT_SECRET` lives in `$BROS_HOST_DATA_DIR/apps/omniroute/.env`, not in this pack directory. Provider keys, combos, and compression are not in this pack. Set them in the OmniRoute dashboard.
