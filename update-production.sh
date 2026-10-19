#!/bin/sh

set -eu

ROOT_DIR=$(unset CDPATH; cd -- "$(dirname -- "$0")" && pwd)
PROJECT_FILE="$ROOT_DIR/.autopwndoc-compose-project"
MONGO_CONTAINER=${MONGO_CONTAINER:-autopwndoc-mongodb}
BACKEND_CONTAINER=${BACKEND_CONTAINER:-autopwndoc-backend}
MONGO_DATA_DIR=${MONGO_DATA_DIR:-$ROOT_DIR/backend/mongo-data}

compose_project_from_container() {
    docker inspect --format '{{ index .Config.Labels "com.docker.compose.project" }}' "$MONGO_CONTAINER" 2>/dev/null || true
}

wait_for_backend() {
    attempts=0
    while [ "$attempts" -lt 60 ]; do
        status=$(docker inspect --format '{{ if .State.Health }}{{ .State.Health.Status }}{{ else }}{{ .State.Status }}{{ end }}' "$BACKEND_CONTAINER" 2>/dev/null || true)
        [ "$status" = "healthy" ] && return 0
        if [ "$status" = "unhealthy" ] || [ "$status" = "exited" ]; then return 1; fi
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

mount_type=$(docker inspect --format '{{ range .Mounts }}{{ if eq .Destination "/data/db" }}{{ .Type }}{{ end }}{{ end }}' "$MONGO_CONTAINER" 2>/dev/null || true)
[ -n "$mount_type" ] || { echo "MongoDB must be running before an update." >&2; exit 1; }

host_archive=$(sh "$ROOT_DIR/backup-database.sh")
git pull --ff-only

mkdir -p "$MONGO_DATA_DIR"
target_dir=$(unset CDPATH; cd -- "$MONGO_DATA_DIR" && pwd -P)
mount_source=$(docker inspect --format '{{ range .Mounts }}{{ if eq .Destination "/data/db" }}{{ .Source }}{{ end }}{{ end }}' "$MONGO_CONTAINER" 2>/dev/null || true)
if [ "$mount_type" != "bind" ] || [ "$mount_source" != "$target_dir" ]; then
    COMPOSE_PROJECT_NAME="$project" MONGO_DATA_DIR="$target_dir" sh "$ROOT_DIR/migrate-database.sh" --archive "$host_archive"
fi

export MONGO_DATA_PATH="$target_dir"
docker compose -p "$project" up -d --build --remove-orphans

after_type=$(docker inspect --format '{{ range .Mounts }}{{ if eq .Destination "/data/db" }}{{ .Type }}{{ end }}{{ end }}' "$MONGO_CONTAINER")
after_source=$(docker inspect --format '{{ range .Mounts }}{{ if eq .Destination "/data/db" }}{{ .Source }}{{ end }}{{ end }}' "$MONGO_CONTAINER")
if [ "$after_type" != "bind" ] || [ "$after_source" != "$target_dir" ]; then
    docker stop "$BACKEND_CONTAINER" >/dev/null 2>&1 || true
    echo "MongoDB is not using the ground-truth directory $target_dir. Backend was stopped." >&2
    exit 1
fi

if ! wait_for_backend; then
    echo "The backend did not become healthy after the update. Database migrations may have failed." >&2
    docker compose -p "$project" logs --since 5m backend
    exit 1
fi

docker compose -p "$project" ps
docker compose -p "$project" logs --since 5m backend
echo "Update complete. Database directory: $after_source"
echo "Pre-update backup: $host_archive"
