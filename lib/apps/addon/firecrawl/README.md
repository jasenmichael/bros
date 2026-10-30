# Firecrawl data

Host files for this pack live under `$BROS_HOST_DATA_DIR/apps/firecrawl/`. Three directories.

## Directories

| Directory | Compose service | Container path | User |
| --- | --- | --- | --- |
| `redis` | `redis` | `/data` | host uid (`${BROS_HOST_UID}:${BROS_HOST_GID}`) |
| `rabbitmq` | `rabbitmq` | `/var/lib/rabbitmq` | root (`0:0`) |
| `postgres` | `nuq-postgres` | `/var/lib/postgresql/data` | root (`0:0`) |

`playwright-service` and the API service `firecrawl` have no data directories. Both stay on the host uid.

## Compose mapping

- `${BROS_HOST_DATA_DIR}/apps/firecrawl/redis` → `/data`
- `${BROS_HOST_DATA_DIR}/apps/firecrawl/rabbitmq` → `/var/lib/rabbitmq`
- `${BROS_HOST_DATA_DIR}/apps/firecrawl/postgres` → `/var/lib/postgresql/data`
