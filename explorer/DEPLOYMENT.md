# Mallchain Explorer - Production Deployment Guide

This guide covers deploying the Mallchain Explorer to production environments.

## Pre-Deployment Checklist

### Security
- [ ] SSL/TLS certificates ready
- [ ] Database passwords set to strong values
- [ ] API authentication configured
- [ ] CORS origins restricted
- [ ] Rate limiting configured
- [ ] Database backups tested
- [ ] Network firewalls configured
- [ ] DDoS protection enabled

### Infrastructure
- [ ] Production servers provisioned
- [ ] PostgreSQL database configured
- [ ] RPC node running and accessible
- [ ] DNS records created
- [ ] Load balancer configured (if needed)
- [ ] Monitoring tools installed
- [ ] Log aggregation setup
- [ ] Backup storage available

### Code
- [ ] All tests passing
- [ ] Code review completed
- [ ] Dependencies updated
- [ ] Security audit passed
- [ ] Performance profiling done
- [ ] Documentation updated
- [ ] Environment variables documented
- [ ] Version tagged in git

---

## Deployment Options

### Option 1: Docker Deployment (Recommended)

#### Prerequisites
- Docker 20.10+
- Docker Compose 1.29+
- Production server(s)

#### Docker Setup

1. **Create Dockerfile for Explorer**

```dockerfile
# explorer/backend/Dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose ports
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start server
CMD ["npm", "start"]
```

2. **Create Dockerfile for Indexer**

```dockerfile
# explorer/backend/Dockerfile.indexer
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

CMD ["npm", "run", "indexer"]
```

3. **Docker Compose**

```yaml
# docker-compose.prod.yml
version: '3.8'

services:
  db:
    image: postgres:15-alpine
    container_name: mallscan-db
    environment:
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
      POSTGRES_DB: ${DB_NAME}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - mallscan
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  api:
    build:
      context: ./explorer/backend
      dockerfile: Dockerfile
    container_name: mallscan-api
    environment:
      NODE_ENV: production
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_HOST: db
      DB_PORT: 5432
      DB_NAME: ${DB_NAME}
      RPC_URL: ${RPC_URL}
      EXPLORER_API_PORT: 5000
      FRONTEND_URL: ${FRONTEND_URL}
    ports:
      - "5000:5000"
    depends_on:
      db:
        condition: service_healthy
    networks:
      - mallscan
    restart: unless-stopped
    volumes:
      - ./logs/api:/app/logs

  indexer:
    build:
      context: ./explorer/backend
      dockerfile: Dockerfile.indexer
    container_name: mallscan-indexer
    environment:
      NODE_ENV: production
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_HOST: db
      DB_PORT: 5432
      DB_NAME: ${DB_NAME}
      RPC_URL: ${RPC_URL}
    depends_on:
      db:
        condition: service_healthy
    networks:
      - mallscan
    restart: unless-stopped
    volumes:
      - ./logs/indexer:/app/logs

volumes:
  postgres_data:

networks:
  mallscan:
    driver: bridge
```

4. **Deploy with Docker Compose**

```bash
# Create .env.prod file
cp explorer/backend/.env.example .env.prod

# Edit .env.prod with production values
nano .env.prod

# Initialize database
docker-compose -f docker-compose.prod.yml run api npm run init-db

# Start services
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f api
docker-compose -f docker-compose.prod.yml logs -f indexer
```

### Option 2: VPS/Dedicated Server

#### Prerequisites
- Ubuntu 20.04 LTS or similar
- SSH access
- Sudo privileges
- 2GB+ RAM, 50GB+ disk

#### Setup Steps

1. **Update System**

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential
```

2. **Install Node.js**

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

3. **Install PostgreSQL**

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql

# Create database
sudo -u postgres psql << EOF
CREATE DATABASE mallscan;
CREATE USER mallscan WITH PASSWORD 'STRONG_PASSWORD_HERE';
ALTER ROLE mallscan SET client_encoding TO 'utf8';
ALTER ROLE mallscan SET default_transaction_isolation TO 'read committed';
GRANT ALL PRIVILEGES ON DATABASE mallscan TO mallscan;
EOF
```

4. **Setup Explorer Application**

