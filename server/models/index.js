/**
 * Data Models for Trading Exchange Game
 *
 * These models are structured for easy database integration later.
 * Currently uses in-memory storage with console logging.
 *
 * === DATABASE INTEGRATION GUIDE ===
 * To add database support:
 * 1. Implement the DatabaseAdapter interface below
 * 2. Replace InMemoryAdapter with your DB adapter (MongoDB, PostgreSQL, etc.)
 * 3. Pass adapter to DataStore constructor
 *
 * All data classes have toJSON() methods that return DB-ready objects.
 */

const { v4: uuidv4 } = require('uuid');

// ==================== UTILITY FUNCTIONS ====================

/**
 * Round to 2 decimal places to avoid floating point precision errors
 * Example: 161.1000000000002 -> 161.10
 */
function round2(value) {
  return Math.round(value * 100) / 100;
}

// ==================== DATABASE ADAPTER INTERFACE ====================

/**
 * DatabaseAdapter - Interface for database operations
 * Implement this to connect to any database
 */
class InMemoryAdapter {
  constructor() {
    this.games = new Map();
    this.players = new Map();
    this.orders = new Map();
    this.trades = new Map();
    this.events = [];
  }

  // Game operations
  async saveGame(gameData) { this.games.set(gameData.gameId, gameData); }
  async getGame(gameId) { return this.games.get(gameId) || null; }

  // Player operations
  async savePlayer(playerData) { this.players.set(playerData.playerId, playerData); }
  async getPlayer(playerId) { return this.players.get(playerId) || null; }
  async getPlayersByGame(gameId) {
    return Array.from(this.players.values()).filter(p => p.gameId === gameId);
  }

  // Order operations
  async saveOrder(orderData) { this.orders.set(orderData.orderId, orderData); }
  async getOrder(orderId) { return this.orders.get(orderId) || null; }
  async getOrdersByPlayer(playerId) {
    return Array.from(this.orders.values()).filter(o => o.playerId === playerId);
  }
  async getOrdersByProduct(gameId, product) {
    return Array.from(this.orders.values()).filter(
      o => o.gameId === gameId && o.product === product && o.status === 'open'
    );
  }

  // Trade operations
  async saveTrade(tradeData) { this.trades.set(tradeData.tradeId, tradeData); }
  async getTradesByGame(gameId) {
    return Array.from(this.trades.values()).filter(t => t.gameId === gameId);
  }

  // Event operations
  async saveEvent(event) { this.events.push(event); }
  async getEventsByGame(gameId) {
    return this.events.filter(e => e.gameId === gameId);
  }

  // Export all data for a game
  async exportAll(gameId) {
    return {
      game: await this.getGame(gameId),
      players: await this.getPlayersByGame(gameId),
      trades: await this.getTradesByGame(gameId),
      orders: Array.from(this.orders.values()).filter(o => o.gameId === gameId),
      events: await this.getEventsByGame(gameId)
    };
  }
}

// ==================== DATA STORE ====================

/**
 * DataStore - Data access layer
 * Wraps the database adapter and manages model instances
 * Logs structured data to console for debugging
 *
 * Performance optimization: Set deferWrites=true to batch all database
 * writes until game end, then call flushGameData(gameId) to persist.
 */
class DataStore {
  constructor(adapter = null, deferWrites = true) {
    this.adapter = adapter || new InMemoryAdapter();
    this.deferWrites = deferWrites; // If true, skip DB writes during gameplay
    // In-memory model instances (live objects, not just data)
    this._games = new Map();
    this._players = new Map();
    this._orders = new Map();
    this._trades = new Map();
    this._events = [];

    console.log(`[DATASTORE] Initialized with adapter: ${this.adapter.constructor.name}`);
    console.log(`[DATASTORE] Deferred writes: ${this.deferWrites ? 'ENABLED (batch write at game end)' : 'DISABLED (immediate writes)'}`);
  }

  // ---- Game operations ----
  saveGame(game) {
    this._games.set(game.gameId, game);
    // Persist to database (unless deferred)
    if (!this.deferWrites) {
      this.adapter.saveGame(game.toJSON());
    }
    return game;
  }

  getGame(gameId) {
    return this._games.get(gameId);
  }

  // ---- Player operations ----
  savePlayer(player) {
    this._players.set(player.playerId, player);
    // Persist to database (unless deferred)
    if (!this.deferWrites) {
      this.adapter.savePlayer(player.toJSON());
    }
    return player;
  }

