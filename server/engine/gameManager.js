/**
 * Game Manager - Handles game lifecycle and player management
 */

const { Game, Player } = require('../models');

class GameManager {
  constructor(dataStore, config) {
    this.dataStore = dataStore;
    this.config = config;
    this.currentGame = null;
    this.gameTimer = null;
    this.onGameEnd = null; // Callback when game ends
    this.onTimerTick = null; // Callback for timer updates
  }

  /**
   * Create a new game
   */
  createGame(hostPlayerId, gameMode = 'sandwich', question = null) {
    if (this.currentGame && this.currentGame.status !== 'ended') {
      return { success: false, error: 'A game is already in progress' };
    }

    // Validate game mode
    if (!['sandwich', 'randomProduct'].includes(gameMode)) {
      return { success: false, error: 'Invalid game mode' };
    }

    // Validate question for Random Product mode
    if (gameMode === 'randomProduct' && (!question || question.trim() === '')) {
      return { success: false, error: 'Question is required for Random Product mode' };
    }

    this.currentGame = new Game(hostPlayerId, this.config, gameMode, question);
    this.dataStore.saveGame(this.currentGame);

    this.dataStore.logEvent({
      type: 'GAME_CREATED',
      gameId: this.currentGame.gameId,
      hostPlayerId,
      gameMode,
      question,
      timestamp: new Date().toISOString()
    });

    return { success: true, game: this.currentGame };
  }

  /**
   * Generate random starting inventory with target value
   */
  generateStartingInventory() {
    const { products, scrapValues, startingInventoryTargetTotalValue, startingInventoryRandomizationFactor } = this.config;

    // Calculate total scrap value of one of each
    const oneOfEachValue = products.reduce((sum, p) => sum + scrapValues[p], 0);

    // Start with a base allocation
    const inventory = {};
    let currentValue = 0;

    // Randomly allocate to reach target value with some variance
    const targetValue = startingInventoryTargetTotalValue;
    const minValue = targetValue * (1 - startingInventoryRandomizationFactor);
    const maxValue = targetValue * (1 + startingInventoryRandomizationFactor);

    // Initialize with zeros
    for (const product of products) {
      inventory[product] = 0;
    }

    // Randomly add items until we reach target range
    while (currentValue < minValue) {
      // Pick a random product
      const product = products[Math.floor(Math.random() * products.length)];
      const productValue = scrapValues[product];

      // Don't exceed max value
      if (currentValue + productValue <= maxValue) {
        inventory[product]++;
        currentValue += productValue;
      } else {
        break;
      }
    }

    // If we're under target, try to add items in random order
    while (currentValue < targetValue) {
      // Shuffle products to avoid bias toward cheaper items
      let added = false;
      for (const product of [...products].sort(() => Math.random() - 0.5)) {
        if (currentValue + scrapValues[product] <= maxValue) {
          inventory[product]++;
          currentValue += scrapValues[product];
          added = true;
          break;
        }
      }
      if (!added) break;
    }

    return {
      inventory,
      value: currentValue
    };
  }

  /**
   * Add a player to the current game
   */
  joinGame(playerName) {
    if (!this.currentGame) {
      return { success: false, error: 'No game exists. Create a game first.' };
    }

    if (this.currentGame.status !== 'lobby') {
      return { success: false, error: 'Cannot join: game is ' + this.currentGame.status };
    }

    if (this.currentGame.playerIds.length >= this.config.maxPlayers) {
      return { success: false, error: 'Game is full' };
    }

    // Check for duplicate names
    const existingPlayers = this.dataStore.getPlayersByGame(this.currentGame.gameId);
    if (existingPlayers.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
      return { success: false, error: 'Name already taken' };
    }

    // Setup player based on game mode
    let inventory, value, startingCash;

    if (this.currentGame.gameMode === 'randomProduct') {
      // Random Product mode: start with 0 inventory and 0 cash (infinite cash handled in matching engine)
      inventory = { product: 0 };
      value = 0;
      startingCash = 0;
    } else {
      // Sandwich Exchange mode: generate random starting inventory
      const result = this.generateStartingInventory();
      inventory = result.inventory;
      value = result.value;
      startingCash = this.config.startingCash;
    }

    // Create player
    const player = new Player(
      this.currentGame.gameId,
      playerName,
      startingCash,
      inventory,
      this.currentGame.gameMode
    );

    // Add to game
    this.currentGame.addPlayer(player.playerId);

    // Save
    this.dataStore.savePlayer(player);
    this.dataStore.saveGame(this.currentGame);

    this.dataStore.logEvent({
      type: 'PLAYER_JOINED',
      gameId: this.currentGame.gameId,
      playerId: player.playerId,
      playerName: player.name,
      startingInventory: inventory,
      startingInventoryValue: value,
      startingCash,
      gameMode: this.currentGame.gameMode,
      timestamp: new Date().toISOString()
    });

    if (this.currentGame.gameMode === 'randomProduct') {
      console.log(`[GAME] Player ${playerName} joined (Random Product mode - infinite cash)`);
    } else {
      console.log(`[GAME] Player ${playerName} joined with inventory worth ${value}`);
    }

    return { success: true, player };
  }