```bash
cd /opt
sudo git clone https://github.com/mallchain/explorer.git mallscan
cd mallscan/explorer/backend

# Create .env
sudo cp .env.example .env
sudo nano .env
# Set production variables

# Install dependencies
npm install

# Initialize database
npm run init-db
```

5. **Setup Systemd Services**

```bash
# Create API service
sudo tee /etc/systemd/system/mallscan-api.service > /dev/null << EOF
[Unit]
Description=Mallchain Explorer API
After=network.target

[Service]
Type=simple
User=mallscan
WorkingDirectory=/opt/mallscan/explorer/backend
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Create indexer service
sudo tee /etc/systemd/system/mallscan-indexer.service > /dev/null << EOF
[Unit]
Description=Mallchain Explorer Indexer
After=network.target

[Service]
Type=simple
User=mallscan
WorkingDirectory=/opt/mallscan/explorer/backend
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node indexer.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

# Enable and start services
sudo systemctl daemon-reload
sudo systemctl enable mallscan-api mallscan-indexer
sudo systemctl start mallscan-api mallscan-indexer
```

6. **Setup Nginx Reverse Proxy**

```bash
sudo apt install -y nginx

# Create Nginx config
sudo tee /etc/nginx/sites-available/explorer.conf > /dev/null << 'EOF'
server {
    listen 80;
    server_name explorer.mallchain.com;

    # Redirect to HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name explorer.mallchain.com;

    ssl_certificate /etc/letsencrypt/live/explorer.mallchain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/explorer.mallchain.com/privkey.pem;

    # API Proxy
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
    }

    # Socket.io Proxy
    location /socket.io {
        proxy_pass http://localhost:5000/socket.io;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
EOF

# Enable site
sudo ln -s /etc/nginx/sites-available/explorer.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

7. **Setup SSL with Let's Encrypt**

```bash
sudo apt install -y certbot python3-certbot-nginx

sudo certbot certonly --nginx -d explorer.mallchain.com \
  -d api.explorer.mallchain.com

# Auto-renewal
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

### Option 3: Cloud Platform Deployment

#### AWS Deployment

1. **RDS for PostgreSQL**
   - Create RDS instance (db.t3.small recommended)
   - Enable Multi-AZ for high availability
   - Enable automated backups (30-day retention)

2. **EC2 for Application**
   - Launch EC2 instance (t3.medium or larger)
   - Use security groups to restrict access
   - Attach Elastic IP for consistent IP

3. **ALB for Load Balancing**
   - Create Application Load Balancer
   - Configure target groups
   - Setup health checks

4. **CloudFront for CDN**
   - Distribute static assets
   - Cache API responses (with TTL)
   - Enable compression

#### Google Cloud Deployment

1. **Cloud SQL for PostgreSQL**
   - Create Cloud SQL instance
   - Enable automated backups
   - Configure SSL connections

2. **Compute Engine for Application**
   - Create VM instance (e2-medium)
   - Install required packages
   - Configure firewall rules

3. **Load Balancer**
   - Create HTTP(S) Load Balancer
   - Configure backend services
   - Enable Cloud Armor for DDoS

#### Azure Deployment

1. **Azure Database for PostgreSQL**
   - Create managed database
   - Enable server parameters optimization
   - Configure SSL enforcement

2. **App Service for Application**
   - Create App Service Plan
   - Deploy using Git integration
   - Configure application settings

3. **Application Gateway**
   - Create gateway
   - Configure backend pools
   - Setup WAF rules

---

## Post-Deployment Configuration

### Database Optimization

```sql
-- Run after deployment
ANALYZE;
VACUUM ANALYZE;

-- Monitor table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Performance Tuning

Edit `/etc/postgresql/13/main/postgresql.conf`:

```conf
# Memory
shared_buffers = 256MB
effective_cache_size = 1GB
maintenance_work_mem = 64MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100

# Connection
max_connections = 200
```

### Monitoring Setup

1. **Install Prometheus**

```bash
docker run -d \
  -p 9090:9090 \
  -v /etc/prometheus:/etc/prometheus \
  prom/prometheus
```

2. **Install Grafana**

```bash
docker run -d \
  -p 3000:3000 \
  grafana/grafana
