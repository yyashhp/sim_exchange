/**
 * BotManager - Lifecycle controller for bot players.
 *
 * Responsibilities:
 *  - Create / remove bot players when host adjusts the slider
 *  - Start / stop per-bot trading timers when the game runs
 *  - Execute one trading action per tick, then re-schedule
 *  - Notify server.js of results via onBotAction callback so
 *    socket broadcasts can be sent without coupling to socket.io here
 */

const { Player } = require('../models');
const BotStrategy = require('./botStrategy');
const { generateBotName, resetBotNames } = require('./botNames');

class BotManager {
  /**
   * @param {DataStore}       dataStore
   * @param {GameManager}     gameManager
   * @param {MatchingEngine}  matchingEngine
   * @param {object}          config  - full server config
   */
  constructor(dataStore, gameManager, matchingEngine, config) {
    this.dataStore      = dataStore;
    this.gameManager    = gameManager;
    this.matchingEngine = matchingEngine;
    this.config         = config;
    this.strategy       = new BotStrategy(config);

    this.botPlayerIds = [];          // IDs of currently active bots
    this.botTimers    = new Map();   // playerId -> timeoutId
    this.active       = false;

    /**
     * Callback invoked after every bot order submission.
     * Set in server.js to broadcast socket updates.
     * @type {((result: { order, trades, errors }) => void) | null}
     */
    this.onBotAction = null;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Replace all existing bots with a fresh set of `count` bots.
   * Safe to call multiple times (e.g. when the host adjusts the slider).
   *
   * @param {string} gameId
   * @param {number} count  0..config.bots.maxBots
   * @returns {string[]} new bot player IDs
   */
  configureBots(gameId, count) {
    this._removeBots(gameId);

    const max = this.config.bots?.maxBots ?? 10;
    const n   = Math.max(0, Math.min(count, max));
    if (n === 0) return [];

    resetBotNames();

    // Collect existing human names to avoid duplicates
    const existingNames = new Set(
      this.dataStore.getPlayersByGame(gameId).map(p => p.name.toLowerCase())
    );

    for (let i = 0; i < n; i++) {
      let botName;
      let attempts = 0;
      do {
        botName = generateBotName();
        attempts++;
      } while (existingNames.has(botName.toLowerCase()) && attempts < 200);

      existingNames.add(botName.toLowerCase());

      const { inventory } = this.gameManager.generateStartingInventory();
      const bot = new Player(
        gameId,
        botName,
        this.config.startingCash,
        inventory,
        true  // isBot
      );

      this.gameManager.currentGame.addPlayer(bot.playerId);
      this.dataStore.savePlayer(bot);
      this.botPlayerIds.push(bot.playerId);
      console.log(`[BOTS] Created: ${botName}`);
    }

    this.dataStore.saveGame(this.gameManager.currentGame);
    console.log(`[BOTS] Configured ${n} bot(s)`);
    return this.botPlayerIds;
  }

  /**
   * Start per-bot trading timers. Call after the game transitions to 'running'.
   */
  startBotTrading() {
    if (this.botPlayerIds.length === 0) return;
    this.active = true;
    console.log(`[BOTS] Starting trading for ${this.botPlayerIds.length} bot(s)`);

    // Stagger starts so bots don't all fire at t=0
    this.botPlayerIds.forEach((playerId, i) => {
      const delay = i * 600 + Math.random() * 800;
      setTimeout(() => {
        if (this.active) this._scheduleBotAction(playerId);
      }, delay);
    });
  }

  /**
   * Halt all bot timers. Idempotent.
   */
  stopBotTrading() {
    this.active = false;
    for (const timerId of this.botTimers.values()) clearTimeout(timerId);
    this.botTimers.clear();
    console.log('[BOTS] Trading stopped');
  }

  /**
   * Full cleanup: stop trading and remove all bot players.
   * Call on game reset.
   *
   * @param {string} [gameId] - current game ID for order cleanup
   */
  cleanup(gameId) {
    this.stopBotTrading();
    if (gameId) {
      this._removeBots(gameId);
    } else {
      this.botPlayerIds = [];
    }
    resetBotNames();
  }

  /** Number of currently configured bots */
  getBotCount() { return this.botPlayerIds.length; }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /** Remove all existing bots from the game + datastore, cancel their orders. */
  _removeBots(gameId) {
    const game = this.gameManager.currentGame;
    if (!game) return;

    for (const botId of this.botPlayerIds) {
      game.removePlayer(botId);
      this.dataStore._players.delete(botId);
      // Cancel any open orders so the order book stays clean
      this.matchingEngine.cancelAllPlayerOrders(botId);
    }
    this.botPlayerIds = [];
    if (game) this.dataStore.saveGame(game);
  }

  /** Schedule the next action for one bot (recursive). */
  _scheduleBotAction(playerId) {
    if (!this.active) return;

    const cfg = this.config.bots ?? {};
    const min  = cfg.tradingInterval?.min ?? 3000;
    const max  = cfg.tradingInterval?.max ?? 8000;
    const wait = min + Math.random() * (max - min);

    const id = setTimeout(() => {
      this._executeBotAction(playerId);
      this._scheduleBotAction(playerId);
    }, wait);

    this.botTimers.set(playerId, id);
  }

  /** Execute one trading decision for the given bot. */
  _executeBotAction(playerId) {
    const game = this.gameManager.currentGame;
    if (!game || game.status !== 'running') {
      this.stopBotTrading();
      return;
    }

    const player = this.dataStore.getPlayer(playerId);
    if (!player) return;

    // Prune stale open orders: keep at most 4 per bot to avoid order-book spam
    const openOrders = player.openOrderIds
      .map(id => this.dataStore.getOrder(id))
      .filter(o => o && (o.status === 'open' || o.status === 'partial'));

    if (openOrders.length > 4) {
      const oldest = openOrders.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0];
      this.matchingEngine.cancelOrder(oldest.orderId, playerId);
    }

    // Provide live OrderBook objects (not serialised depth) to the strategy
    const orderBooks = {};
    for (const [product, book] of this.matchingEngine.orderBooks) {
      orderBooks[product] = book;
    }

    const action = this.strategy.generateTradingAction(
      player,
      orderBooks,
      game.getRemainingTime(),
      this.config.gameDuration
    );
    if (!action) return;

    const result = this.matchingEngine.submitOrder(
      game.gameId,
      player,
      action.product,
      action.side,
      action.orderType,
      action.quantity,
      action.price ?? null
    );

    if (result.errors.length > 0) {
      // Silently ignore - usually insufficient funds / inventory; bot will retry
      return;
    }

    const priceStr = action.price != null ? ` @ $${action.price}` : ' (market)';
    console.log(`[BOTS] ${player.name}: ${action.side} ${action.quantity} ${action.product}${priceStr}`);

    if (this.onBotAction) this.onBotAction(result);
  }
}

module.exports = BotManager;