  getPlayer(playerId) {
    return this._players.get(playerId);
  }

  getPlayersByGame(gameId) {
    return Array.from(this._players.values()).filter(p => p.gameId === gameId);
  }

  // ---- Order operations ----
  saveOrder(order) {
    this._orders.set(order.orderId, order);
    // Persist to database (unless deferred)
    if (!this.deferWrites) {
      this.adapter.saveOrder(order.toJSON());
    }
    return order;
  }

  getOrder(orderId) {
    return this._orders.get(orderId);
  }

  getOrdersByPlayer(playerId) {
    return Array.from(this._orders.values()).filter(o => o.playerId === playerId);
  }

  getOrdersByProduct(gameId, product) {
    return Array.from(this._orders.values()).filter(
      o => o.gameId === gameId && o.product === product && o.status === 'open'
    );
  }

  // ---- Trade operations ----
  saveTrade(trade) {
    this._trades.set(trade.tradeId, trade);
    console.log(`[TRADE] ${trade.quantity} ${trade.product} @ $${trade.price} | buyer=${trade.buyerId.slice(0,8)} seller=${trade.sellerId.slice(0,8)}`);
    // Persist to database (unless deferred)
    if (!this.deferWrites) {
      this.adapter.saveTrade(trade.toJSON());
    }
    return trade;
  }

  getTradesByGame(gameId) {
    return Array.from(this._trades.values()).filter(t => t.gameId === gameId);
  }

  // ---- Event logging ----
  logEvent(event) {
    this._events.push(event);
    console.log(`[EVENT] ${event.type}${event.playerName ? ' | ' + event.playerName : ''}${event.gameId ? ' | game=' + event.gameId.slice(0,8) : ''}`);
    // Persist to database (unless deferred)
    if (!this.deferWrites) {
      this.adapter.saveEvent(event);
    }
  }

  /**
   * Flush all game data to database (for deferred write mode)
   * Writes data in correct order to respect foreign key constraints:
   * 1. Game
   * 2. Players (reference game)
   * 3. Orders (reference game and players)
   * 4. Trades (reference orders and players)
   * 5. Events (reference game)
   */
  async flushGameData(gameId) {
    if (!this.deferWrites) {
      console.log('[DATASTORE] Flush skipped - not in deferred write mode');
      return;
    }

    const adapterName = this.adapter.constructor.name;
    console.log(`[DATASTORE] 💾 Flushing game ${gameId.slice(0, 8)} to database using ${adapterName}...`);
    const startTime = Date.now();

    try {
      // 1. Save game
      const game = this.getGame(gameId);
      if (game) {
        await this.adapter.saveGame(game.toJSON());
      }

      // 2. Save players
      const players = this.getPlayersByGame(gameId);
      for (const player of players) {
        await this.adapter.savePlayer(player.toJSON());
      }

      // 3. Save orders
      const orders = Array.from(this._orders.values()).filter(o => o.gameId === gameId);
      for (const order of orders) {
        await this.adapter.saveOrder(order.toJSON());
      }

      // 4. Save trades (must be after orders due to foreign keys)
      const trades = this.getTradesByGame(gameId);
      for (const trade of trades) {
        await this.adapter.saveTrade(trade.toJSON());
      }

      // 5. Save events
      const events = this._events.filter(e => e.gameId === gameId);
      for (const event of events) {
        await this.adapter.saveEvent(event);
      }

      const duration = Date.now() - startTime;
      console.log(`[DATASTORE] ✅ Database flush complete in ${duration}ms`);
      console.log(`[DATASTORE] Saved: ${players.length} players, ${orders.length} orders, ${trades.length} trades, ${events.length} events`);
    } catch (error) {
      console.error('[DATASTORE] ❌ Database flush failed:', error.message);
      throw error;
    }
  }

  // ---- Export operations ----
  exportGameData(gameId) {
    const game = this.getGame(gameId);
    const players = this.getPlayersByGame(gameId);
    const trades = this.getTradesByGame(gameId);
    const orders = Array.from(this._orders.values()).filter(o => o.gameId === gameId);
    const events = this._events.filter(e => e.gameId === gameId);

    const exportData = {
      game: game?.toJSON(),
      players: players.map(p => p.toJSON()),
      trades: trades.map(t => t.toJSON()),
      orders: orders.map(o => o.toJSON()),
      events: events,
      exportedAt: new Date().toISOString()
    };

    // Print structured summary to terminal
    this.printGameSummary(exportData);

    return exportData;
  }

