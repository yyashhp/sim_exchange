/**
 * SQLiteAdapter - Production-ready database adapter for storing game data
 *
 * Features:
 * - Persistent storage in SQLite database file
 * - Full schema with indexes for performance
 * - Prepared statements for security
 * - Automatic database initialization
 * - Ready for data analysis and export
 *
 * Database file location: server/database/trading_game.db
 */

const Database = require('better-sqlite3');
const path = require('path');

class SQLiteAdapter {
  constructor(dbPath = null) {
    // Default to trading_game.db in the database directory
    this.dbPath = dbPath || path.join(__dirname, 'trading_game.db');
    this.db = new Database(this.dbPath);

    // Enable foreign keys and optimize for performance
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency

    console.log(`[DATABASE] SQLite initialized: ${this.dbPath}`);

    this._createSchema();
    this._prepareStatements();
  }

  /**
   * Create database schema
   */
  _createSchema() {
    // Games table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        game_id TEXT PRIMARY KEY,
        host_player_id TEXT NOT NULL,
        status TEXT NOT NULL,
        config TEXT NOT NULL,
        player_ids TEXT NOT NULL,
        start_time TEXT,
        end_time TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Players table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        player_id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        name TEXT NOT NULL,
        cash REAL NOT NULL,
        inventory TEXT NOT NULL,
        open_order_ids TEXT NOT NULL,
        trade_history TEXT NOT NULL,
        sets_formed INTEGER DEFAULT 0,
        initial_cash REAL NOT NULL,
        initial_inventory TEXT NOT NULL,
        final_score REAL,
        pnl_breakdown TEXT,
        joined_at TEXT NOT NULL,
        is_bot INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (game_id) REFERENCES games(game_id)
      );

      CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_id);
      CREATE INDEX IF NOT EXISTS idx_players_name ON players(name);
      CREATE INDEX IF NOT EXISTS idx_players_is_bot ON players(is_bot);
    `);

    // Orders table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        player_name TEXT NOT NULL,
        product TEXT NOT NULL,
        side TEXT NOT NULL,
        order_type TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        remaining_quantity INTEGER NOT NULL,
        price REAL,
        status TEXT NOT NULL,
        fills TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(game_id),
        FOREIGN KEY (player_id) REFERENCES players(player_id)
      );

      CREATE INDEX IF NOT EXISTS idx_orders_game ON orders(game_id);
      CREATE INDEX IF NOT EXISTS idx_orders_player ON orders(player_id);
      CREATE INDEX IF NOT EXISTS idx_orders_product ON orders(game_id, product, status);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_side ON orders(side);
      CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
    `);

    // Trades table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        trade_id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL,
        buy_order_id TEXT NOT NULL,
        sell_order_id TEXT NOT NULL,
        buyer_id TEXT NOT NULL,
        seller_id TEXT NOT NULL,
        product TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        price REAL NOT NULL,
        value REAL NOT NULL,
        executed_at TEXT NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(game_id),
        FOREIGN KEY (buy_order_id) REFERENCES orders(order_id),
        FOREIGN KEY (sell_order_id) REFERENCES orders(order_id),
        FOREIGN KEY (buyer_id) REFERENCES players(player_id),
        FOREIGN KEY (seller_id) REFERENCES players(player_id)
      );

      CREATE INDEX IF NOT EXISTS idx_trades_game ON trades(game_id);
      CREATE INDEX IF NOT EXISTS idx_trades_buyer ON trades(buyer_id);
      CREATE INDEX IF NOT EXISTS idx_trades_seller ON trades(seller_id);
      CREATE INDEX IF NOT EXISTS idx_trades_product ON trades(game_id, product);
      CREATE INDEX IF NOT EXISTS idx_trades_executed ON trades(executed_at);
    `);

    // Events table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT,
        event_type TEXT NOT NULL,
        event_data TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(game_id)
      );

      CREATE INDEX IF NOT EXISTS idx_events_game ON events(game_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
    `);

    console.log('[DATABASE] Schema created/verified');
  }

  /**
   * Prepare reusable SQL statements for performance
   */
  _prepareStatements() {
    // Game statements
    this.stmts = {
      saveGame: this.db.prepare(`
        INSERT OR REPLACE INTO games (
          game_id, host_player_id, status, config, player_ids,
          start_time, end_time, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `),
      getGame: this.db.prepare('SELECT * FROM games WHERE game_id = ?'),

      // Player statements
      savePlayer: this.db.prepare(`
        INSERT OR REPLACE INTO players (
          player_id, game_id, name, cash, inventory, open_order_ids,
          trade_history, sets_formed, initial_cash, initial_inventory,
          final_score, pnl_breakdown, joined_at, is_bot, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `),
      getPlayer: this.db.prepare('SELECT * FROM players WHERE player_id = ?'),
      getPlayersByGame: this.db.prepare('SELECT * FROM players WHERE game_id = ?'),

      // Order statements
      saveOrder: this.db.prepare(`
        INSERT OR REPLACE INTO orders (
          order_id, game_id, player_id, player_name, product, side,
          order_type, quantity, remaining_quantity, price, status,
          fills, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getOrder: this.db.prepare('SELECT * FROM orders WHERE order_id = ?'),
      getOrdersByPlayer: this.db.prepare('SELECT * FROM orders WHERE player_id = ?'),
      getOrdersByProduct: this.db.prepare(`
        SELECT * FROM orders
        WHERE game_id = ? AND product = ? AND status = 'open'
      `),

      // Trade statements
      saveTrade: this.db.prepare(`
        INSERT OR REPLACE INTO trades (
          trade_id, game_id, buy_order_id, sell_order_id, buyer_id,
          seller_id, product, quantity, price, value, executed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getTradesByGame: this.db.prepare('SELECT * FROM trades WHERE game_id = ?'),

      // Event statements
      saveEvent: this.db.prepare(`
        INSERT INTO events (game_id, event_type, event_data, timestamp)
        VALUES (?, ?, ?, ?)
      `)
    };
  }

  // ==================== GAME OPERATIONS ====================

  async saveGame(gameData) {
    this.stmts.saveGame.run(
      gameData.gameId,
      gameData.hostPlayerId,
      gameData.status,
      JSON.stringify(gameData.config),
      JSON.stringify(gameData.playerIds),
      gameData.startTime,
      gameData.endTime,
      gameData.createdAt
    );
  }

  async getGame(gameId) {
    const row = this.stmts.getGame.get(gameId);
    if (!row) return null;

    return {
      gameId: row.game_id,
      hostPlayerId: row.host_player_id,
      status: row.status,
      config: JSON.parse(row.config),
      playerIds: JSON.parse(row.player_ids),
      startTime: row.start_time,
      endTime: row.end_time,
      createdAt: row.created_at
    };
  }

  // ==================== PLAYER OPERATIONS ====================

  async savePlayer(playerData) {
    this.stmts.savePlayer.run(
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
      playerData.isBot ? 1 : 0
    );
  }

  async getPlayer(playerId) {
    const row = this.stmts.getPlayer.get(playerId);
    if (!row) return null;

    return this._rowToPlayerData(row);
  }

  async getPlayersByGame(gameId) {
    const rows = this.stmts.getPlayersByGame.all(gameId);
    return rows.map(row => this._rowToPlayerData(row));
  }

  _rowToPlayerData(row) {
    return {
      playerId: row.player_id,
      gameId: row.game_id,
      name: row.name,
      cash: row.cash,
      inventory: JSON.parse(row.inventory),
      openOrderIds: JSON.parse(row.open_order_ids),
      tradeHistory: JSON.parse(row.trade_history),
      setsFormed: row.sets_formed,
      initialCash: row.initial_cash,
      initialInventory: JSON.parse(row.initial_inventory),
      finalScore: row.final_score,
      pnlBreakdown: row.pnl_breakdown ? JSON.parse(row.pnl_breakdown) : null,
      joinedAt: row.joined_at,
      isBot: row.is_bot === 1
    };
  }

  // ==================== ORDER OPERATIONS ====================

  async saveOrder(orderData) {
    this.stmts.saveOrder.run(
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
    );
  }

  async getOrder(orderId) {
    const row = this.stmts.getOrder.get(orderId);
    if (!row) return null;

    return this._rowToOrderData(row);
  }

  async getOrdersByPlayer(playerId) {
    const rows = this.stmts.getOrdersByPlayer.all(playerId);
    return rows.map(row => this._rowToOrderData(row));
  }

  async getOrdersByProduct(gameId, product) {
    const rows = this.stmts.getOrdersByProduct.all(gameId, product);
    return rows.map(row => this._rowToOrderData(row));
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
      quantity: row.quantity,
      remainingQuantity: row.remaining_quantity,
      price: row.price,
      status: row.status,
      fills: JSON.parse(row.fills),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  // ==================== TRADE OPERATIONS ====================

  async saveTrade(tradeData) {
    this.stmts.saveTrade.run(
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
    );
  }

  async getTradesByGame(gameId) {
    const rows = this.stmts.getTradesByGame.all(gameId);
    return rows.map(row => ({
      tradeId: row.trade_id,
      gameId: row.game_id,
      buyOrderId: row.buy_order_id,
      sellOrderId: row.sell_order_id,
      buyerId: row.buyer_id,
      sellerId: row.seller_id,
      product: row.product,
      quantity: row.quantity,
      price: row.price,
      value: row.value,
      executedAt: row.executed_at
    }));
  }

  // ==================== EVENT OPERATIONS ====================

  async saveEvent(event) {
    this.stmts.saveEvent.run(
      event.gameId || null,
      event.type,
      JSON.stringify(event),
      event.timestamp || new Date().toISOString()
    );
  }

  async getEventsByGame(gameId) {
    const rows = this.db.prepare('SELECT * FROM events WHERE game_id = ? ORDER BY timestamp').all(gameId);
    return rows.map(row => JSON.parse(row.event_data));
  }

  // ==================== EXPORT OPERATIONS ====================

  async exportAll(gameId) {
    return {
      game: await this.getGame(gameId),
      players: await this.getPlayersByGame(gameId),
      trades: await this.getTradesByGame(gameId),
      orders: this.db.prepare('SELECT * FROM orders WHERE game_id = ?').all(gameId).map(row => this._rowToOrderData(row)),
      events: await this.getEventsByGame(gameId)
    };
  }

  // ==================== UTILITY OPERATIONS ====================

  /**
   * Get database statistics
   */
  getStats() {
    return {
      games: this.db.prepare('SELECT COUNT(*) as count FROM games').get().count,
      players: this.db.prepare('SELECT COUNT(*) as count FROM players').get().count,
      orders: this.db.prepare('SELECT COUNT(*) as count FROM orders').get().count,
      trades: this.db.prepare('SELECT COUNT(*) as count FROM trades').get().count,
      events: this.db.prepare('SELECT COUNT(*) as count FROM events').get().count,
      dbPath: this.dbPath,
      dbSizeMB: (require('fs').statSync(this.dbPath).size / 1024 / 1024).toFixed(2)
    };
  }

  /**
   * Close database connection
   */
  close() {
    this.db.close();
    console.log('[DATABASE] Connection closed');
  }
}

module.exports = SQLiteAdapter;
