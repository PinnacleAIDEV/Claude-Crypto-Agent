// src/websocket.js - WebSocket Connection Handler
const cron = require('node-cron');

class WebSocketManager {
  constructor(io, database, binanceClient) {
    this.io = io;
    this.db = database;
    this.binance = binanceClient;
    this.clients = new Map();
    this.dataCache = new Map();
    
    this.setupEventHandlers();
    this.startPeriodicUpdates();
  }

  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`📱 Client connected: ${socket.id}`);
      
      // Store client info
      this.clients.set(socket.id, {
        socket,
        subscriptions: new Set(),
        lastPing: Date.now(),
        joinedAt: new Date()
      });

      // Send initial data
      this.sendInitialData(socket);

      // Handle client subscriptions
      socket.on('subscribe', (data) => {
        this.handleSubscription(socket, data);
      });

      socket.on('unsubscribe', (data) => {
        this.handleUnsubscription(socket, data);
      });

      // Handle asset selection for TradingView
      socket.on('select-asset', (asset) => {
        socket.emit('asset-selected', { asset, timestamp: new Date() });
      });

      // Ping/Pong for connection health
      socket.on('ping', () => {
        const client = this.clients.get(socket.id);
        if (client) {
          client.lastPing = Date.now();
          socket.emit('pong', { timestamp: Date.now() });
        }
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log(`📱 Client disconnected: ${socket.id} (${reason})`);
        this.clients.delete(socket.id);
      });

      // Error handling
      socket.on('error', (error) => {
        console.error(`❌ Socket error for ${socket.id}:`, error);
      });
    });
  }

  async sendInitialData(socket) {
    try {
      // Send cached data immediately
      const initialData = {
        liquidations: this.dataCache.get('liquidations') || [],
        climacticMoves: this.dataCache.get('climacticMoves') || [],
        volumeAnalysis: this.dataCache.get('volumeAnalysis') || [],
        marketMovers: this.dataCache.get('marketMovers') || {
          gainers: [],
          losers: [],
          relativeVolume: []
        },
        optionsFlow: this.dataCache.get('optionsFlow') || [],
        timestamp: new Date()
      };

      socket.emit('initial-data', initialData);
      
      // Send live status
      socket.emit('status-update', {
        status: 'connected',
        serverTime: new Date(),
        totalConnections: this.clients.size
      });

    } catch (error) {
      console.error('Error sending initial data:', error);
      socket.emit('error', { message: 'Failed to load initial data' });
    }
  }

  handleSubscription(socket, data) {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const { type, symbols } = data;
    
    switch (type) {
      case 'liquidations':
        client.subscriptions.add('liquidations');
        break;
      case 'climactic':
        client.subscriptions.add('climactic');
        break;
      case 'options':
        client.subscriptions.add('options');
        break;
      case 'volume':
        client.subscriptions.add('volume');
        break;
      case 'tickers':
        if (symbols && Array.isArray(symbols)) {
          symbols.forEach(symbol => {
            client.subscriptions.add(`ticker:${symbol}`);
          });
        }
        break;
    }

    console.log(`📊 Client ${socket.id} subscribed to: ${type}`);
    socket.emit('subscription-confirmed', { type, timestamp: new Date() });
  }

  handleUnsubscription(socket, data) {
    const client = this.clients.get(socket.id);
    if (!client) return;

    const { type, symbols } = data;
    
    switch (type) {
      case 'liquidations':
        client.subscriptions.delete('liquidations');
        break;
      case 'climactic':
        client.subscriptions.delete('climactic');
        break;
      case 'options':
        client.subscriptions.delete('options');
        break;
      case 'volume':
        client.subscriptions.delete('volume');
        break;
      case 'tickers':
        if (symbols && Array.isArray(symbols)) {
          symbols.forEach(symbol => {
            client.subscriptions.delete(`ticker:${symbol}`);
          });
        }
        break;
    }

    console.log(`📊 Client ${socket.id} unsubscribed from: ${type}`);
    socket.emit('unsubscription-confirmed', { type, timestamp: new Date() });
  }

  startPeriodicUpdates() {
    // Update liquidations every 3 seconds
    setInterval(async () => {
      try {
        const liquidations = await this.db.getRecentLiquidations(15);
        this.dataCache.set('liquidations', liquidations);
        this.broadcastToSubscribers('liquidations', 'liquidations-update', liquidations);
      } catch (error) {
        console.error('Error updating liquidations:', error);
      }
    }, 3000);

    // Update climactic moves every 5 seconds
    setInterval(async () => {
      try {
        const climacticMoves = await this.db.getClimacticMoves(12);
        this.dataCache.set('climacticMoves', climacticMoves);
        this.broadcastToSubscribers('climactic', 'climactic-update', climacticMoves);
      } catch (error) {
        console.error('Error updating climactic moves:', error);
      }
    }, 5000);

    // Update volume analysis every 10 seconds
    setInterval(async () => {
      try {
        const volumeAnalysis = await this.db.getVolumeAnalysis(10);
        this.dataCache.set('volumeAnalysis', volumeAnalysis);
        this.broadcastToSubscribers('volume', 'volume-update', volumeAnalysis);
      } catch (error) {
        console.error('Error updating volume analysis:', error);
      }
    }, 10000);

    // Update market movers every 30 seconds
    setInterval(async () => {
      try {
        const marketMovers = await this.getMarketMovers();
        this.dataCache.set('marketMovers', marketMovers);
        this.broadcastToSubscribers('tickers', 'market-movers-update', marketMovers);
      } catch (error) {
        console.error('Error updating market movers:', error);
      }
    }, 30000);

    // Update options flow every 15 seconds (mock data)
    setInterval(() => {
      try {
        const optionsFlow = this.generateMockOptionsFlow();
        this.dataCache.set('optionsFlow', optionsFlow);
        this.broadcastToSubscribers('options', 'options-update', optionsFlow);
      } catch (error) {
        console.error('Error updating options flow:', error);
      }
    }, 15000);

    // Cleanup dead connections every minute
    setInterval(() => {
      this.cleanupDeadConnections();
    }, 60000);

    // Send heartbeat every 30 seconds
    setInterval(() => {
      this.sendHeartbeat();
    }, 30000);
  }

  broadcastToSubscribers(subscriptionType, eventName, data) {
    this.clients.forEach((client, socketId) => {
      if (client.subscriptions.has(subscriptionType)) {
        client.socket.emit(eventName, {
          data,
          timestamp: new Date(),
          type: subscriptionType
        });
      }
    });
  }

  cleanupDeadConnections() {
    const now = Date.now();
    const timeout = 5 * 60 * 1000; // 5 minutes

    this.clients.forEach((client, socketId) => {
      if (now - client.lastPing > timeout) {
        console.log(`🧹 Cleaning up dead connection: ${socketId}`);
        client.socket.disconnect();
        this.clients.delete(socketId);
      }
    });
  }

  sendHeartbeat() {
    const heartbeat = {
      timestamp: new Date(),
      serverTime: Date.now(),
      connections: this.clients.size,
      uptime: process.uptime()
    };

    this.io.emit('heartbeat', heartbeat);
  }

  // Broadcast real-time events
  broadcastLiquidation(liquidation) {
    this.broadcastToSubscribers('liquidations', 'liquidation-alert', {
      ...liquidation,
      alert: true,
      sound: liquidation.amount > 100000 // Sound alert for liquidations > $100k
    });
  }

  broadcastClimacticMove(move) {
    this.broadcastToSubscribers('climactic', 'climactic-alert', {
      ...move,
      alert: true,
      sound: Math.abs(move.priceChangePercent) > 10 // Sound for moves > 10%
    });
  }

  broadcastVWAPSignal(signal) {
    this.broadcastToSubscribers('volume', 'vwap-signal', {
      ...signal,
      alert: signal.significant
    });
  }

  broadcastTickerUpdate(ticker) {
    // Send to clients subscribed to specific tickers
    this.clients.forEach((client, socketId) => {
      if (client.subscriptions.has(`ticker:${ticker.symbol}`)) {
        client.socket.emit('ticker-update', {
          data: ticker,
          timestamp: new Date()
        });
      }
    });
  }

  // Helper methods
  async getMarketMovers() {
    try {
      const tickers = await this.binance.get24hrTickers();
      
      const gainers = tickers
        .filter(t => parseFloat(t.priceChangePercent) > 0)
        .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
        .slice(0, 8)
        .map(t => ({
          ticker: t.symbol,
          price: `${parseFloat(t.lastPrice).toFixed(4)}`,
          volume: `${(parseFloat(t.volume) * parseFloat(t.lastPrice) / 1000000).toFixed(2)}m`,
          change: parseFloat(t.priceChangePercent).toFixed(2)
        }));

      const losers = tickers
        .filter(t => parseFloat(t.priceChangePercent) < 0)
        .sort((a, b) => parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent))
        .slice(0, 8)
        .map(t => ({
          ticker: t.symbol,
          price: `${parseFloat(t.lastPrice).toFixed(4)}`,
          volume: `${(parseFloat(t.volume) * parseFloat(t.lastPrice) / 1000000).toFixed(2)}m`,
          change: parseFloat(t.priceChangePercent).toFixed(2)
        }));

      const relativeVolume = tickers
        .map(ticker => {
          const currentVolume = parseFloat(ticker.volume);
          const avgVolume = parseFloat(ticker.count) * 1000; // Simplified avg calculation
          const relVol = currentVolume / (avgVolume || 1);
          
          return {
            ticker: ticker.symbol,
            price: `${parseFloat(ticker.lastPrice).toFixed(4)}`,
            volume: `${(currentVolume * parseFloat(ticker.lastPrice) / 1000000).toFixed(2)}m`,
            relVol: relVol > 10 ? `${relVol.toFixed(1)}x` : `${(relVol * 100).toFixed(0)}%`
          };
        })
        .filter(t => parseFloat(t.relVol) > 1.5)
        .sort((a, b) => parseFloat(b.relVol) - parseFloat(a.relVol))
        .slice(0, 8);

      return { gainers, losers, relativeVolume };
    } catch (error) {
      console.error('Error getting market movers:', error);
      return { gainers: [], losers: [], relativeVolume: [] };
    }
  }

  generateMockOptionsFlow() {
    const symbols = ['BTC', 'ETH', 'SOL', 'AVAX', 'MATIC', 'LINK'];
    const sides = ['Buy', 'Sell'];
    const types = ['Call', 'Put'];
    const sentiments = ['Bullish', 'Bearish'];

    return Array.from({ length: 10 }, (_, i) => ({
      id: Date.now() + i,
      time: new Date(Date.now() - i * 30000).toLocaleTimeString(),
      ticker: symbols[Math.floor(Math.random() * symbols.length)],
      direction: sides[Math.floor(Math.random() * sides.length)],
      callPut: types[Math.floor(Math.random() * types.length)],
      price: `${(Math.random() * 70000 + 20000).toFixed(2)}`,
      premium: `Ξ ${(Math.random() * 100).toFixed(3)}(${(Math.random() * 200).toFixed(1)}k)`,
      size: Math.floor(Math.random() * 500 + 10),
      expiry: new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000).toLocaleDateString(),
      strike: `${(Math.random() * 20000 + 30000).toFixed(0)}`,
      iv: `${(Math.random() * 60 + 40).toFixed(1)}%`,
      sentiment: sentiments[Math.floor(Math.random() * sentiments.length)]
    }));
  }

  // Statistics and monitoring
  getConnectionStats() {
    const stats = {
      totalConnections: this.clients.size,
      subscriptions: {},
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage()
    };

    // Count subscriptions by type
    this.clients.forEach(client => {
      client.subscriptions.forEach(sub => {
        stats.subscriptions[sub] = (stats.subscriptions[sub] || 0) + 1;
      });
    });

    return stats;
  }
}

// Export setup function
function setupWebSocket(io, database, binanceClient) {
  const wsManager = new WebSocketManager(io, database, binanceClient);
  
  // Expose manager for external use
  io.wsManager = wsManager;
  
  console.log('✅ WebSocket manager initialized');
  return wsManager;
}

module.exports = {
  setupWebSocket,
  WebSocketManager
};
