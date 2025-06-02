# 🚀 Crypto Flow Dashboard

**Real-time cryptocurrency & options flow analysis platform**

![Crypto Flow](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Docker](https://img.shields.io/badge/Docker-Supported-blue)
![Node.js](https://img.shields.io/badge/Node.js-20+-green)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)

## 🌟 Features

- 🔥 **Climactic Moves** - Real-time detection of significant price movements
- 💀 **Liquidations** - Live futures liquidations tracking (>$20k)
- 🎯 **Options Flow** - Real-time options activity monitoring
- 📈 **VWAP Signals** - Volume Weighted Average Price analysis
- 📊 **Market Rankings** - Top gainers, losers, and volume leaders
- ⚡ **WebSocket Streams** - Sub-second data updates
- 🎨 **Trader-Focused UI** - Dark theme with neon highlights

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Database      │
│   React App     │◄──►│   Node.js API   │◄──►│   PostgreSQL    │
│   TradingView   │    │   WebSocket     │    │   Redis Cache   │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │   Binance API   │
                    │   WebSocket     │
                    │   Streams       │
                    └─────────────────┘
```

## ⚡ Quick Start

### 🐳 Docker Deployment (Recommended)

```bash
# Clone repository
git clone https://github.com/your-username/crypto-flow.git
cd crypto-flow

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Deploy with Docker
chmod +x deploy.sh
./deploy.sh
```

### 🌐 Access URLs

- **Dashboard**: `http://your-server-ip`
- **API**: `http://your-server-ip/api/health`
- **WebSocket**: `ws://your-server-ip/socket.io`

## 📋 Requirements

### Minimum System Requirements
- **OS**: Ubuntu 22.04 LTS (recommended)
- **CPU**: 4 vCPUs
- **RAM**: 8GB
- **Storage**: 25GB SSD
- **Network**: 1Gbps connection

### DigitalOcean Droplet
- **Plan**: CPU-Optimized ($48/month)
- **Region**: New York 1 (closest to Brazil)
- **Total Cost**: ~$50-60/month

## 🔧 Configuration

### Environment Variables

```bash
# Database
DB_PASSWORD=your_secure_password
DB_HOST=postgres
DB_NAME=crypto_flow
DB_USER=crypto_user

# Redis
REDIS_URL=redis://redis:6379

# Binance API (Optional)
BINANCE_API_KEY=your_api_key
BINANCE_SECRET=your_secret_key

# Application
NODE_ENV=production
PORT=3000
WS_PORT=3001
```

### Binance API Setup (Optional)
1. Create account at [Binance](https://binance.com)
2. Generate API key with read-only permissions
3. Add keys to `.env` file
4. Restart services: `docker-compose restart`

## 📊 API Endpoints

### REST API
```
GET  /api/health              # Health check
GET  /api/live-data           # Real-time data snapshot
GET  /api/liquidations        # Recent liquidations
GET  /api/climactic-moves     # Climactic price movements
GET  /api/volume-analysis     # Volume analysis
GET  /api/market-movers       # Top gainers/losers
GET  /api/options-flow        # Options activity
```

### WebSocket Events
```javascript
// Connect to WebSocket
const socket = io('ws://your-server/socket.io');

// Subscribe to events
socket.on('liquidation', (data) => { /* Handle liquidation */ });
socket.on('climactic-move', (data) => { /* Handle move */ });
socket.on('ticker-update', (data) => { /* Handle ticker */ });
socket.on('vwap-signal', (data) => { /* Handle VWAP */ });
```

## 🛠️ Development

### Local Development

```bash
# Install dependencies
npm install

# Start development servers
npm run dev:backend    # Backend on :3000
npm run dev:frontend   # Frontend on :3001

# Start database
docker-compose up postgres redis
```

### Project Structure

```
crypto-flow/
├── 📁 backend/
│   ├── 📁 src/
│   │   ├── 📄 server.js       # Main server
│   │   ├── 📄 websocket.js    # WebSocket handler
│   │   ├── 📄 binance.js      # Binance client
│   │   └── 📄 database.js     # Database layer
│   ├── 📄 package.json
│   └── 📄 Dockerfile
├── 📁 frontend/
│   ├── 📁 src/
│   │   ├── 📄 App.jsx         # Main component
│   │   └── 📄 Dashboard.jsx   # Flow dashboard
│   └── 📁 dist/              # Built assets
├── 📁 nginx/
│   ├── 📄 nginx.conf         # Main config
│   └── 📁 conf.d/            # Server configs
├── 📁 scripts/
│   ├── 📄 deploy.sh          # Deployment script
│   ├── 📄 backup.sh          # Backup script
│   └── 📄 monitor.sh         # Monitoring script
├── 📄 docker-compose.yml     # Docker orchestration
├── 📄 .env.example          # Environment template
└── 📄 README.md             # This file
```

## 📈 Data Flow

### Real-time Pipeline

```
Binance WebSocket → Data Collector → PostgreSQL
                                        ↓
Frontend ← WebSocket Server ← Analytics Engine
```

### Data Types

1. **Liquidations**: Futures positions liquidated >$20k
2. **Climactic Moves**: Price changes >5% with high volume
3. **Options Flow**: Large options trades with sentiment
4. **VWAP Signals**: Price deviations from volume-weighted average
5. **Volume Spikes**: Relative volume >2x average

## 🔒 Security

- **Rate Limiting**: API and WebSocket endpoints
- **HTTPS**: SSL certificates via Let's Encrypt
- **Firewall**: UFW with minimal open ports
- **Database**: Encrypted connections and secure passwords
- **Headers**: Security headers via Nginx

## 📊 Monitoring

### Health Checks

```bash
# System status
./scripts/monitor.sh

# Container logs
docker-compose logs -f [service]

# Resource usage
docker stats

# Database health
docker exec crypto_postgres pg_isready
```

### Backup Strategy

```bash
# Manual backup
./scripts/backup.sh

# Automated backups (via cron)
0 2 * * * /opt/crypto-flow/scripts/backup.sh
```

## 🚀 Deployment

### Production Deployment

1. **Provision Server**
   ```bash
   # DigitalOcean droplet with Ubuntu 22.04
   # 4 vCPU, 8GB RAM, 25GB SSD
   ```

2. **Clone and Deploy**
   ```bash
   git clone https://github.com/your-username/crypto-flow.git
   cd crypto-flow
   chmod +x deploy.sh
   ./deploy.sh
   ```

3. **Configure Domain** (Optional)
   ```bash
   # Update nginx config with your domain
   # Install SSL certificate
   certbot --nginx -d your-domain.com
   ```

### Scaling

- **Horizontal**: Add more backend replicas
- **Vertical**: Increase droplet resources
- **Database**: Upgrade to managed PostgreSQL
- **CDN**: Add CloudFlare for global distribution

## 🐛 Troubleshooting

### Common Issues

1. **Containers not starting**
   ```bash
   docker-compose down
   docker-compose up -d
   docker-compose logs -f
   ```

2. **Database connection issues**
   ```bash
   docker exec crypto_postgres pg_isready -U crypto_user
   ```

3. **WebSocket connection fails**
   ```bash
   # Check firewall
   ufw status
   # Check nginx config
   nginx -t
   ```

4. **High memory usage**
   ```bash
   # Monitor containers
   docker stats
   # Restart services
   docker-compose restart
   ```

### Performance Tuning

1. **Database Optimization**
   - Increase `shared_buffers`
   - Add more indexes for queries
   - Enable connection pooling

2. **Redis Configuration**
   - Set appropriate `maxmemory`
   - Configure eviction policy
   - Enable persistence

3. **Nginx Optimization**
   - Increase `worker_connections`
   - Enable gzip compression
   - Configure caching headers

## 🤝 Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open Pull Request

### Development Guidelines

- Use TypeScript for new features
- Add tests for critical functions
- Follow existing code style
- Update documentation
- Test with real Binance data

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Disclaimer

This software is for educational and informational purposes only. Trading cryptocurrencies involves substantial risk of loss. The authors are not responsible for any financial losses incurred from using this software.

## 🙏 Acknowledgments

- [Binance API](https://binance-docs.github.io/apidocs/) - Real-time data
- [TradingView](https://www.tradingview.com/) - Charting widgets
- [Socket.io](https://socket.io/) - WebSocket implementation
- [PostgreSQL](https://postgresql.org/) - Database
- [Docker](https://docker.com/) - Containerization

---

## 📞 Support

- 📧 Email: support@cryptoflow.dev
- 💬 Discord: [Join our server](https://discord.gg/cryptoflow)
- 📚 Docs: [Full Documentation](https://docs.cryptoflow.dev)
- 🐛 Issues: [GitHub Issues](https://github.com/your-username/crypto-flow/issues)

---

**Made with ❤️ for traders, by traders** 🚀📈