  /**
   * Print a human-readable game summary to the terminal
   * This is where data would be sent to a database in production
   */
  printGameSummary(data) {
    console.log('\n' + '='.repeat(60));
    console.log('  GAME DATA EXPORT - Ready for Database Upload');
    console.log('='.repeat(60));

    if (data.game) {
      console.log(`\n[GAME] ID: ${data.game.gameId}`);
      console.log(`[GAME] Status: ${data.game.status}`);
      console.log(`[GAME] Started: ${data.game.startTime}`);
      console.log(`[GAME] Ended: ${data.game.endTime}`);
      console.log(`[GAME] Players: ${data.game.playerIds.length}`);
    }

    console.log(`\n[PLAYERS] Count: ${data.players.length}`);
    for (const player of data.players) {
      console.log(`  - ${player.name} (${player.playerId.slice(0,8)})`);
      console.log(`    Cash: $${player.cash} | Sets: ${player.setsFormed}`);
      console.log(`    Inventory: ${JSON.stringify(player.inventory)}`);
      if (player.pnlBreakdown) {
        console.log(`    Final Score: $${player.pnlBreakdown.totalScore} | PnL: ${player.pnlBreakdown.pnl >= 0 ? '+' : ''}$${player.pnlBreakdown.pnl}`);
      }
    }

    console.log(`\n[TRADES] Count: ${data.trades.length}`);
    console.log(`[ORDERS] Count: ${data.orders.length}`);
    console.log(`[EVENTS] Count: ${data.events.length}`);

    console.log('\n' + '='.repeat(60));
    console.log('  ✅ Game data flushed to database automatically');
    console.log('  All game data written in correct order');
    console.log('='.repeat(60) + '\n');
  }
}

// ==================== GAME MODEL ====================

class Game {
  constructor(hostPlayerId, config, gameMode = 'sandwich', question = null) {
    this.gameId = uuidv4();
    this.hostPlayerId = hostPlayerId;
    this.status = 'lobby'; // 'lobby' | 'running' | 'ended' | 'awaiting_value'
    this.gameMode = gameMode; // 'sandwich' | 'randomProduct'
    this.question = question; // For Random Product mode
    this.correctValue = null; // For Random Product mode - set at end of game

    // Apply game mode-specific configuration
    if (gameMode === 'sandwich') {
      this.config = this._randomizeEconomics(config);
    } else if (gameMode === 'randomProduct') {
      this.config = this._setupRandomProduct(config);
    } else {
      this.config = JSON.parse(JSON.stringify(config));
    }

    this.playerIds = [];
    this.startTime = null;
    this.endTime = null;
    this.createdAt = new Date().toISOString();
  }

  /**
   * Setup Random Product mode configuration
   * - Single product
   * - No scrap values or recipes needed
   * - Players have infinite cash (managed in player logic)
   */
  _setupRandomProduct(baseConfig) {
    const config = JSON.parse(JSON.stringify(baseConfig)); // Deep clone

    // Use a single generic product for Random Product mode
    config.products = ['product'];
    config.gameMode = 'randomProduct';

    // These aren't used in Random Product mode but keep them for compatibility
    config.scrapValues = { product: 0 };
    config.setValue = 0;
    config.setRecipe = { product: 0 };

    console.log('\n[GAME] 🎯 Random Product Mode');
    console.log('[GAME] Question:', this.question);
    console.log('[GAME] Trading single product with infinite cash');
    console.log('');

    return config;
  }

  /**
   * Randomize game economics for variety (Sandwich Exchange mode only)
   * - Scrap values: 1-10 for each product
   * - Recipe: 0-3 of each ingredient
   * - Sandwich value: sum of ingredient values + random premium (0.50 to 25% of base)
   */
  _randomizeEconomics(baseConfig) {
    const config = JSON.parse(JSON.stringify(baseConfig)); // Deep clone

    // Randomize scrap values (1-10)
    config.scrapValues = {};
    for (const product of config.products) {
      config.scrapValues[product] = Math.floor(Math.random() * 10) + 1;
    }

    // Randomize sandwich recipe (0-3 of each ingredient)
    config.setRecipe = {};
    let totalIngredients = 0;
    for (const product of config.products) {
      const amount = Math.floor(Math.random() * 4); // 0-3
      config.setRecipe[product] = amount;
      totalIngredients += amount;
    }

    // Ensure at least one ingredient is required
    if (totalIngredients === 0) {
      const randomProduct = config.products[Math.floor(Math.random() * config.products.length)];
      config.setRecipe[randomProduct] = 1;
      totalIngredients = 1;
    }

    // Calculate sandwich base value (sum of ingredient scrap values)
    let baseValue = 0;
    for (const product of config.products) {
      baseValue += config.setRecipe[product] * config.scrapValues[product];
    }

    // Add random premium: 0.50 to 25% of base value
    const minPremium = 0.50;
    const maxPremium = baseValue * 0.25;
    const premium = minPremium + Math.random() * (maxPremium - minPremium);

    config.setValue = round2(baseValue + premium);

    // Log the randomized economics
    console.log('\n[GAME] 🎲 Randomized Economics:');
    console.log('[GAME] Scrap Values:', config.scrapValues);
    console.log('[GAME] Recipe:', config.setRecipe);
    console.log('[GAME] Sandwich Value: $' + config.setValue + ` (base: $${baseValue}, premium: $${round2(premium)})`);
    console.log('');

    return config;
  }

