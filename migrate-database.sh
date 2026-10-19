#!/bin/sh

set -eu

ROOT_DIR=$(unset CDPATH; cd -- "$(dirname -- "$0")" && pwd)
COMPOSE_FILE=${COMPOSE_FILE:-$ROOT_DIR/docker-compose.yml}
PROJECT_FILE="$ROOT_DIR/.autopwndoc-compose-project"
MONGO_CONTAINER=${MONGO_CONTAINER:-autopwndoc-mongodb}
BACKEND_CONTAINER=${BACKEND_CONTAINER:-autopwndoc-backend}
MONGO_DATA_DIR=${MONGO_DATA_DIR:-$ROOT_DIR/backend/mongo-data}
archive=

docker_exec() {
    MSYS_NO_PATHCONV=1 docker exec "$@"
}

usage() {
    echo "Usage: $0 [--archive /path/to/mongodump.archive.gz]" >&2
    exit 2
}

while [ "$#" -gt 0 ]; do
    case "$1" in
        --archive)
            [ "$#" -ge 2 ] || usage
            archive=$2
            shift 2
            ;;
        *) usage ;;
    esac
done

compose_project_from_container() {
    docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$MONGO_CONTAINER" 2>/dev/null || true
}

wait_for_mongo() {
    attempts=0
    while [ "$attempts" -lt 60 ]; do
        if docker_exec "$MONGO_CONTAINER" mongo --quiet --eval 'quit(db.adminCommand({ping:1}).ok ? 0 : 1)' >/dev/null 2>&1; then
            return 0
        fi
        attempts=$((attempts + 1))
        sleep 2
    done
    return 1
}

cd "$ROOT_DIR"
docker info >/dev/null

if [ -n "${COMPOSE_PROJECT_NAME:-}" ]; then
    project=$COMPOSE_PROJECT_NAME
elif [ -f "$PROJECT_FILE" ]; then
    project=$(tr -d '\r\n' < "$PROJECT_FILE")
else
    project=$(compose_project_from_container)
    if [ -z "$project" ]; then
        project=$(basename "$ROOT_DIR" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')
    fi
fi
[ -n "$project" ] || { echo "Unable to determine the Compose project name." >&2; exit 1; }
printf '%s\n' "$project" > "$PROJECT_FILE"

mkdir -p "$MONGO_DATA_DIR"
target_dir=$(unset CDPATH; cd -- "$MONGO_DATA_DIR" && pwd -P)
mount_type=$(docker inspect --format '{{ range .Mounts }}{{ if eq .Destination "/data/db" }}{{ .Type }}{{ end }}{{ end }}' "$MONGO_CONTAINER" 2>/dev/null || true)
mount_source=$(docker inspect --format '{{ range .Mounts }}{{ if eq .Destination "/data/db" }}{{ .Source }}{{ end }}{{ end }}' "$MONGO_CONTAINER" 2>/dev/null || true)

if [ "$mount_type" = "bind" ] && [ "$mount_source" = "$target_dir" ]; then
    echo "MongoDB already uses $target_dir"
    exit 0
fi

if find "$target_dir" -mindepth 1 -print -quit | grep -q .; then
    echo "Migration target is not empty: $target_dir" >&2
    echo "Move its contents aside or set MONGO_DATA_DIR to an empty directory before retrying." >&2
    exit 1
fi

expected_users=
if [ -z "$archive" ]; then
    expected_users=$(docker_exec "$MONGO_CONTAINER" mongo pwndoc --quiet --eval 'db.getCollection("users").countDocuments({})' | tr -d '\r' | tail -n 1)
    archive=$(sh "$ROOT_DIR/backup-database.sh")
fi

case "$archive" in
    /*) ;;
    *) archive="$ROOT_DIR/$archive" ;;
esac
[ -s "$archive" ] || { echo "Backup archive not found or empty: $archive" >&2; exit 1; }

docker stop "$BACKEND_CONTAINER" >/dev/null 2>&1 || true
docker stop "$MONGO_CONTAINER" >/dev/null 2>&1 || true

export MONGO_DATA_PATH="$target_dir"
docker compose -p "$project" -f "$COMPOSE_FILE" up -d mongodb
if ! wait_for_mongo; then
    docker logs --tail 160 "$MONGO_CONTAINER" >&2 || true
    echo "MongoDB did not become ready with bind directory $target_dir" >&2
    exit 1
fi

docker cp "$archive" "$MONGO_CONTAINER:/tmp/autopwndoc-migration.archive.gz"
docker_exec "$MONGO_CONTAINER" mongo pwndoc --quiet --eval 'printjson(db.dropDatabase())'
docker_exec "$MONGO_CONTAINER" mongorestore --archive=/tmp/autopwndoc-migration.archive.gz --gzip --nsInclude='pwndoc.*'
docker_exec "$MONGO_CONTAINER" rm -f /tmp/autopwndoc-migration.archive.gz

restored_users=$(docker_exec "$MONGO_CONTAINER" mongo pwndoc --quiet --eval 'db.getCollection("users").countDocuments({})' | tr -d '\r' | tail -n 1)
if [ "$restored_users" -eq 0 ] 2>/dev/null; then
    echo "Restore verification failed: no users were restored. Backend remains stopped." >&2
    exit 1
fi
if [ -n "$expected_users" ] && [ "$restored_users" != "$expected_users" ]; then
    echo "Restore verification failed: expected $expected_users users, found $restored_users. Backend remains stopped." >&2
    exit 1
fi

echo "Database migration complete: $restored_users users restored to $target_dir"
echo "Start the application with: docker compose -p $project up -d --build --remove-orphans"
