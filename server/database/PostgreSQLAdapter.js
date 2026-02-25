/**
 * PostgreSQLAdapter - Centralized cloud database adapter
 *
 * Features:
 * - Connects to remote PostgreSQL database (Supabase, Railway, etc.)
 * - All game servers share the same centralized database
 * - Automatic schema creation and migrations
 * - Connection pooling for performance
 * - Ready for multi-host deployment
 *
 * Setup:
 * 1. Create PostgreSQL database on Supabase (free tier)
 * 2. Set DATABASE_URL environment variable
 * 3. Server will auto-create schema on first connection
 */

const { Pool } = require('pg');

class PostgreSQLAdapter {
  constructor(connectionString = null) {
    // Get connection string from environment or parameter
    this.connectionString = connectionString || process.env.DATABASE_URL;

    if (!this.connectionString) {
      throw new Error(
        'DATABASE_URL environment variable is required for PostgreSQL adapter.\n' +
        'Example: DATABASE_URL=postgresql://user:pass@host:5432/dbname node server.js'
      );
    }

    // Create connection pool
    this.pool = new Pool({
      connectionString: this.connectionString,
      ssl: this.connectionString.includes('supabase.co') || this.connectionString.includes('railway.app')
        ? { rejectUnauthorized: false }
        : false,
      max: 20, // Maximum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    console.log('[DATABASE] PostgreSQL adapter initialized');
    console.log('[DATABASE] Connecting to remote database...');

    // Initialize schema
    this._initializeSchema()
      .then(() => {
        console.log('[DATABASE] PostgreSQL schema ready');
      })
      .catch(err => {
        console.error('[DATABASE] Failed to initialize schema:', err.message);
        throw err;
      });
  }

  /**
   * Create database schema if it doesn't exist
   */
  async _initializeSchema() {
    const client = await this.pool.connect();
    try {
      // Create games table
      await client.query(`
        CREATE TABLE IF NOT EXISTS games (
          game_id TEXT PRIMARY KEY,
          host_player_id TEXT NOT NULL,
          status TEXT NOT NULL,
          config JSONB NOT NULL,
          player_ids JSONB NOT NULL,
          start_time TIMESTAMPTZ,
          end_time TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);

      // Create players table
      await client.query(`
        CREATE TABLE IF NOT EXISTS players (
          player_id TEXT PRIMARY KEY,
          game_id TEXT NOT NULL REFERENCES games(game_id),
          name TEXT NOT NULL,
          cash DECIMAL NOT NULL,
          inventory JSONB NOT NULL,
          open_order_ids JSONB NOT NULL,
          trade_history JSONB NOT NULL,
          sets_formed INTEGER DEFAULT 0,
          initial_cash DECIMAL NOT NULL,
          initial_inventory JSONB NOT NULL,
          final_score DECIMAL,
          pnl_breakdown JSONB,
          joined_at TIMESTAMPTZ NOT NULL,
          is_bot BOOLEAN DEFAULT false,
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
        CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
        CREATE INDEX IF NOT EXISTS idx_players_is_bot ON players(is_bot);
      `);

      // Create orders table
      await client.query(`
        CREATE TABLE IF NOT EXISTS orders (
          order_id TEXT PRIMARY KEY,
          game_id TEXT NOT NULL REFERENCES games(game_id),
          player_id TEXT NOT NULL REFERENCES players(player_id),
          player_name TEXT NOT NULL,
          product TEXT NOT NULL,
          side TEXT NOT NULL,
          order_type TEXT NOT NULL,
          quantity DECIMAL NOT NULL,
          remaining_quantity DECIMAL NOT NULL,
          price DECIMAL,
          status TEXT NOT NULL,
          fills JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_orders_game ON orders(game_id);
        CREATE INDEX IF NOT EXISTS idx_orders_player ON orders(player_id);
        CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(game_id, product, status);
        CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
        CREATE INDEX IF NOT EXISTS idx_orders_side ON orders(side);
        CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
      `);

      // Create trades table
      await client.query(`
        CREATE TABLE IF NOT EXISTS trades (
          trade_id TEXT PRIMARY KEY,
          game_id TEXT NOT NULL REFERENCES games(game_id),
          buy_order_id TEXT NOT NULL REFERENCES orders(order_id),
          sell_order_id TEXT NOT NULL REFERENCES orders(order_id),
          buyer_id TEXT NOT NULL REFERENCES players(player_id),
          seller_id TEXT NOT NULL REFERENCES players(player_id),
          product TEXT NOT NULL,
          quantity DECIMAL NOT NULL,
          price DECIMAL NOT NULL,
          value DECIMAL NOT NULL,
          executed_at TIMESTAMPTZ NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_trades_game ON trades(game_id);
        CREATE INDEX IF NOT EXISTS idx_trades_buyer ON trades(buyer_id);
        CREATE INDEX IF NOT EXISTS idx_trades_seller ON trades(seller_id);
        CREATE INDEX IF NOT EXISTS idx_trades_product ON trades(game_id, product);
        CREATE INDEX IF NOT EXISTS idx_trades_executed ON trades(executed_at);
      `);

      // Create events table
      await client.query(`
        CREATE TABLE IF NOT EXISTS events (
          event_id SERIAL PRIMARY KEY,
          game_id TEXT REFERENCES games(game_id),
          event_type TEXT NOT NULL,
          event_data JSONB NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_events_game ON events(game_id);
        CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
        CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      `);

    } finally {
      client.release();
    }
  }

  // ==================== GAME OPERATIONS ====================

  async saveGame(gameData) {
    await this.pool.query(`
      INSERT INTO games (
        game_id, host_player_id, status, config, player_ids,
        start_time, end_time, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (game_id) DO UPDATE SET
        host_player_id = $2,
        status = $3,
        config = $4,
        player_ids = $5,
        start_time = $6,
        end_time = $7,
        updated_at = NOW()
    `, [
      gameData.gameId,
      gameData.hostPlayerId,
      gameData.status,
      JSON.stringify(gameData.config),
      JSON.stringify(gameData.playerIds),
      gameData.startTime,
      gameData.endTime,
      gameData.createdAt
    ]);
  }

  async getGame(gameId) {
    const result = await this.pool.query(
      'SELECT * FROM games WHERE game_id = $1',
      [gameId]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
      gameId: row.game_id,
      hostPlayerId: row.host_player_id,
      status: row.status,
      config: row.config,
      playerIds: row.player_ids,
      startTime: row.start_time,
      endTime: row.end_time,
      createdAt: row.created_at
    };
  }

  // ==================== PLAYER OPERATIONS ====================

  async savePlayer(playerData) {
    await this.pool.query(`
      INSERT INTO players (
        player_id, game_id, name, cash, inventory, open_order_ids,
        trade_history, sets_formed, initial_cash, initial_inventory,
        final_score, pnl_breakdown, joined_at, is_bot, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW())
      ON CONFLICT (player_id) DO UPDATE SET
        cash = $4,
        inventory = $5,
        open_order_ids = $6,
        trade_history = $7,
        sets_formed = $8,
        final_score = $11,
        pnl_breakdown = $12,
        updated_at = NOW()
    `, [
      playerData.playerId,
      playerData.gameId,
      playerData.name,
      playerData.cash,
      JSON.stringify(playerData.inventory),
      JSON.stringify(playerData.openOrderIds),
      JSON.stringify(playerData.tradeHistory),
      playerData.setsFormed,
      playerData.initialCash,
      JSON.stringify(playerData.initialInventory),
      playerData.finalScore,
      playerData.pnlBreakdown ? JSON.stringify(playerData.pnlBreakdown) : null,
      playerData.joinedAt,
      playerData.isBot
    ]);
  }

  async getPlayer(playerId) {
    const result = await this.pool.query(
      'SELECT * FROM players WHERE player_id = $1',
      [playerId]
    );

    if (result.rows.length === 0) return null;
    return this._rowToPlayerData(result.rows[0]);
  }

  async getPlayersByGame(gameId) {
    const result = await this.pool.query(
      'SELECT * FROM players WHERE game_id = $1',
      [gameId]
    );
    return result.rows.map(row => this._rowToPlayerData(row));
  }

  _rowToPlayerData(row) {
    return {
      playerId: row.player_id,
      gameId: row.game_id,
      name: row.name,
      cash: parseFloat(row.cash),
      inventory: row.inventory,
      openOrderIds: row.open_order_ids,
      tradeHistory: row.trade_history,
      setsFormed: row.sets_formed,
      initialCash: parseFloat(row.initial_cash),
      initialInventory: row.initial_inventory,
      finalScore: row.final_score ? parseFloat(row.final_score) : null,
      pnlBreakdown: row.pnl_breakdown,
      joinedAt: row.joined_at,
      isBot: row.is_bot
    };
  }

  // ==================== ORDER OPERATIONS ====================

  async saveOrder(orderData) {
    await this.pool.query(`
      INSERT INTO orders (
        order_id, game_id, player_id, player_name, product, side,
        order_type, quantity, remaining_quantity, price, status,
        fills, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (order_id) DO UPDATE SET
        remaining_quantity = $9,
        status = $11,
        fills = $12,
        updated_at = $14
    `, [
      orderData.orderId,
      orderData.gameId,
      orderData.playerId,
      orderData.playerName,
      orderData.product,
      orderData.side,
      orderData.orderType,
      orderData.quantity,
      orderData.remainingQuantity,
      orderData.price,
      orderData.status,
      JSON.stringify(orderData.fills),
      orderData.createdAt,
      orderData.updatedAt
    ]);
  }

  async getOrder(orderId) {
    const result = await this.pool.query(
      'SELECT * FROM orders WHERE order_id = $1',
      [orderId]
    );

    if (result.rows.length === 0) return null;
    return this._rowToOrderData(result.rows[0]);
  }

  async getOrdersByPlayer(playerId) {
    const result = await this.pool.query(
      'SELECT * FROM orders WHERE player_id = $1',
      [playerId]
    );
    return result.rows.map(row => this._rowToOrderData(row));
  }

  async getOrdersByProduct(gameId, product) {
    const result = await this.pool.query(
      `SELECT * FROM orders
       WHERE game_id = $1 AND product = $2 AND status = 'open'`,
      [gameId, product]
    );
    return result.rows.map(row => this._rowToOrderData(row));
  }

  _rowToOrderData(row) {
    return {
      orderId: row.order_id,
      gameId: row.game_id,
      playerId: row.player_id,
      playerName: row.player_name,
      product: row.product,
      side: row.side,
      orderType: row.order_type,
      quantity: parseFloat(row.quantity),
      remainingQuantity: parseFloat(row.remaining_quantity),
      price: row.price ? parseFloat(row.price) : null,
      status: row.status,
      fills: row.fills,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ==================== TRADE OPERATIONS ====================

  async saveTrade(tradeData) {
    await this.pool.query(`
      INSERT INTO trades (
        trade_id, game_id, buy_order_id, sell_order_id, buyer_id,
        seller_id, product, quantity, price, value, executed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (trade_id) DO NOTHING
    `, [
      tradeData.tradeId,
      tradeData.gameId,
      tradeData.buyOrderId,
      tradeData.sellOrderId,
      tradeData.buyerId,
      tradeData.sellerId,
      tradeData.product,
      tradeData.quantity,
      tradeData.price,
      tradeData.value,
      tradeData.executedAt
    ]);
  }

  async getTradesByGame(gameId) {
    const result = await this.pool.query(
      'SELECT * FROM trades WHERE game_id = $1 ORDER BY executed_at',
      [gameId]
    );
    return result.rows.map(row => ({
      tradeId: row.trade_id,
      gameId: row.game_id,
      buyOrderId: row.buy_order_id,
      sellOrderId: row.sell_order_id,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      product: row.product,
      quantity: parseFloat(row.quantity),
      price: parseFloat(row.price),
      value: parseFloat(row.value),
      executedAt: row.executed_at
    }));
  }

  // ==================== EVENT OPERATIONS ====================

  async saveEvent(event) {
    await this.pool.query(`
      INSERT INTO events (game_id, event_type, event_data, timestamp)
      VALUES ($1, $2, $3, $4)
    `, [
      event.gameId || null,
      event.type,
      JSON.stringify(event),
      event.timestamp || new Date().toISOString()
    ]);
  }

  async getEventsByGame(gameId) {
    const result = await this.pool.query(
      'SELECT * FROM events WHERE game_id = $1 ORDER BY timestamp',
      [gameId]
    );
    return result.rows.map(row => row.event_data);
  }

  // ==================== EXPORT OPERATIONS ====================

  async exportAll(gameId) {
    return {
      game: await this.getGame(gameId),
      players: await this.getPlayersByGame(gameId),
      trades: await this.getTradesByGame(gameId),
      orders: await this.getOrdersByPlayer(gameId), // This needs to be fixed
      events: await this.getEventsByGame(gameId)
    };
  }

  // ==================== UTILITY OPERATIONS ====================

  /**
   * Get database statistics
   */
  async getStats() {
    const result = await this.pool.query(`
      SELECT
        (SELECT COUNT(*) FROM games) as games,
        (SELECT COUNT(*) FROM players) as players,
        (SELECT COUNT(*) FROM orders) as orders,
        (SELECT COUNT(*) FROM trades) as trades,
        (SELECT COUNT(*) FROM events) as events
    `);

    return {
      ...result.rows[0],
      database: 'PostgreSQL',
      connection: this.connectionString.includes('supabase.co')
        ? 'Supabase'
        : this.connectionString.includes('railway.app')
        ? 'Railway'
        : 'PostgreSQL',
      poolSize: this.pool.totalCount,
      activeConnections: this.pool.idleCount
    };
  }

  /**
   * Close database connection pool
   */
  async close() {
    await this.pool.end();
    console.log('[DATABASE] PostgreSQL connection pool closed');
  }
}

module.exports = PostgreSQLAdapter;