  /**
   * Set the correct value for Random Product mode (called by host at end of game)
   */
  setCorrectValue(value) {
    if (this.gameMode !== 'randomProduct') {
      throw new Error('Can only set correct value in Random Product mode');
    }
    this.correctValue = value;
    this.correctValue = value;
    console.log(`[GAME] Correct value set to: ${value}`);
  }

  addPlayer(playerId) {
    if (!this.playerIds.includes(playerId)) {
      this.playerIds.push(playerId);
    }
  }

  removePlayer(playerId) {
    this.playerIds = this.playerIds.filter(id => id !== playerId);
  }

  start() {
    this.status = 'running';
    this.startTime = new Date().toISOString();
  }

  end() {
    this.status = 'ended';
    this.endTime = new Date().toISOString();
  }

  getRemainingTime() {
    if (this.status !== 'running' || !this.startTime) return this.config.gameDuration;
    const elapsed = (Date.now() - new Date(this.startTime).getTime()) / 1000;
    return Math.max(0, this.config.gameDuration - elapsed);
  }

  toJSON() {
    return {
      gameId: this.gameId,
      hostPlayerId: this.hostPlayerId,
      status: this.status,
      gameMode: this.gameMode,
      question: this.question,
      correctValue: this.correctValue,
      config: this.config,
      playerIds: this.playerIds,
      startTime: this.startTime,
      endTime: this.endTime,
      createdAt: this.createdAt
    };
  }
}

// ==================== PLAYER MODEL ====================

class Player {
  constructor(gameId, name, startingCash, startingInventory, isBot = false, gameMode = 'sandwich') {
    this.playerId = uuidv4();
    this.gameId = gameId;
    this.name = name;
    this.cash = startingCash;
    this.inventory = { ...startingInventory };
    this.openOrderIds = [];
    this.tradeHistory = [];
    this.setsFormed = 0;
    this.initialCash = startingCash;
    this.initialInventory = { ...startingInventory };
    this.finalScore = null;
    this.pnlBreakdown = null;
    this.joinedAt = new Date().toISOString();
    this.isBot = isBot;
    this.gameMode = gameMode;
    this.position = 0; // For Random Product mode: net position (positive = long, negative = short)
  }

  getInventoryScrapValue(scrapValues) {
    let value = 0;
    for (const [product, quantity] of Object.entries(this.inventory)) {
      value += quantity * (scrapValues[product] || 0);
    }
    return value;
  }

  getCompleteSets(setRecipe) {
    let minSets = Infinity;
    for (const [product, required] of Object.entries(setRecipe)) {
      const available = this.inventory[product] || 0;
      minSets = Math.min(minSets, Math.floor(available / required));
    }
    return minSets === Infinity ? 0 : minSets;
  }

  /**
   * Get current position for Random Product mode
   * Position = inventory['product'] (net long/short)
   */
  getPosition() {
    if (this.gameMode !== 'randomProduct') return 0;
    return this.inventory['product'] || 0;
  }

