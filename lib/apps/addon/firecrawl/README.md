# Firecrawl data

Host files for this pack live under `$BROS_DATA_DIR/apps/firecrawl/`. Three directories.

## Directories

| Directory | Compose service | Container path | User |
| --- | --- | --- | --- |
| `redis` | `redis` | `/data` | host uid (`${BROS_HOST_UID}:${BROS_HOST_GID}`) |
| `rabbitmq` | `rabbitmq` (`hostname: firecrawl-rabbit`) | `/var/lib/rabbitmq` | root (`0:0`) |
| `postgres` | `nuq-postgres` | `/var/lib/postgresql/data` | root (`0:0`) |

`playwright-service` and the API service `firecrawl` have no data directories. Both stay on the host uid.

## Compose mapping

- `${BROS_DATA_DIR}/apps/firecrawl/redis` → `/data`
- `${BROS_DATA_DIR}/apps/firecrawl/rabbitmq` → `/var/lib/rabbitmq`
- `${BROS_DATA_DIR}/apps/firecrawl/postgres` → `/var/lib/postgresql/data`

RabbitMQ keeps a fixed hostname so mnesia survives recreates. If healthcheck sticks after a recreate, wipe `$BROS_DATA_DIR/apps/firecrawl/rabbitmq` and Start again.