  /**
   * Remove a player from the game
   */
  leaveGame(playerId) {
    if (!this.currentGame) {
      return { success: false, error: 'No game exists' };
    }

    const player = this.dataStore.getPlayer(playerId);
    if (!player) {
      return { success: false, error: 'Player not found' };
    }

    this.currentGame.removePlayer(playerId);
    this.dataStore.saveGame(this.currentGame);

    this.dataStore.logEvent({
      type: 'PLAYER_LEFT',
      gameId: this.currentGame.gameId,
      playerId,
      playerName: player.name,
      timestamp: new Date().toISOString()
    });

    return { success: true };
  }

  /**
   * Start the game
   */
  startGame(requestingPlayerId) {
    if (!this.currentGame) {
      return { success: false, error: 'No game exists' };
    }

    if (this.currentGame.hostPlayerId !== requestingPlayerId) {
      return { success: false, error: 'Only the host can start the game' };
    }

    if (this.currentGame.status !== 'lobby') {
      return { success: false, error: 'Game is already ' + this.currentGame.status };
    }

    if (this.currentGame.playerIds.length < 2) {
      return { success: false, error: 'Need at least 2 players to start' };
    }

    // Start the game
    this.currentGame.start();
    this.dataStore.saveGame(this.currentGame);

    // Start the timer
    this.startTimer();

    this.dataStore.logEvent({
      type: 'GAME_STARTED',
      gameId: this.currentGame.gameId,
      playerCount: this.currentGame.playerIds.length,
      duration: this.config.gameDuration,
      timestamp: new Date().toISOString()
    });

    console.log(`[GAME] Game started with ${this.currentGame.playerIds.length} players`);

    return { success: true, game: this.currentGame };
  }

  /**
   * Start the game timer
   */
  startTimer() {
    let remainingTime = this.config.gameDuration;

    this.gameTimer = setInterval(() => {
      remainingTime--;

      if (this.onTimerTick) {
        this.onTimerTick(remainingTime);
      }

      if (remainingTime <= 0) {
        this.endGame();
      }
    }, 1000);
  }

  /**
   * End the game
   */
  endGame() {
    if (!this.currentGame || this.currentGame.status === 'ended') {
      return { success: false, error: 'No active game to end' };
    }

    // Stop timer
    if (this.gameTimer) {
      clearInterval(this.gameTimer);
      this.gameTimer = null;
    }

    // For Random Product mode, wait for host to submit correct value
    if (this.currentGame.gameMode === 'randomProduct') {
      this.currentGame.status = 'awaiting_value';
      this.dataStore.saveGame(this.currentGame);

      this.dataStore.logEvent({
        type: 'GAME_AWAITING_VALUE',
        gameId: this.currentGame.gameId,
        timestamp: new Date().toISOString()
      });

      console.log('\n[GAME] ===== TIME EXPIRED =====');
      console.log('[GAME] Waiting for host to submit correct value...');
      console.log('[GAME] ===========================\n');

      if (this.onGameEnd) {
        this.onGameEnd(null); // Signal that we're awaiting value
      }

      return { success: true, awaitingValue: true };
    }

    // Sandwich Exchange mode: end immediately
    return this.finalizeGame();
  }