  calculateFinalScore(scrapValues, setValue, setRecipe, gameMode = 'sandwich', correctValue = null) {
    if (gameMode === 'randomProduct') {
      // Random Product mode: PnL is based on position * (correct value - average entry price)
      // Since we don't track average entry, we'll use position * correct value as the simplified PnL
      const position = this.getPosition();
      const positionValue = round2(position * (correctValue || 0));
      const totalScore = round2(this.cash + positionValue);
      const pnl = round2(totalScore - this.initialCash);

      this.finalScore = totalScore;
      this.pnlBreakdown = {
        cash: round2(this.cash),
        position,
        positionValue,
        correctValue,
        totalScore,
        pnl
      };

      return this.pnlBreakdown;
    } else {
      // Sandwich Exchange mode
      const completeSets = this.getCompleteSets(setRecipe);

      const remainingInventory = { ...this.inventory };
      for (const [product, required] of Object.entries(setRecipe)) {
        remainingInventory[product] -= completeSets * required;
      }

      let scrapValue = 0;
      for (const [product, quantity] of Object.entries(remainingInventory)) {
        scrapValue += quantity * (scrapValues[product] || 0);
      }

      const setsValue = round2(completeSets * setValue);
      const totalScore = round2(this.cash + setsValue + scrapValue);

      this.setsFormed = completeSets;
      this.finalScore = totalScore;
      this.pnlBreakdown = {
        cash: round2(this.cash),
        completeSets,
        setsValue,
        scrapValue: round2(scrapValue),
        totalScore,
        pnl: round2(totalScore - (this.initialCash + this.getInitialInventoryValue(scrapValues)))
      };

      return this.pnlBreakdown;
    }
  }

  getInitialInventoryValue(scrapValues) {
    let value = 0;
    for (const [product, quantity] of Object.entries(this.initialInventory)) {
      value += quantity * (scrapValues[product] || 0);
    }
    return value;
  }

  addOrder(orderId) {
    if (!this.openOrderIds.includes(orderId)) {
      this.openOrderIds.push(orderId);
    }
  }

  removeOrder(orderId) {
    this.openOrderIds = this.openOrderIds.filter(id => id !== orderId);
  }

  addTrade(tradeId) {
    this.tradeHistory.push(tradeId);
  }

  toPublicJSON() {
    return {
      playerId: this.playerId,
      name: this.name,
      finalScore: this.finalScore,
      isBot: this.isBot
    };
  }

  toJSON() {
    return {
      playerId: this.playerId,
      gameId: this.gameId,
      name: this.name,
      cash: this.cash,
      inventory: this.inventory,
      openOrderIds: this.openOrderIds,
      tradeHistory: this.tradeHistory,
      setsFormed: this.setsFormed,
      initialCash: this.initialCash,
      initialInventory: this.initialInventory,
      finalScore: this.finalScore,
      pnlBreakdown: this.pnlBreakdown,
      joinedAt: this.joinedAt,
      isBot: this.isBot,
      gameMode: this.gameMode,
      position: this.position
    };
  }
}

// ==================== ORDER MODEL ====================

class Order {
  constructor(gameId, playerId, playerName, product, side, orderType, quantity, price = null) {
    this.orderId = uuidv4();
    this.gameId = gameId;
    this.playerId = playerId;
    this.playerName = playerName;
    this.product = product;
    this.side = side;
    this.orderType = orderType;
    this.quantity = quantity;
    this.remainingQuantity = quantity;
    this.price = price;
    this.status = 'open'; // 'open' | 'filled' | 'partial' | 'cancelled'
    this.fills = [];
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }

  fill(tradeId, quantity, price) {
    this.fills.push({
      tradeId,
      quantity,
      price,
      timestamp: new Date().toISOString()
    });
    this.remainingQuantity -= quantity;
    this.updatedAt = new Date().toISOString();

    if (this.remainingQuantity <= 0) {
      this.status = 'filled';
    } else {
      this.status = 'partial';
    }
  }

  cancel() {
    this.status = 'cancelled';
    this.updatedAt = new Date().toISOString();
  }

  toOrderBookJSON(showNames = false) {
    return {
      orderId: this.orderId,
      playerName: showNames ? this.playerName : undefined,
      product: this.product,
      side: this.side,
      orderType: this.orderType,
      quantity: this.remainingQuantity,
      price: this.price,
      createdAt: this.createdAt
    };
  }

  toJSON() {
    return {
      orderId: this.orderId,
      gameId: this.gameId,
      playerId: this.playerId,
      playerName: this.playerName,
      product: this.product,
      side: this.side,
      orderType: this.orderType,
      quantity: this.quantity,
      remainingQuantity: this.remainingQuantity,
      price: this.price,
      status: this.status,
      fills: this.fills,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }
}

// ==================== TRADE MODEL ====================

class Trade {
  constructor(gameId, buyOrderId, sellOrderId, buyerId, sellerId, product, quantity, price) {
    this.tradeId = uuidv4();
    this.gameId = gameId;
    this.buyOrderId = buyOrderId;
    this.sellOrderId = sellOrderId;
    this.buyerId = buyerId;
    this.sellerId = sellerId;
    this.product = product;
    this.quantity = quantity;
    this.price = price;
    this.value = quantity * price;
    this.executedAt = new Date().toISOString();
  }