```

3. **Export Metrics**

Add to `explorer/backend/server.js`:

```javascript
const prometheus = require('prom-client');
const register = new prometheus.Registry();

// Track metrics
const httpRequestDuration = new prometheus.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  registers: [register]
});
```

---

## Monitoring & Maintenance

### Daily Tasks
- Check API logs for errors
- Monitor disk space usage
- Verify database connections
- Check RPC connectivity

### Weekly Tasks
- Review performance metrics
- Analyze slow queries
- Check backup integrity
- Review security logs

### Monthly Tasks
- Database maintenance (VACUUM, ANALYZE)
- PostgreSQL log rotation
- Update dependencies
- Security patches

### Monitoring Queries

```bash
# Check indexer progress
curl -s http://localhost:5000/api/explorer/stats | jq .

# Check database size
psql -U mallscan -d mallscan -c \
  "SELECT pg_size_pretty(pg_database_size('mallscan'))"

# Monitor active connections
psql -U mallscan -d mallscan -c \
  "SELECT count(*) FROM pg_stat_activity"
```

---

## Backup & Recovery

### Database Backup

```bash
# Full backup
pg_dump -U mallscan -d mallscan > backup_$(date +%Y%m%d).sql

# Compressed backup
pg_dump -U mallscan -d mallscan | gzip > backup_$(date +%Y%m%d).sql.gz

# Continuous archiving
# Set in postgresql.conf:
# archive_mode = on
# archive_command = 'test ! -f /path/to/wal_archive/%f && cp %p /path/to/wal_archive/%f'
```

### Database Recovery

```bash
# Restore from backup
psql -U mallscan -d mallscan < backup_20260519.sql

# Restore from compressed backup
gunzip -c backup_20260519.sql.gz | psql -U mallscan -d mallscan
```

---

## Scaling Strategies

### Phase 1: Single Server (0-1M blocks)
- Single PostgreSQL instance
- Single API server
- Single indexer
- Suitable for: Small networks

### Phase 2: Dedicated Database (1M-10M blocks)
- Separate database server
- API behind load balancer
- Read replicas for queries
- Suitable for: Growing networks

### Phase 3: Distributed System (10M+ blocks)
- PostgreSQL cluster
- Multiple API servers
- Separate indexer cluster
- Redis cache layer
- Suitable for: Large networks

---

## Troubleshooting

### Indexer Stuck

```bash
# Check latest block
curl http://localhost:5000/api/explorer/stats | jq '.data.latest_block_height'

# Check database
psql -U mallscan -d mallscan -c "SELECT MAX(height) FROM blocks"

# Restart if needed
sudo systemctl restart mallscan-indexer
```

### High Memory Usage

```bash
# Check process memory
ps aux | grep node

# Check database connections
psql -U mallscan -d mallscan -c "SELECT count(*) FROM pg_stat_activity WHERE state = 'active'"
```

### Database Performance

```bash
# Find slow queries
SELECT query, calls, mean_exec_time 
FROM pg_stat_statements 
ORDER BY mean_exec_time DESC 
LIMIT 10;
```

---

## Security Hardening

1. **Firewall Rules**
   - Only expose ports 80, 443
   - Restrict database port to application server
   - Use security groups

2. **SSL/TLS**
   - Use strong ciphers
   - Enable HSTS
   - Certificate monitoring

3. **Database Security**
   - Use SSL for connections
   - Strong passwords
   - Regular backups
   - Access control lists

4. **Application Security**
   - Rate limiting on API
   - Input validation
   - CORS configuration
   - Security headers

---

## Disaster Recovery

### RPO/RTO Targets
- **RPO (Recovery Point Objective):** < 1 hour
- **RTO (Recovery Time Objective):** < 30 minutes

### Backup Strategy
- Daily database dumps
- Off-site storage
- Monthly full backup
- Weekly incremental backup

### Failover Procedure
1. Promote read replica
2. Update DNS records
3. Verify data integrity
4. Resume indexing

---

## Success Metrics

- ✅ API response time < 200ms
- ✅ 99.9% uptime
- ✅ Indexing lag < 5 minutes
- ✅ Database query performance < 100ms
- ✅ Zero data loss
- ✅ Sub-second page loads

