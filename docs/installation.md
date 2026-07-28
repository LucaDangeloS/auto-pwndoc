# Installation

AutoPwnDoc uses six services in development: backend, frontend, reverse proxy, MongoDB, ChromaDB, and LanguageTool.

## Production

All production services can be run from the repository root.

!> For production usage make sure to change the certificates in `backend/ssl` folder and optionnaly to set the JWT secret in `backend/src/lib/auth.js` (`jwtSecret` and `jwtRefreshSecret` in `backend/src/config/config.json`) if you don't want to use random ones.

Build and run Docker containers

```
docker compose up -d --build
```

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
docker compose down
git pull
docker compose up -d --build
```

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

It's possible, even recommended, to regularly backup the `mongo-data` volume. It contains all the database.

Find the location of the volume on the disk:

```
sudo docker inspect pwndoc-ng_mongo-data
[
    {
        "CreatedAt": "2022-09-18T19:11:42+02:00",
        "Driver": "local",
        "Labels": {
            "com.docker.compose.project": "pwndoc-ng",
            "com.docker.compose.version": "2.11.0",
            "com.docker.compose.volume": "mongo-data"
        },
        "Mountpoint": "/var/lib/docker/volumes/pwndoc-ng_mongo-data/_data",
        "Name": "pwndoc-ng_mongo-data",
        "Options": null,
        "Scope": "local"
    }
]
```

To restore :

- Stop containers
- Replace the current `mongo-data` volume with the backed up one
- Start containers
