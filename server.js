// src/server.js - Main Backend Server
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Server } = require('socket.io');
require('dotenv').config();

const Database = require('./database');
const BinanceClient = require('./binance');
const { setupWebSocket } = require('./websocket');

class CryptoFlowServer {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    this.db = new Database();
    this.binance = new BinanceClient();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.startDataCollection();
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    this.app.use(morgan('combined'));
    this.app.use(express.json());
    this.app.use(express.static('public'));
  }

  setupRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        connections: this.io.sockets.sockets.size
      });
    });

    // Live data endpoints
    this.app.get('/api/live-data', async (req, res) => {
      try {
        const data = await this.getLiveData();
        res.json(data);
      } catch (error) {
        console.error('Error fetching live data:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Liquidations
    this.app.get('/api/liquidations', async (req, res) => {
      try {
        const liquidations = await this.db.getRecentLiquidations();
        res.json(liquidations);
      } catch (error) {
        console.error('Error fetching liquidations:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Climactic moves
    this.app.get('/api/climactic-moves', async (req, res) => {
      try {
        const moves = await this.db.getClimacticMoves();
        res.json(moves);
      } catch (error) {
        console.error('Error fetching climactic moves:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Volume analysis
    this.app.get('/api/volume-analysis', async (req, res) => {
      try {
        const analysis = await this.db.getVolumeAnalysis();
        res.json(analysis);
      } catch (error) {
        console.error('Error fetching volume analysis:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Top gainers/losers
    this.app.get('/api/market-movers', async (req, res) => {
      try {
        const movers = await this.getMarketMovers();
        res.json(movers);
      } catch (error) {
        console.error('Error fetching market movers:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Options flow (mock data for now)
    this.app.get('/api/options-flow', (req, res) => {
      const mockOptionsData = this.generateMockOptionsFlow();
      res.json(mockOptionsData);
    });
  }

  setupWebSocket() {
    setupWebSocket(this.io, this.db, this.binance);
  }

  async startDataCollection() {
    console.log('🚀 Starting data collection...');
    
    // Connect to database
    await this.db.connect();
    
    // Start Binance WebSocket connections
    await this.binance.connect();
    
    // Setup data processing pipelines
    this.binance.onTicker((data) => {
      this.processTicker(data);
    });

    this.binance.onLiquidation((data) => {
      this.processLiquidation(data);
    });

    this.binance.onTrade((data) => {
      this.processTrade(data);
    });

    console.log('✅ Data collection started successfully');
  }

  async processTicker(ticker) {
    try {
      // Detect climactic moves
      const priceChange = parseFloat(ticker.priceChangePercent);
      const volume = parseFloat(ticker.volume);
      
      if (Math.abs(priceChange) > 5 && volume > 1000000) {
        await this.db.insertClimacticMove({
          symbol: ticker.symbol,
          priceChangePercent: priceChange,
          volume: volume,
          timeframe: '24h',
          exchange: 'binance'
        });

        // Emit to all connected clients
        this.io.emit('climactic-move', {
          symbol: ticker.symbol,
          change: priceChange,
          volume: volume,
          timestamp: new Date()
        });
      }

      // Broadcast ticker update
      this.io.emit('ticker-update', ticker);
      
    } catch (error) {
      console.error('Error processing ticker:', error);
    }
  }

  async processLiquidation(liquidation) {
    try {
      const amount = parseFloat(liquidation.originalQuantity) * parseFloat(liquidation.price);
      
      // Only process liquidations > $20k
      if (amount > 20000) {
        await this.db.insertLiquidation({
          symbol: liquidation.symbol,
          side: liquidation.side,
          amount: amount,
          price: parseFloat(liquidation.price),
          leverage: liquidation.timeInForce,
          exchange: 'binance'
        });

        // Emit to all connected clients
        this.io.emit('liquidation', {
          symbol: liquidation.symbol,
          side: liquidation.side,
          amount: amount,
          price: liquidation.price,
          timestamp: new Date()
        });
      }
    } catch (error) {
      console.error('Error processing liquidation:', error);
    }
  }

  async processTrade(trade) {
    try {
      await this.db.insertTrade({
        symbol: trade.symbol,
        price: parseFloat(trade.price),
        volume: parseFloat(trade.quantity),
        side: trade.isBuyerMaker ? 'sell' : 'buy',
        exchange: 'binance'
      });

      // Calculate VWAP and volume metrics
      const vwapData = await this.calculateVWAP(trade.symbol);
      if (vwapData.significant) {
        this.io.emit('vwap-signal', vwapData);
      }

    } catch (error) {
      console.error('Error processing trade:', error);
    }
  }

  async calculateVWAP(symbol) {
    // Simplified VWAP calculation
    const trades = await this.db.getRecentTrades(symbol, 1000);
    
    let totalVolume = 0;
    let totalVolumePrice = 0;
    
    trades.forEach(trade => {
      const volume = parseFloat(trade.volume);
      const price = parseFloat(trade.price);
      totalVolume += volume;
      totalVolumePrice += volume * price;
    });

    const vwap = totalVolumePrice / totalVolume;
    const currentPrice = trades[trades.length - 1]?.price || 0;
    const deviation = ((currentPrice - vwap) / vwap) * 100;

    return {
      symbol,
      vwap,
      currentPrice,
      deviation,
      significant: Math.abs(deviation) > 2,
      trend: deviation > 0 ? 'above' : 'below'
    };
  }

  async getLiveData() {
    const [liquidations, climacticMoves, volumeAnalysis] = await Promise.all([
      this.db.getRecentLiquidations(20),
      this.db.getClimacticMoves(15),
      this.db.getVolumeAnalysis(10)
    ]);

    return {
      liquidations,
      climacticMoves,
      volumeAnalysis,
      timestamp: new Date()
    };
  }

  async getMarketMovers() {
    // Get 24h ticker data from Binance
    const tickers = await this.binance.get24hrTickers();
    
    // Sort by price change
    const gainers = tickers
      .filter(t => parseFloat(t.priceChangePercent) > 0)
      .sort((a, b) => parseFloat(b.priceChangePercent) - parseFloat(a.priceChangePercent))
      .slice(0, 10);

    const losers = tickers
      .filter(t => parseFloat(t.priceChangePercent) < 0)
      .sort((a, b) => parseFloat(a.priceChangePercent) - parseFloat(b.priceChangePercent))
      .slice(0, 10);

    // Calculate relative volume
    const relativeVolume = tickers
      .map(ticker => {
        const currentVolume = parseFloat(ticker.volume);
        const avgVolume = parseFloat(ticker.weightedAvgPrice) * currentVolume; // Simplified
        return {
          ...ticker,
          relativeVolume: currentVolume / (avgVolume || 1)
        };
      })
      .filter(t => t.relativeVolume > 1.5)
      .sort((a, b) => b.relativeVolume - a.relativeVolume)
      .slice(0, 10);

    return {
      gainers,
      losers,
      relativeVolume
    };
  }

  generateMockOptionsFlow() {
    const symbols = ['BTC', 'ETH', 'SOL', 'AVAX'];
    const sides = ['Buy', 'Sell'];
    const types = ['Call', 'Put'];
    const sentiments = ['Bullish', 'Bearish'];

    return Array.from({ length: 15 }, (_, i) => ({
      id: i,
      timestamp: new Date(Date.now() - i * 30000).toISOString(),
      symbol: symbols[Math.floor(Math.random() * symbols.length)],
      side: sides[Math.floor(Math.random() * sides.length)],
      type: types[Math.floor(Math.random() * types.length)],
      strike: Math.floor(Math.random() * 20000 + 30000),
      premium: (Math.random() * 100).toFixed(3),
      size: Math.floor(Math.random() * 500 + 10),
      iv: (Math.random() * 60 + 40).toFixed(1),
      sentiment: sentiments[Math.floor(Math.random() * sentiments.length)],
      expiry: new Date(Date.now() + Math.random() * 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    }));
  }

  start() {
    const PORT = process.env.PORT || 3000;
    
    this.server.listen(PORT, () => {
      console.log(`🚀 Crypto Flow Server running on port ${PORT}`);
      console.log(`📊 WebSocket server ready for connections`);
      console.log(`🔗 Health check: http://localhost:${PORT}/api/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('🛑 Shutting down server...');
      this.server.close(() => {
        this.db.disconnect();
        process.exit(0);
      });
    });
  }
}

// Start the server
const server = new CryptoFlowServer();
server.start();
