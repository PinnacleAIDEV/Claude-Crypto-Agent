#!/bin/bash

# 🚀 CRYPTO FLOW - AUTOMATED DEPLOYMENT SCRIPT
# Run this script on your DigitalOcean droplet

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
PROJECT_DIR="/opt/crypto-flow"
GITHUB_REPO="your-github-username/crypto-flow"  # Update this
DOMAIN="your-domain.com"  # Update this
EMAIL="your-email@domain.com"  # Update this for SSL

echo -e "${CYAN}🚀 CRYPTO FLOW DEPLOYMENT SCRIPT${NC}"
echo -e "${CYAN}===================================${NC}"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}❌ This script must be run as root${NC}" 
   exit 1
fi

# Function to print step headers
print_step() {
    echo -e "\n${BLUE}📋 $1${NC}"
    echo "----------------------------------------"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Generate secure password
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

print_step "STEP 1: System Updates and Dependencies"

# Update system
apt update && apt upgrade -y

# Install essential packages
apt install -y curl wget git vim htop unzip software-properties-common \
    apt-transport-https ca-certificates gnupg lsb-release ufw fail2ban

echo -e "${GREEN}✅ System updated and essential packages installed${NC}"

print_step "STEP 2: Install Docker"

if ! command_exists docker; then
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg

    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null

    # Install Docker
    apt update
    apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    # Start and enable Docker
    systemctl start docker
    systemctl enable docker

    echo -e "${GREEN}✅ Docker installed successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Docker already installed${NC}"
fi

print_step "STEP 3: Install Docker Compose"

if ! command_exists docker-compose; then
    # Install Docker Compose
    DOCKER_COMPOSE_VERSION="v2.21.0"
    curl -L "https://github.com/docker/compose/releases/download/${DOCKER_COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose

    # Create symlink for convenience
    ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose

    echo -e "${GREEN}✅ Docker Compose installed successfully${NC}"
else
    echo -e "${YELLOW}⚠️  Docker Compose already installed${NC}"
fi

print_step "STEP 4: Install Node.js"

if ! command_exists node; then
    # Install Node.js 20.x
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs

    echo -e "${GREEN}✅ Node.js $(node --version) installed${NC}"
else
    echo -e "${YELLOW}⚠️  Node.js already installed: $(node --version)${NC}"
fi

print_step "STEP 5: Configure Firewall"

# Configure UFW
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow essential ports
ufw allow 22/tcp      # SSH
ufw allow 80/tcp      # HTTP
ufw allow 443/tcp     # HTTPS

# Development ports (remove in production)
ufw allow 3000/tcp    # API
ufw allow 3001/tcp    # WebSocket
ufw allow 5432/tcp    # PostgreSQL (for external access if needed)

# Enable firewall
ufw --force enable

echo -e "${GREEN}✅ Firewall configured${NC}"

print_step "STEP 6: Create Project Structure"

# Create project directory
mkdir -p $PROJECT_DIR
cd $PROJECT_DIR

# Create directory structure
mkdir -p {backend/src,frontend/dist,nginx/conf.d,scripts,logs,ssl,config,monitoring,services/{data-collector,analytics}}

echo -e "${GREEN}✅ Project structure created at $PROJECT_DIR${NC}"

print_step "STEP 7: Generate Environment Variables"

# Generate secure database password
DB_PASSWORD=$(generate_password)

# Create .env file
cat > .env << EOF
# Database Configuration
DB_PASSWORD=$DB_PASSWORD
DB_HOST=postgres
DB_PORT=5432
DB_NAME=crypto_flow
DB_USER=crypto_user

# Redis Configuration
REDIS_URL=redis://redis:6379

# Binance API (Add your keys here)
BINANCE_API_KEY=
BINANCE_SECRET=

# Application Configuration
NODE_ENV=production
PORT=3000
WS_PORT=3001
LOG_LEVEL=info

# Monitoring (optional)
GRAFANA_PASSWORD=$(generate_password)

# Domain Configuration
DOMAIN=$DOMAIN
EMAIL=$EMAIL
EOF

echo -e "${GREEN}✅ Environment variables generated${NC}"
echo -e "${YELLOW}📝 Database password: $DB_PASSWORD${NC}"

print_step "STEP 8: Create Docker Files"

# Create backend Dockerfile
cat > backend/Dockerfile << 'EOF'
FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Create logs directory
RUN mkdir -p logs

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Expose ports
EXPOSE 3000 3001

# Start application
CMD ["npm", "start"]
EOF

# Create backend package.json
cat > backend/package.json << 'EOF'
{
  "name": "crypto-flow-backend",
  "version": "1.0.0",
  "description": "Crypto Flow Real-time Backend",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "dev": "nodemon src/server.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "socket.io": "^4.7.2",
    "ws": "^8.14.2",
    "pg": "^8.11.3",
    "redis": "^4.6.8",
    "cors": "^2.8.5",
    "helmet": "^7.0.0",
    "morgan": "^1.10.0",
    "dotenv": "^16.3.1",
    "node-cron": "^3.0.2"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
EOF

echo -e "${GREEN}✅ Docker files created${NC}"

print_step "STEP 9: Create Nginx Configuration"

# Create main nginx.conf
cat > nginx/nginx.conf << 'EOF'
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log notice;
pid /var/run/nginx.pid;

events {
    worker_connections 2048;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for"';
    access_log /var/log/nginx/access.log main;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;
    client_max_body_size 10M;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript 
               application/javascript application/xml+rss 
               application/json application/xml;

    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=ws:10m rate=5r/s;

    # Upstream servers
    upstream backend {
        server backend:3000 max_fails=3 fail_timeout=30s;
    }

    upstream websocket {
        server backend:3001 max_fails=3 fail_timeout=30s;
    }

    # Include server configurations
    include /etc/nginx/conf.d/*.conf;
}
EOF

# Create server configuration
cat > nginx/conf.d/crypto-flow.conf << 'EOF'
server {
    listen 80;
    server_name _;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: ws: wss: data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors 'self';" always;

    # Frontend - Serve static files
    location / {
        root /usr/share/nginx/html;
        index index.html;
        try_files $uri $uri/ /index.html;
        
        # Cache static assets
        location ~* \.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }

    # API Routes
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }

    # WebSocket
    location /socket.io/ {
        limit_req zone=ws burst=10 nodelay;
        
        proxy_pass http://websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket timeouts
        proxy_connect_timeout 7d;
        proxy_send_timeout 7d;
        proxy_read_timeout 7d;
    }

    # Health check
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

echo -e "${GREEN}✅ Nginx configuration created${NC}"

print_step "STEP 10: Create Database Initialization Scripts"

# Create database initialization script
cat > scripts/init.sql << 'EOF'
-- Create database and user (if not exists)
CREATE DATABASE crypto_flow;
CREATE USER crypto_user WITH PASSWORD 'PLACEHOLDER_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE crypto_flow TO crypto_user;

-- Connect to the database
\c crypto_flow;

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO crypto_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO crypto_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO crypto_user;

-- Create tables
CREATE TABLE IF NOT EXISTS trades (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol VARCHAR(20) NOT NULL,
    price DECIMAL(20,8) NOT NULL,
    volume DECIMAL(20,8) NOT NULL,
    side VARCHAR(4) NOT NULL,
    exchange VARCHAR(20) NOT NULL DEFAULT 'binance',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS liquidations (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol VARCHAR(20) NOT NULL,
    side VARCHAR(5) NOT NULL,
    amount DECIMAL(20,8) NOT NULL,
    price DECIMAL(20,8) NOT NULL,
    leverage INTEGER,
    exchange VARCHAR(20) NOT NULL DEFAULT 'binance',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS volume_data (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol VARCHAR(20) NOT NULL,
    volume_1m DECIMAL(20,8),
    volume_5m DECIMAL(20,8),
    volume_15m DECIMAL(20,8),
    volume_1h DECIMAL(20,8),
    avg_volume DECIMAL(20,8),
    relative_volume DECIMAL(8,4),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS climactic_moves (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    symbol VARCHAR(20) NOT NULL,
    price_change_percent DECIMAL(8,4) NOT NULL,
    volume_spike DECIMAL(8,4) NOT NULL,
    timeframe VARCHAR(5) NOT NULL,
    exchange VARCHAR(20) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
EOF

# Create indexes script
cat > scripts/indexes.sql << 'EOF'
-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_trades_symbol_timestamp ON trades(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_liquidations_symbol_timestamp ON liquidations(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_liquidations_amount ON liquidations(amount DESC);
CREATE INDEX IF NOT EXISTS idx_liquidations_timestamp ON liquidations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_volume_symbol_timestamp ON volume_data(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_climactic_symbol_timestamp ON climactic_moves(symbol, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_climactic_change ON climactic_moves(price_change_percent DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_liquidations_amount_timestamp ON liquidations(amount DESC, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_symbol_side_timestamp ON trades(symbol, side, timestamp DESC);
EOF

echo -e "${GREEN}✅ Database scripts created${NC}"

print_step "STEP 11: Create Frontend Files"

# Create a simple index.html for testing
cat > frontend/dist/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Crypto Flow Dashboard</title>
    <style>
        body {
            margin: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: linear-gradient(135deg, #1e1e2e, #2d2d44);
            color: white;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            text-align: center;
            padding: 40px;
            border-radius: 20px;
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        h1 {
            font-size: 3rem;
            margin-bottom: 20px;
            background: linear-gradient(45deg, #00d4ff, #7b68ee);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .status {
            font-size: 1.2rem;
            margin: 20px 0;
        }
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: #00d4ff;
            animation: spin 1s ease-in-out infinite;
            margin-left: 10px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .info {
            margin-top: 30px;
            font-size: 0.9rem;
            opacity: 0.8;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 Crypto Flow</h1>
        <div class="status">
            Initializing Dashboard<span class="loading"></span>
        </div>
        <div class="info">
            <p>Real-time crypto & options flow analysis</p>
            <p>Backend Status: <span id="backend-status">Checking...</span></p>
            <p>WebSocket: <span id="ws-status">Connecting...</span></p>
        </div>
    </div>

    <script>
        // Check backend health
        fetch('/api/health')
            .then(response => response.json())
            .then(data => {
                document.getElementById('backend-status').textContent = '✅ Online';
                document.getElementById('backend-status').style.color = '#00ff88';
            })
            .catch(error => {
                document.getElementById('backend-status').textContent = '❌ Offline';
                document.getElementById('backend-status').style.color = '#ff4444';
            });

        // Test WebSocket connection
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const ws = new WebSocket(`${wsProtocol}//${window.location.host}/socket.io/?transport=websocket`);
        
        ws.onopen = function() {
            document.getElementById('ws-status').textContent = '✅ Connected';
            document.getElementById('ws-status').style.color = '#00ff88';
        };
        
        ws.onerror = function() {
            document.getElementById('ws-status').textContent = '❌ Failed';
            document.getElementById('ws-status').style.color = '#ff4444';
        };
    </script>
</body>
</html>
EOF

echo -e "${GREEN}✅ Frontend files created${NC}"

print_step "STEP 12: Create Management Scripts"

# Create deployment script
cat > scripts/deploy.sh << 'EOF'
#!/bin/bash

# Update and restart services
echo "🔄 Updating Crypto Flow..."

cd /opt/crypto-flow

# Pull latest changes (if using git)
# git pull origin main

# Rebuild and restart containers
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 30

# Check health
docker-compose ps
docker-compose logs --tail=20

echo "✅ Deployment complete!"
EOF

# Create backup script
cat > scripts/backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/opt/crypto-flow/backups"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

echo "📦 Creating backup..."

# Backup database
docker exec crypto_postgres pg_dump -U crypto_user crypto_flow > $BACKUP_DIR/database_$DATE.sql

# Backup logs
tar -czf $BACKUP_DIR/logs_$DATE.tar.gz logs/

# Backup config
cp .env $BACKUP_DIR/env_$DATE.backup

# Keep only last 7 backups
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "✅ Backup completed: $BACKUP_DIR"
EOF

# Create monitoring script
cat > scripts/monitor.sh << 'EOF'
#!/bin/bash

echo "📊 Crypto Flow System Status"
echo "=============================="

# Docker containers status
echo -e "\n🐳 Container Status:"
docker-compose ps

# Resource usage
echo -e "\n💾 Resource Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

# Disk usage
echo -e "\n💽 Disk Usage:"
df -h /opt/crypto-flow

# Recent logs
echo -e "\n📝 Recent Backend Logs:"
docker-compose logs --tail=10 backend

# Database health
echo -e "\n🗄️  Database Status:"
docker exec crypto_postgres pg_isready -U crypto_user

# API health check
echo -e "\n🌐 API Health:"
curl -s http://localhost/api/health | jq '.' 2>/dev/null || echo "API not responding"
EOF

# Make scripts executable
chmod +x scripts/*.sh

echo -e "${GREEN}✅ Management scripts created${NC}"

print_step "STEP 13: Replace Placeholders and Deploy"

# Replace database password in init script
sed -i "s/PLACEHOLDER_PASSWORD/$DB_PASSWORD/g" scripts/init.sql

# Copy backend source files (you'll need to add these)
echo -e "${YELLOW}📝 You need to add your backend source files to:${NC}"
echo -e "${CYAN}   - $PROJECT_DIR/backend/src/server.js${NC}"
echo -e "${CYAN}   - $PROJECT_DIR/backend/src/websocket.js${NC}"
echo -e "${CYAN}   - $PROJECT_DIR/backend/src/binance.js${NC}"
echo -e "${CYAN}   - $PROJECT_DIR/backend/src/database.js${NC}"

print_step "STEP 14: Start Services"

# Start Docker services
cd $PROJECT_DIR
docker-compose up -d

echo -e "${GREEN}✅ Services starting...${NC}"

# Wait for services to be ready
echo -e "${YELLOW}⏳ Waiting for services to initialize (60 seconds)...${NC}"
sleep 60

print_step "STEP 15: Verify Installation"

echo -e "\n${PURPLE}🔍 Service Status:${NC}"
docker-compose ps

echo -e "\n${PURPLE}📊 Container Health:${NC}"
docker-compose exec backend curl -f http://localhost:3000/api/health 2>/dev/null && echo "✅ Backend healthy" || echo "❌ Backend not ready"

echo -e "\n${PURPLE}🌐 Web Access:${NC}"
curl -s http://localhost/health >/dev/null && echo "✅ Nginx healthy" || echo "❌ Nginx not ready"

print_step "DEPLOYMENT COMPLETE! 🎉"

echo -e "${GREEN}"
echo "=============================================="
echo "✅ CRYPTO FLOW DEPLOYED SUCCESSFULLY!"
echo "=============================================="
echo -e "${NC}"

echo -e "${CYAN}🌐 Access URLs:${NC}"
echo -e "   Frontend: http://$(curl -s ifconfig.me)"
echo -e "   API:      http://$(curl -s ifconfig.me)/api/health"
echo -e "   Logs:     docker-compose logs -f"

echo -e "\n${CYAN}🔧 Management Commands:${NC}"
echo -e "   Deploy:   cd $PROJECT_DIR && ./scripts/deploy.sh"
echo -e "   Monitor:  cd $PROJECT_DIR && ./scripts/monitor.sh"
echo -e "   Backup:   cd $PROJECT_DIR && ./scripts/backup.sh"
echo -e "   Logs:     cd $PROJECT_DIR && docker-compose logs -f [service]"

echo -e "\n${CYAN}📁 Important Files:${NC}"
echo -e "   Config:   $PROJECT_DIR/.env"
echo -e "   Logs:     $PROJECT_DIR/logs/"
echo -e "   Backups:  $PROJECT_DIR/backups/"

echo -e "\n${YELLOW}⚠️  Next Steps:${NC}"
echo -e "   1. Add your Binance API keys to $PROJECT_DIR/.env"
echo -e "   2. Copy your backend source files to $PROJECT_DIR/backend/src/"
echo -e "   3. Copy your frontend build to $PROJECT_DIR/frontend/dist/"
echo -e "   4. Run: cd $PROJECT_DIR && docker-compose restart"

echo -e "\n${PURPLE}🔐 Database Password: $DB_PASSWORD${NC}"
echo -e "${RED}⚠️  Save this password securely!${NC}"

echo -e "\n${GREEN}Happy Trading! 🚀📈${NC}"
