# Installation

AutoPwnDoc uses six services in development: backend, frontend, reverse proxy, MongoDB, ChromaDB, and LanguageTool.

## Production

All production services can be run from the repository root.

!> For production usage make sure to change the certificates in `backend/ssl` folder and optionnaly to set the JWT secret in `backend/src/lib/auth.js` (`jwtSecret` and `jwtRefreshSecret` in `backend/src/config/config.json`) if you don't want to use random ones.

Build and run Docker containers

```
mkdir -p backend/mongo-data backend/backups
docker compose up -d --build
```

Production MongoDB data lives in `backend/mongo-data`. It is a host bind mount,
not a Compose-managed volume, so it remains the same database if the checkout is
renamed, the Compose project name changes, or `docker compose down -v` is run.
Keep this directory on a native Linux filesystem and protect it like any other
production database directory.

Display backend container logs

```
docker compose logs -f backend
```

Stop/Start containers

```
docker compose stop
docker compose start
```

Remove containers

```
docker compose down
```

Update

```
sh ./update-production.sh
```

The update script creates a timestamped logical database backup under
`backend/backups/`, pulls with fast-forward-only semantics, verifies the bind
mount, and waits for migration-aware backend health. On the first update from a
legacy named-volume installation it automatically invokes
`migrate-database.sh`, restores the backup into `backend/mongo-data`, and checks
the restored user count before the backend can start.

The backend applies pending, idempotent database migrations before it becomes
healthy. If a migration fails, it remains unhealthy and restarts instead of
serving against a partially upgraded schema. The MongoDB directory is not
removed by `docker compose down -v`; the ChromaDB index volume is disposable and
will be rebuilt from MongoDB if removed.

### One-time migration from a named volume

The updater performs this automatically. To run it independently while the old
MongoDB container is still running:

```bash
sh ./migrate-database.sh
docker compose up -d --build --remove-orphans
```

The migration creates a logical backup first, requires an empty
`backend/mongo-data` destination, stops the backend, restores the database, and
refuses to continue if no users or an unexpected number of users are restored.
An existing archive can be used with
`sh ./migrate-database.sh --archive backend/backups/FILE.archive.gz`.

Application is accessible through https://localhost:8443
API is accessible through https://localhost:8443/api

## Development

Use the root development Compose file. It runs the full local stack and watches backend and frontend sources.

> *Source code can be modified live and application will automatically reload on changes.*

Build and run the development stack

```
docker compose -f docker-compose-dev.yml up -d --build
```

Display backend container logs

```
docker compose -f docker-compose-dev.yml logs -f backend
```

Stop/Start container

```
docker compose -f docker-compose-dev.yml stop
docker compose -f docker-compose-dev.yml start
```

Remove containers

```
docker compose -f docker-compose-dev.yml down
```

After pulling development changes, run the build command above again. The
backend and frontend startup commands refresh their persistent dependency
volumes automatically, so new packages do not require deleting volumes.

Application is available at http://localhost:8080 (or https://localhost:8443).
The API is available at http://localhost:8080/api.

## Tests

> For now only backend tests have been written (it's a continuous work in progress)

Test files are located in `backend/tests` using Jest testing framework

Script `run_tests.sh` at the root folder can be used to launch tests :

```
Usage:        ./run_tests.sh -q|-f [-h, --help]

Options:
  -h, --help  Display help
  -q          Run quick tests (No build)
  -f          Run full tests (Build with no cache)
```

!> **Don't use it in production as it will delete the production Database**

## Backup

Use a logical MongoDB archive rather than copying WiredTiger files from Docker's
`_data` directory. A raw copy can be inconsistent if MongoDB was running and a
folder copied into the repository is not automatically mounted by Compose.

Create a backup while the stack is running:

```
sh ./backup-database.sh
```

The script writes a compressed, timestamped `mongodump` archive to
`backend/backups/` and prints its absolute path. Back up both
`backend/mongo-data` and `backend/backups` outside the server according to the
organization's retention policy. The logical archive is the portable recovery
artifact; do not copy live WiredTiger files as the only backup.

Restore an archive only after making a backup of the current database:

```bash
docker compose stop backend
docker cp backend/backups/autopwndoc.archive.gz \
  autopwndoc-mongodb:/tmp/autopwndoc.archive.gz
docker exec autopwndoc-mongodb mongo pwndoc \
  --quiet --eval 'printjson(db.dropDatabase())'
docker exec autopwndoc-mongodb mongorestore \
  --archive=/tmp/autopwndoc.archive.gz \
  --gzip \
  --nsInclude='pwndoc.*'
docker compose up -d backend
docker compose logs --since 5m backend
```

If an update appears to have lost all users, do not reset passwords. Confirm
that the container is using the ground-truth directory:

```bash
docker inspect autopwndoc-mongodb \
  --format '{{ range .Mounts }}{{ if eq .Destination "/data/db" }}{{ .Type }} {{ .Source }}{{ end }}{{ end }}'
```

The result must be a `bind` mount ending in `backend/mongo-data`. Never run
`db.dropDatabase()` or restore an archive without first taking a current backup.
