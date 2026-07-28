# Backend development

*Source code can be modified live and application will automatically reload on changes.*

Build and run Docker containers
```
docker compose -f ../docker-compose-dev.yml up -d --build
```

Display container logs
```
docker compose -f ../docker-compose-dev.yml logs -f backend
```

Stop/Start container
```
docker compose -f ../docker-compose-dev.yml stop backend
docker compose -f ../docker-compose-dev.yml start backend
```

Use the proxy entry point during development: http://localhost:8080/api.
