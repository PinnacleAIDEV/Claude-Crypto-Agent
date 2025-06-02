// src/binance.js - Binance WebSocket Client
const WebSocket = require('ws');
const https = require('https');

class BinanceClient {
  constructor() {
    this.baseURL = 'https://api.binance.com';
    this.wsBaseURL = 'wss://stream.binance.com:9443/ws';
    this.futuresWsURL = 'wss://fstream.binance.com/ws';
    
    this.connections = new Map();
    this.eventHandlers = new Map();
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.eventHandlers.set('ticker', []);
    this.eventHandlers.set('trade', []);
    this.eventHandlers.set('liquidation', []);
    this.eventHandlers.set('depth', []);
    this.eventHandlers.set('aggTrade', []);
  }

  // Event handler registration
  onTicker(callback) {
    this.eventHandlers.get('ticker').push(callback);
  }

  onTrade(callback) {
    this.eventHandlers.get('trade').push(callback);
  }

  onLiquidation(callback) {
    this.eventHandlers.get('liquidation').push(callback);
  }

  onDepth(callback) {
    this.eventHandlers.get('depth').push(callback);
  }

  onAggTrade(callback) {
    this.eventHandlers.get('aggTrade').push(callback);
  }

  // Emit events to registered handlers
  emit(eventType, data) {
    const handlers = this.eventHandlers.get(eventType) || [];
    handlers.forEach(handler => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in ${eventType} handler:`, error);
      }
    });
  }

  async connect() {
    try {
      console.log('🔌 Connecting to Binance WebSocket...');
      
      // Connect to multiple streams
      await Promise.all([
        this.connectAllMiniTicker(),
        this.connectTopSymbolsTrades(),
        this.connectFuturesLiquidations(),
        this.connectDepthStreams()
      ]);

      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log('✅ Connected to all Binance streams');

    } catch (error) {
      console.error('❌ Failed to connect to Binance:', error);
      this.handleReconnect();
    }
  }

  async connectAllMiniTicker() {
    const streamName = '!miniTicker@arr';
    const ws = new WebSocket(`${this.wsBaseURL}/${streamName}`);
    
    ws.on('open', () => {
      console.log('📊 Connected to All Mini Ticker stream');
    });

    ws.on('message', (data) => {
      try {
        const tickers = JSON.parse(data);
        if (Array.isArray(tickers)) {
          tickers.forEach(ticker => {
            this.emit('ticker', this.normalizeTicker(ticker));
          });
        }
      } catch (error) {
        console.error('Error parsing ticker data:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('Mini Ticker WebSocket error:', error);
    });

    ws.on('close', () => {
      console.log('📊 Mini Ticker stream disconnected');
      this.handleReconnect();
    });

    this.connections.set('miniTicker', ws);
  }

  async connectTopSymbolsTrades() {
    // Top crypto symbols for trade monitoring
    const symbols = [
      'btcusdt', 'ethusdt', 'solusdt', 'adausdt', 'dotusdt',
      'avaxusdt', 'maticusdt', 'linkusdt', 'uniusdt', 'ltcusdt'
    ];

    const streams = symbols.map(symbol => `${symbol}@aggTrade`);
    const streamNames = streams.join('/');
    
    const ws = new WebSocket(`${this.wsBaseURL}/${streamNames}`);
    
    ws.on('open', () => {
      console.log('📈 Connected to top symbols trade streams');
    });

    ws.on('message', (data) => {
      try {
        const trade = JSON.parse(data);
        if (trade.stream && trade.data) {
          this.emit('aggTrade', this.normalizeAggTrade(trade.data));
          this.emit('trade', this.normalizeAggTrade(trade.data));
        }
      } catch (error) {
        console.error('Error parsing trade data:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('Trade streams WebSocket error:', error);
    });

    ws.on('close', () => {
      console.log('📈 Trade streams disconnected');
      this.handleReconnect();
    });

    this.connections.set('trades', ws);
  }

  async connectFuturesLiquidations() {
    const ws = new WebSocket(`${this.futuresWsURL}/!forceOrder@arr`);
    
    ws.on('open', () => {
      console.log('💀 Connected to futures liquidations stream');
    });

    ws.on('message', (data) => {
      try {
        const liquidation = JSON.parse(data);
        if (liquidation.o) {
          const normalizedLiq = this.normalizeLiquidation(liquidation.o);
          const amount = parseFloat(normalizedLiq.originalQuantity) * parseFloat(normalizedLiq.price);
          
          // Only emit liquidations > $20k
          if (amount > 20000) {
            this.emit('liquidation', normalizedLiq);
          }
        }
      } catch (error) {
        console.error('Error parsing liquidation data:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('Liquidations WebSocket error:', error);
    });

    ws.on('close', () => {
      console.log('💀 Liquidations stream disconnected');
      this.handleReconnect();
    });

    this.connections.set('liquidations', ws);
  }

  async connectDepthStreams() {
    // Connect to depth streams for VWAP calculations
    const symbols = ['btcusdt', 'ethusdt', 'solusdt'];
    const streams = symbols.map(symbol => `${symbol}@depth5@1000ms`);
    const streamNames = streams.join('/');
    
    const ws = new WebSocket(`${this.wsBaseURL}/${streamNames}`);
    
    ws.on('open', () => {
      console.log('📚 Connected to depth streams');
    });

    ws.on('message', (data) => {
      try {
        const depth = JSON.parse(data);
        if (depth.stream && depth.data) {
          this.emit('depth', this.normalizeDepth(depth.data));
        }
      } catch (error) {
        console.error('Error parsing depth data:', error);
      }
    });

    ws.on('error', (error) => {
      console.error('Depth streams WebSocket error:', error);
    });

    ws.on('close', () => {
      console.log('📚 Depth streams disconnected');
      this.handleReconnect();
    });

    this.connections.set('depth', ws);
  }

  // Data normalization methods
  normalizeTicker(ticker) {
    return {
      symbol: ticker.s,
      price: ticker.c,
      priceChange: ticker.P,
      priceChangePercent: ticker.P,
      volume: ticker.v,
      quoteVolume: ticker.q,
      high: ticker.h,
      low: ticker.l,
      open: ticker.o,
      timestamp: Date.now(),
      exchange: 'binance'
    };
  }

  normalizeAggTrade(trade) {
    return {
      symbol: trade.s,
      price: trade.p,
      quantity: trade.q,
      isBuyerMaker: trade.m,
      timestamp: trade.T,
      tradeId: trade.a,
      exchange: 'binance'
    };
  }

  normalizeLiquidation(liquidation) {
    return {
      symbol: liquidation.s,
      side: liquidation.S,
      orderType: liquidation.o,
      timeInForce: liquidation.f,
      originalQuantity: liquidation.q,
      price: liquidation.p,
      averagePrice: liquidation.ap,
      orderStatus: liquidation.X,
      lastFilledQuantity: liquidation.l,
      filledAccumulatedQuantity: liquidation.z,
      tradeTime: liquidation.T,
      exchange: 'binance'
    };
  }

  normalizeDepth(depth) {
    return {
      symbol: depth.s,
      bids: depth.b,
      asks: depth.a,
      timestamp: Date.now(),
      exchange: 'binance'
    };
  }

  // REST API methods
  async get24hrTickers() {
    try {
      const data = await this.makeRequest('/api/v3/ticker/24hr');
      return data.filter(ticker => 
        ticker.symbol.endsWith('USDT') && 
        parseFloat(ticker.volume) > 100000 // Filter low volume pairs
      );
    } catch (error) {
      console.error('Error fetching 24hr tickers:', error);
      return [];
    }
  }

  async getExchangeInfo() {
    try {
      return await this.makeRequest('/api/v3/exchangeInfo');
    } catch (error) {
      console.error('Error fetching exchange info:', error);
      return null;
    }
  }

  async getKlines(symbol, interval = '5m', limit = 100) {
    try {
      const params = new URLSearchParams({
        symbol: symbol.toUpperCase(),
        interval,
        limit: limit.toString()
      });
      
      return await this.makeRequest(`/api/v3/klines?${params}`);
    } catch (error) {
      console.error('Error fetching klines:', error);
      return [];
    }
  }

  // Helper method for REST API calls
  makeRequest(endpoint) {
    return new Promise((resolve, reject) => {
      const url = `${this.baseURL}${endpoint}`;
      
      https.get(url, (res) => {
        let data = '';
        
        res.on('data', chunk => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            const parsedData = JSON.parse(data);
            resolve(parsedData);
          } catch (error) {
            reject(new Error(`Failed to parse response: ${error.message}`));
          }
        });
      }).on('error', (error) => {
        reject(error);
      });
    });
  }

  // Connection management
  handleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    
    console.log(`🔄 Reconnecting in ${delay/1000}s... (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.disconnect();
      this.connect();
    }, delay);
  }

