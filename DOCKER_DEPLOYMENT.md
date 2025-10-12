# Backstage Docker Deployment

This directory contains Docker configurations for running Backstage in production.

## Quick Start

1. **Copy the environment file and configure it:**

   ```bash
   cp .env.example .env
   # Edit .env with your actual values
   ```

2. **Start the services:**

   ```bash
   docker compose up -d
   ```

3. **Check the logs:**

   ```bash
   docker compose logs -f backstage
   ```

4. **Access Backstage:**
   - Open your browser to `http://localhost:7007`

## Building the Image

### Locally

```bash
docker build -t sebdanielsson/backstage:latest .
```

### Via GitHub Actions

The image is automatically built and published to GitHub Container Registry (ghcr.io) when you push to the main branch or create a version tag.

Pull the image:

```bash
docker pull ghcr.io/sebdanielsson/backstage:latest
```

## Environment Variables

Required environment variables (see `.env.example` for full list):

- `POSTGRES_USER` - PostgreSQL username
- `POSTGRES_PASSWORD` - PostgreSQL password
- `POSTGRES_DB` - PostgreSQL database name
- `AUTH_SESSION_SECRET` - Secret for session encryption
- `GITHUB_TOKEN` - GitHub Personal Access Token for integrations

## Services

### Backstage

- **Port:** 7007 (configurable via `BACKSTAGE_PORT`)
- **Image:** sebdanielsson/backstage:latest
- **Health Check:** `http://localhost:7007/healthcheck`

### PostgreSQL

- **Port:** 5432 (configurable via `POSTGRES_PORT`)
- **Image:** postgres:18.0-trixie
- **Volume:** `postgres-data` (persistent storage)

## Management Commands

### Start services

```bash
docker compose up -d
```

### Stop services

```bash
docker compose down
```

### View logs

```bash
docker compose logs -f backstage
docker compose logs -f postgres
```

### Restart a service

```bash
docker compose restart backstage
```

### Rebuild and restart

```bash
docker compose up -d --build
```

### Clean up (including volumes)

```bash
docker compose down -v
```

## Backup PostgreSQL

```bash
# Backup
docker compose exec postgres pg_dump -U backstage backstage > backup.sql

# Restore
docker compose exec -T postgres psql -U backstage backstage < backup.sql
```

## Troubleshooting

### Check service health

```bash
docker compose ps
```

### Access PostgreSQL directly

```bash
docker compose exec postgres psql -U backstage
```

### Check container logs

```bash
docker compose logs --tail=100 backstage
```

### Inspect environment variables

```bash
docker compose exec backstage env
```

## Production Considerations

1. **Secrets Management**: Use a proper secrets manager instead of `.env` files
2. **SSL/TLS**: Put Backstage behind a reverse proxy (nginx, Traefik, etc.)
3. **Monitoring**: Add monitoring and alerting
4. **Backups**: Set up automated PostgreSQL backups
5. **Resource Limits**: Configure memory and CPU limits in docker compose.yml
6. **Scaling**: Consider Kubernetes for production deployments
