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
 */
class DataStore {
  constructor(adapter = null) {
    this.adapter = adapter || new InMemoryAdapter();
    // In-memory model instances (live objects, not just data)
    this._games = new Map();
    this._players = new Map();
    this._orders = new Map();
    this._trades = new Map();
    this._events = [];
  }

  // ---- Game operations ----
  saveGame(game) {
    this._games.set(game.gameId, game);
    return game;
  }

  getGame(gameId) {
    return this._games.get(gameId);
  }

  // ---- Player operations ----
  savePlayer(player) {
    this._players.set(player.playerId, player);
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
    return trade;
  }

  getTradesByGame(gameId) {
    return Array.from(this._trades.values()).filter(t => t.gameId === gameId);
  }

  // ---- Event logging ----
  logEvent(event) {
    this._events.push(event);
    console.log(`[EVENT] ${event.type}${event.playerName ? ' | ' + event.playerName : ''}${event.gameId ? ' | game=' + event.gameId.slice(0,8) : ''}`);
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
    console.log('  To upload this data, implement DatabaseAdapter');
    console.log('  and call: dataStore.adapter.exportAll(gameId)');
    console.log('='.repeat(60) + '\n');
  }
}

// ==================== GAME MODEL ====================

class Game {
  constructor(hostPlayerId, config) {
    this.gameId = uuidv4();
    this.hostPlayerId = hostPlayerId;
    this.status = 'lobby'; // 'lobby' | 'running' | 'ended'
    this.config = config;
    this.playerIds = [];
    this.startTime = null;
    this.endTime = null;
    this.createdAt = new Date().toISOString();
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
  constructor(gameId, name, startingCash, startingInventory) {
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

  calculateFinalScore(scrapValues, setValue, setRecipe) {
    const completeSets = this.getCompleteSets(setRecipe);

    const remainingInventory = { ...this.inventory };
    for (const [product, required] of Object.entries(setRecipe)) {
      remainingInventory[product] -= completeSets * required;
    }

    let scrapValue = 0;
    for (const [product, quantity] of Object.entries(remainingInventory)) {
      scrapValue += quantity * (scrapValues[product] || 0);
    }

    const setsValue = completeSets * setValue;
    const totalScore = this.cash + setsValue + scrapValue;

    this.setsFormed = completeSets;
    this.finalScore = totalScore;
    this.pnlBreakdown = {
      cash: this.cash,
      completeSets,
      setsValue,
      scrapValue,
      totalScore,
      pnl: totalScore - (this.initialCash + this.getInitialInventoryValue(scrapValues))
    };

    return this.pnlBreakdown;
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
      finalScore: this.finalScore
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
      joinedAt: this.joinedAt
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

module.exports = {
  InMemoryAdapter,
  DataStore,
  Game,
  Player,
  Order,
  Trade,
  MarketEvent,
  OrderBook
};