  /**
   * Finalize the game with final scores (called after correct value is submitted for Random Product, or immediately for Sandwich Exchange)
   */
  finalizeGame(correctValue = null) {
    if (!this.currentGame) {
      return { success: false, error: 'No game exists' };
    }

    if (this.currentGame.gameMode === 'randomProduct') {
      if (correctValue === null || correctValue === undefined) {
        return { success: false, error: 'Correct value is required for Random Product mode' };
      }
      this.currentGame.correctValue = correctValue;
      console.log(`[GAME] Correct value set to: ${correctValue}`);
    }

    // End the game
    this.currentGame.end();
    this.dataStore.saveGame(this.currentGame);

    // Calculate final scores for all players
    const players = this.dataStore.getPlayersByGame(this.currentGame.gameId);
    const leaderboard = [];

    for (const player of players) {
      const pnlBreakdown = player.calculateFinalScore(
        this.currentGame.config.scrapValues,
        this.currentGame.config.setValue,
        this.currentGame.config.setRecipe,
        this.currentGame.gameMode,
        this.currentGame.correctValue
      );
      this.dataStore.savePlayer(player);

      leaderboard.push({
        playerId: player.playerId,
        name: player.name,
        ...pnlBreakdown
      });
    }

    // Sort by total score descending
    leaderboard.sort((a, b) => b.totalScore - a.totalScore);

    // Add rank
    leaderboard.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    this.dataStore.logEvent({
      type: 'GAME_ENDED',
      gameId: this.currentGame.gameId,
      gameMode: this.currentGame.gameMode,
      correctValue: this.currentGame.correctValue,
      leaderboard,
      timestamp: new Date().toISOString()
    });

    console.log('\n[GAME] ===== GAME ENDED =====');
    if (this.currentGame.gameMode === 'randomProduct') {
      console.log(`[GAME] Correct Value: ${correctValue}`);
    }
    console.log('[GAME] Final Leaderboard:');
    for (const entry of leaderboard) {
      if (this.currentGame.gameMode === 'randomProduct') {
        console.log(`  ${entry.rank}. ${entry.name}: ${entry.totalScore} (position: ${entry.position}, PnL: ${entry.pnl >= 0 ? '+' : ''}${entry.pnl})`);
      } else {
        console.log(`  ${entry.rank}. ${entry.name}: ${entry.totalScore} (${entry.completeSets} sets, PnL: ${entry.pnl >= 0 ? '+' : ''}${entry.pnl})`);
      }
    }
    console.log('[GAME] ========================\n');

    // Export game data
    this.dataStore.exportGameData(this.currentGame.gameId);

    if (this.onGameEnd) {
      this.onGameEnd(leaderboard);
    }

    return { success: true, leaderboard };
  }

  /**
   * Get current game state
   */
  getGameState() {
    if (!this.currentGame) {
      return null;
    }

    const players = this.dataStore.getPlayersByGame(this.currentGame.gameId);

    return {
      gameId: this.currentGame.gameId,
      status: this.currentGame.status,
      gameMode: this.currentGame.gameMode,
      question: this.currentGame.question,
      hostPlayerId: this.currentGame.hostPlayerId,
      remainingTime: this.currentGame.getRemainingTime(),
      playerCount: players.length,
      maxPlayers: this.config.maxPlayers,
      players: players.map(p => ({
        playerId: p.playerId,
        name: p.name
      }))
    };
  }

  /**
   * Get player state (for their own view)
   */
  getPlayerState(playerId) {
    const player = this.dataStore.getPlayer(playerId);
    if (!player) return null;

    const state = {
      playerId: player.playerId,
      name: player.name,
      cash: player.cash,
      inventory: player.inventory,
      openOrders: player.openOrderIds.map(id => {
        const order = this.dataStore.getOrder(id);
        return order ? order.toJSON() : null;
      }).filter(Boolean),
      tradeCount: player.tradeHistory.length
    };

    // Add mode-specific fields
    if (this.currentGame?.gameMode === 'randomProduct') {
      state.position = player.getPosition();
    } else {
      state.inventoryValue = player.getInventoryScrapValue(this.currentGame?.config.scrapValues || this.config.scrapValues);
      state.completeSets = player.getCompleteSets(this.currentGame?.config.setRecipe || this.config.setRecipe);
    }

    return state;
  }

  /**
   * Get public leaderboard (during game)
   */
  getLiveLeaderboard() {
    if (!this.currentGame) return [];

    const players = this.dataStore.getPlayersByGame(this.currentGame.gameId);

    const leaderboard = players.map(p => ({
      playerId: p.playerId,
      name: p.name,
      estimatedValue: p.cash + p.getInventoryScrapValue(this.config.scrapValues),
      completeSets: p.getCompleteSets(this.config.setRecipe)
    }));

    return leaderboard.sort((a, b) => b.estimatedValue - a.estimatedValue);
  }

  /**
   * Get game configuration (public)
   */
  getPublicConfig() {
    return {
      gameMode: this.currentGame?.gameMode || 'sandwich',
      question: this.currentGame?.question,
      gameDuration: this.config.gameDuration,
      products: this.config.products,
      scrapValues: this.config.scrapValues,
      setValue: this.config.setValue,
      setRecipe: this.config.setRecipe,
      maxPlayers: this.config.maxPlayers
    };
  }
}

module.exports = GameManager;
