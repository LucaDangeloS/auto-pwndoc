#!/bin/sh

set -eu

ROOT_DIR=$(unset CDPATH; cd -- "$(dirname -- "$0")" && pwd)
BACKUP_DIR=${BACKUP_DIR:-$ROOT_DIR/backend/backups}
MONGO_CONTAINER=${MONGO_CONTAINER:-autopwndoc-mongodb}

docker_exec() {
    MSYS_NO_PATHCONV=1 docker exec "$@"
}

cd "$ROOT_DIR"
docker info >/dev/null

running=$(docker inspect --format '{{.State.Running}}' "$MONGO_CONTAINER" 2>/dev/null || true)
if [ "$running" != "true" ]; then
    echo "MongoDB container '$MONGO_CONTAINER' is not running." >&2
    exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
filename="autopwndoc-$timestamp.archive.gz"
container_archive="/tmp/$filename"
host_archive="$BACKUP_DIR/$filename"

user_count=$(docker_exec "$MONGO_CONTAINER" mongo pwndoc --quiet --eval 'db.getCollection("users").countDocuments({})' | tr -d '\r' | tail -n 1)
echo "Creating logical MongoDB backup ($user_count users): $host_archive" >&2

docker_exec "$MONGO_CONTAINER" mongodump --db pwndoc --archive="$container_archive" --gzip >&2
docker cp "$MONGO_CONTAINER:$container_archive" "$host_archive" >&2
docker_exec "$MONGO_CONTAINER" rm -f "$container_archive"
chmod 600 "$host_archive" 2>/dev/null || true

if [ ! -s "$host_archive" ]; then
    echo "Backup archive is empty." >&2
    exit 1
fi

echo "$host_archive"
