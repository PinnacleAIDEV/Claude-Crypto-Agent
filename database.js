// src/database.js - PostgreSQL Database Handler
const { Pool } = require('pg');

class Database {
  constructor() {
    this.pool = null;
    this.isConnected = false;
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'crypto_flow',
      user: process.env.DB_USER || 'crypto_user',
      password: process.env.DB_PASSWORD || 'password',
      max: 20, // maximum number of connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };
  }

  async connect() {
    try {
      this.pool = new Pool(this.config);
      
      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      
      this.isConnected = true;
      console.log('✅ Connected to PostgreSQL database');
      
      // Initialize tables if they don't exist
      await this.initializeTables();
      
    } catch (error) {
      console.error('❌ Failed to connect to database:', error);
      throw error;
    }
  }

  async initializeTables() {
    const createTablesSQL = `
      -- Create trades table
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

      -- Create liquidations table
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

      -- Create volume_data table
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

      -- Create climactic_moves table
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

      -- Create indexes for better performance
      CREATE INDEX IF NOT EXISTS idx_trades_symbol_timestamp ON trades(symbol, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_liquidations_symbol_timestamp ON liquidations(symbol, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_liquidations_amount ON liquidations(amount DESC);
      CREATE INDEX IF NOT EXISTS idx_volume_symbol_timestamp ON volume_data(symbol, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_climactic_symbol_timestamp ON climactic_moves(symbol, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_climactic_change ON climactic_moves(price_change_percent DESC);

      -- Create partitioned tables for better performance (optional)
      -- This would be for production with high volume data
    `;

    try {
      await this.pool.query(createTablesSQL);
      console.log('✅ Database tables initialized');
    } catch (error) {
      console.error('❌ Error initializing tables:', error);
      throw error;
    }
  }