  disconnect() {
    console.log('🔌 Disconnecting from Binance WebSocket...');
    
    this.connections.forEach((ws, name) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });
    
    this.connections.clear();
    this.isConnected = false;
  }

  // Health check
  getConnectionStatus() {
    const status = {
      isConnected: this.isConnected,
      connections: {},
      reconnectAttempts: this.reconnectAttempts
    };

    this.connections.forEach((ws, name) => {
      status.connections[name] = {
        readyState: ws.readyState,
        url: ws.url
      };
    });

    return status;
  }

  // Market analysis helpers
  calculateVWAP(trades, timeWindow = 3600000) { // 1 hour default
    const now = Date.now();
    const relevantTrades = trades.filter(trade => 
      now - trade.timestamp < timeWindow
    );

    if (relevantTrades.length === 0) return null;

    let totalVolume = 0;
    let totalVolumePrice = 0;

    relevantTrades.forEach(trade => {
      const volume = parseFloat(trade.quantity);
      const price = parseFloat(trade.price);
      totalVolume += volume;
      totalVolumePrice += volume * price;
    });

    return {
      vwap: totalVolumePrice / totalVolume,
      totalVolume,
      tradeCount: relevantTrades.length,
      timeWindow
    };
  }

  detectClimacticMove(ticker, threshold = 5) {
    const priceChange = parseFloat(ticker.priceChangePercent);
    const volume = parseFloat(ticker.volume);
    const quoteVolume = parseFloat(ticker.quoteVolume);

    return {
      isClimatic: Math.abs(priceChange) > threshold && quoteVolume > 1000000,
      priceChange,
      volume,
      quoteVolume,
      symbol: ticker.symbol
    };
  }
}

module.exports = BinanceClient;