  toJSON() {
    return {
      tradeId: this.tradeId,
      gameId: this.gameId,
      buyOrderId: this.buyOrderId,
      sellOrderId: this.sellOrderId,
      buyerId: this.buyerId,
      sellerId: this.sellerId,
      product: this.product,
      quantity: this.quantity,
      price: this.price,
      value: this.value,
      executedAt: this.executedAt
    };
  }
}

// ==================== MARKET EVENT MODEL ====================

class MarketEvent {
  constructor(gameId, type, orderId, playerId, product, side, price, quantity) {
    this.eventId = uuidv4();
    this.gameId = gameId;
    this.timestamp = new Date().toISOString();
    this.type = type; // 'order_placed' | 'order_cancelled' | 'order_filled' | 'order_partially_filled'
    this.orderId = orderId;
    this.playerId = playerId;
    this.product = product;
    this.side = side;
    this.price = price;
    this.quantity = quantity;
  }

  toJSON() {
    return {
      eventId: this.eventId,
      gameId: this.gameId,
      timestamp: this.timestamp,
      type: this.type,
      orderId: this.orderId,
      playerId: this.playerId,
      product: this.product,
      side: this.side,
      price: this.price,
      quantity: this.quantity
    };
  }
}

// ==================== ORDER BOOK MODEL ====================

class OrderBook {
  constructor(product) {
    this.product = product;
    this.bids = [];
    this.asks = [];
  }

  addOrder(order) {
    if (order.side === 'buy') {
      this.bids.push(order);
      this.bids.sort((a, b) => {
        if (b.price !== a.price) return b.price - a.price;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
    } else {
      this.asks.push(order);
      this.asks.sort((a, b) => {
        if (a.price !== b.price) return a.price - b.price;
        return new Date(a.createdAt) - new Date(b.createdAt);
      });
    }
  }

  removeOrder(orderId) {
    this.bids = this.bids.filter(o => o.orderId !== orderId);
    this.asks = this.asks.filter(o => o.orderId !== orderId);
  }

  getBestBid() {
    const openBids = this.bids.filter(o => o.status === 'open' || o.status === 'partial');
    return openBids.length > 0 ? openBids[0] : null;
  }

  getBestAsk() {
    const openAsks = this.asks.filter(o => o.status === 'open' || o.status === 'partial');
    return openAsks.length > 0 ? openAsks[0] : null;
  }

  getDepth(showNames = false) {
    const bidLevels = new Map();
    const askLevels = new Map();

    for (const order of this.bids.filter(o => o.status === 'open' || o.status === 'partial')) {
      const level = bidLevels.get(order.price) || { price: order.price, quantity: 0, orders: [] };
      level.quantity += order.remainingQuantity;
      level.orders.push(order.toOrderBookJSON(showNames));
      bidLevels.set(order.price, level);
    }

    for (const order of this.asks.filter(o => o.status === 'open' || o.status === 'partial')) {
      const level = askLevels.get(order.price) || { price: order.price, quantity: 0, orders: [] };
      level.quantity += order.remainingQuantity;
      level.orders.push(order.toOrderBookJSON(showNames));
      askLevels.set(order.price, level);
    }

    return {
      product: this.product,
      bids: Array.from(bidLevels.values()).sort((a, b) => b.price - a.price),
      asks: Array.from(askLevels.values()).sort((a, b) => a.price - b.price),
      bestBid: this.getBestBid()?.price || null,
      bestAsk: this.getBestAsk()?.price || null,
      spread: this.getBestBid() && this.getBestAsk()
        ? this.getBestAsk().price - this.getBestBid().price
        : null
    };
  }

  cleanup() {
    this.bids = this.bids.filter(o => o.status === 'open' || o.status === 'partial');
    this.asks = this.asks.filter(o => o.status === 'open' || o.status === 'partial');
  }
}

// Import database adapters
const SQLiteAdapter = require('../database/SQLiteAdapter');
const PostgreSQLAdapter = require('../database/PostgreSQLAdapter');

module.exports = {
  InMemoryAdapter,
  SQLiteAdapter,
  PostgreSQLAdapter,
  DataStore,
  Game,
  Player,
  Order,
  Trade,
  MarketEvent,
  OrderBook
};