  // Trade operations
  async insertTrade(trade) {
    const query = `
      INSERT INTO trades (timestamp, symbol, price, volume, side, exchange)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    
    const values = [
      trade.timestamp ? new Date(trade.timestamp) : new Date(),
      trade.symbol,
      trade.price,
      trade.volume,
      trade.side,
      trade.exchange || 'binance'
    ];

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error inserting trade:', error);
      throw error;
    }
  }

  async getRecentTrades(symbol, limit = 1000) {
    const query = `
      SELECT * FROM trades 
      WHERE symbol = $1 
      ORDER BY timestamp DESC 
      LIMIT $2
    `;
    
    try {
      const result = await this.pool.query(query, [symbol, limit]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching recent trades:', error);
      return [];
    }
  }

  // Liquidation operations
  async insertLiquidation(liquidation) {
    const query = `
      INSERT INTO liquidations (timestamp, symbol, side, amount, price, leverage, exchange)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `;
    
    const values = [
      liquidation.timestamp ? new Date(liquidation.timestamp) : new Date(),
      liquidation.symbol,
      liquidation.side,
      liquidation.amount,
      liquidation.price,
      liquidation.leverage,
      liquidation.exchange || 'binance'
    ];

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error inserting liquidation:', error);
      throw error;
    }
  }

  async getRecentLiquidations(limit = 20) {
    const query = `
      SELECT 
        id,
        timestamp,
        symbol as ticker,
        side,
        CONCAT(', ROUND(amount::numeric, 0)) as amount,
        CONCAT(', ROUND(price::numeric, 2)) as price,
        CONCAT(leverage, 'x') as leverage,
        exchange,
        DATE_PART('epoch', NOW() - timestamp)::int as seconds_ago
      FROM liquidations 
      WHERE amount > 20000
      ORDER BY timestamp DESC 
      LIMIT $1
    `;
    
    try {
      const result = await this.pool.query(query, [limit]);
      return result.rows.map(row => ({
        ...row,
        time: new Date(row.timestamp).toLocaleTimeString()
      }));
    } catch (error) {
      console.error('Error fetching liquidations:', error);
      return [];
    }
  }

  // Climactic moves operations
  async insertClimacticMove(move) {
    const query = `
      INSERT INTO climactic_moves (timestamp, symbol, price_change_percent, volume_spike, timeframe, exchange)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `;
    
    const values = [
      move.timestamp ? new Date(move.timestamp) : new Date(),
      move.symbol,
      move.priceChangePercent,
      move.volumeSpike || move.volume,
      move.timeframe,
      move.exchange || 'binance'
    ];

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error inserting climactic move:', error);
      throw error;
    }
  }

  async getClimacticMoves(limit = 15) {
    const query = `
      SELECT 
        id,
        timestamp,
        symbol as ticker,
        price_change_percent as "changePercent",
        CONCAT(', ROUND(volume_spike::numeric / 1000000, 1), 'm') as volume,
        timeframe,
        exchange,
        DATE_PART('epoch', NOW() - timestamp)::int as seconds_ago
      FROM climactic_moves 
      ORDER BY timestamp DESC 
      LIMIT $1
    `;
    
    try {
      const result = await this.pool.query(query, [limit]);
      return result.rows.map(row => ({
        ...row,
        time: new Date(row.timestamp).toLocaleTimeString(),
        changePercent: parseFloat(row.changePercent).toFixed(2)
      }));
    } catch (error) {
      console.error('Error fetching climactic moves:', error);
      return [];
    }
  }

  // Volume analysis operations
  async insertVolumeData(volumeData) {
    const query = `
      INSERT INTO volume_data (timestamp, symbol, volume_1m, volume_5m, volume_15m, volume_1h, avg_volume, relative_volume)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `;
    
    const values = [
      volumeData.timestamp ? new Date(volumeData.timestamp) : new Date(),
      volumeData.symbol,
      volumeData.volume1m,
      volumeData.volume5m,
      volumeData.volume15m,
      volumeData.volume1h,
      volumeData.avgVolume,
      volumeData.relativeVolume
    ];

    try {
      const result = await this.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error inserting volume data:', error);
      throw error;
    }
  }

  async getVolumeAnalysis(limit = 10) {
    const query = `
      SELECT 
        id,
        timestamp,
        symbol as ticker,
        CASE 
          WHEN relative_volume > 2 THEN 'VWAP↗'
          ELSE 'VWAP↘'
        END as trend,
        CONCAT(', ROUND(avg_volume::numeric / 1000, 1), 'k') as volume,
        CONCAT(ROUND(relative_volume::numeric, 1), 'x') as "relVol"
      FROM volume_data 
      WHERE relative_volume > 1.1
      ORDER BY timestamp DESC 
      LIMIT $1
    `;
    
    try {
      const result = await this.pool.query(query, [limit]);
      return result.rows.map(row => ({
        ...row,
        time: new Date(row.timestamp).toLocaleTimeString(),
        price: `${(Math.random() * 70000 + 500).toFixed(2)}` // Mock price for now
      }));
    } catch (error) {
      console.error('Error fetching volume analysis:', error);
      return [];
    }
  }

  // Analytics and aggregation queries
  async getTopLiquidationsByAmount(limit = 10, timeWindow = '1 hour') {
    const query = `
      SELECT 
        symbol,
        side,
        SUM(amount) as total_amount,
        COUNT(*) as liquidation_count,
        AVG(price) as avg_price
      FROM liquidations 
      WHERE timestamp > NOW() - INTERVAL '${timeWindow}'
      GROUP BY symbol, side
      ORDER BY total_amount DESC
      LIMIT $1
    `;
    
    try {
      const result = await this.pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching top liquidations:', error);
      return [];
    }
  }

  async getVolumeSpikes(threshold = 3.0, limit = 20) {
    const query = `
      SELECT 
        v1.symbol,
        v1.relative_volume,
        v1.timestamp,
        v1.volume_1h
      FROM volume_data v1
      WHERE v1.relative_volume > $1
      AND v1.timestamp > NOW() - INTERVAL '1 hour'
      ORDER BY v1.relative_volume DESC
      LIMIT $2
    `;
    
    try {
      const result = await this.pool.query(query, [threshold, limit]);
      return result.rows;
    } catch (error) {
      console.error('Error fetching volume spikes:', error);
      return [];
    }
  }

  async getSymbolStatistics(symbol, timeWindow = '24 hours') {
    const query = `
      SELECT 
        COUNT(t.id) as trade_count,
        SUM(t.volume) as total_volume,
        AVG(t.price) as avg_price,
        MIN(t.price) as min_price,
        MAX(t.price) as max_price,
        COALESCE(l.liquidation_count, 0) as liquidation_count,
        COALESCE(l.liquidation_amount, 0) as total_liquidated
      FROM trades t
      LEFT JOIN (
        SELECT 
          symbol,
          COUNT(*) as liquidation_count,
          SUM(amount) as liquidation_amount
        FROM liquidations 
        WHERE symbol = $1 
        AND timestamp > NOW() - INTERVAL '${timeWindow}'
        GROUP BY symbol
      ) l ON t.symbol = l.symbol
      WHERE t.symbol = $1 
      AND t.timestamp > NOW() - INTERVAL '${timeWindow}'
      GROUP BY t.symbol, l.liquidation_count, l.liquidation_amount
    `;
    
    try {
      const result = await this.pool.query(query, [symbol]);
      return result.rows[0] || null;
    } catch (error) {
      console.error('Error fetching symbol statistics:', error);
      return null;
    }
  }

  // Cleanup operations
  async cleanupOldData(daysToKeep = 7) {
    const queries = [
      `DELETE FROM trades WHERE timestamp < NOW() - INTERVAL '${daysToKeep} days'`,
      `DELETE FROM liquidations WHERE timestamp < NOW() - INTERVAL '${daysToKeep} days'`,
      `DELETE FROM volume_data WHERE timestamp < NOW() - INTERVAL '${daysToKeep} days'`,
      `DELETE FROM climactic_moves WHERE timestamp < NOW() - INTERVAL '${daysToKeep} days'`
    ];

    try {
      let totalDeleted = 0;
      for (const query of queries) {
        const result = await this.pool.query(query);
        totalDeleted += result.rowCount;
      }
      
      console.log(`🧹 Cleaned up ${totalDeleted} old records`);
      return totalDeleted;
    } catch (error) {
      console.error('Error cleaning up old data:', error);
      return 0;
    }
  }

  // Health and monitoring
  async getHealthStats() {
    const query = `
      SELECT 
        'trades' as table_name,
        COUNT(*) as row_count,
        MIN(timestamp) as oldest_record,
        MAX(timestamp) as newest_record
      FROM trades
      WHERE timestamp > NOW() - INTERVAL '24 hours'
      
      UNION ALL
      
      SELECT 
        'liquidations' as table_name,
        COUNT(*) as row_count,
        MIN(timestamp) as oldest_record,
        MAX(timestamp) as newest_record
      FROM liquidations
      WHERE timestamp > NOW() - INTERVAL '24 hours'
      
      UNION ALL
      
      SELECT 
        'climactic_moves' as table_name,
        COUNT(*) as row_count,
        MIN(timestamp) as oldest_record,
        MAX(timestamp) as newest_record
      FROM climactic_moves
      WHERE timestamp > NOW() - INTERVAL '24 hours'
    `;
    
    try {
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error fetching health stats:', error);
      return [];
    }
  }

  async getDatabaseSize() {
    const query = `
      SELECT 
        schemaname,
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        pg_total_relation_size(schemaname||'.'||tablename) as size_bytes
      FROM pg_tables 
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `;
    
    try {
      const result = await this.pool.query(query);
      return result.rows;
    } catch (error) {
      console.error('Error fetching database size:', error);
      return [];
    }
  }

  // Connection management
  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.isConnected = false;
      console.log('🔌 Disconnected from PostgreSQL database');
    }
  }

  async testConnection() {
    try {
      const result = await this.pool.query('SELECT NOW() as current_time, version() as postgres_version');
      return {
        connected: true,
        ...result.rows[0]
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  // Transaction support
  async withTransaction(callback) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // Batch operations for better performance
  async batchInsertTrades(trades) {
    if (!trades || trades.length === 0) return;

    const values = trades.map((trade, index) => {
      const offset = index * 6;
      return `(${offset + 1}, ${offset + 2}, ${offset + 3}, ${offset + 4}, ${offset + 5}, ${offset + 6})`;
    }).join(', ');

    const query = `
      INSERT INTO trades (timestamp, symbol, price, volume, side, exchange)
      VALUES ${values}
    `;

    const params = trades.flatMap(trade => [
      trade.timestamp ? new Date(trade.timestamp) : new Date(),
      trade.symbol,
      trade.price,
      trade.volume,
      trade.side,
      trade.exchange || 'binance'
    ]);

    try {
      await this.pool.query(query, params);
      console.log(`✅ Batch inserted ${trades.length} trades`);
    } catch (error) {
      console.error('Error batch inserting trades:', error);
      throw error;
    }
  }
}

module.exports = Database;
