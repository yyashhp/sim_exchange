/**
 * Trading Exchange Server
 *
 * Real-time trading game server using Socket.io
 * Players on the same network can join and trade
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const os = require('os');

// Load configuration
const config = require('./config.json');

// Import modules
const { DataStore } = require('./models');
const GameManager = require('./engine/gameManager');
const MatchingEngine = require('./engine/matchingEngine');

// Initialize
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve React client build in production
const clientBuildPath = path.join(__dirname, '../client/build');
app.use(express.static(clientBuildPath));

// Initialize data store and engines
const dataStore = new DataStore();
const gameManager = new GameManager(dataStore, config);
const matchingEngine = new MatchingEngine(dataStore, config);

// Map socket IDs to player IDs
const socketToPlayer = new Map();
const playerToSocket = new Map();

// Get local IP address for LAN play
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// ==================== REST API ====================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get game configuration
app.get('/api/config', (req, res) => {
  res.json(gameManager.getPublicConfig());
});

// Get current game state
app.get('/api/game', (req, res) => {
  const state = gameManager.getGameState();
  if (!state) {
    return res.status(404).json({ error: 'No active game' });
  }
  res.json(state);
});

// Export game data (for analysis)
app.get('/api/game/:gameId/export', (req, res) => {
  const data = dataStore.exportGameData(req.params.gameId);
  if (!data.game) {
    return res.status(404).json({ error: 'Game not found' });
  }
  res.json(data);
});

// Catch-all: serve React app for any non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// ==================== SOCKET.IO EVENTS ====================

io.on('connection', (socket) => {
  console.log(`[SOCKET] Client connected: ${socket.id}`);

  // Send current game state on connect
  const gameState = gameManager.getGameState();
  socket.emit('gameState', gameState);
  socket.emit('config', gameManager.getPublicConfig());

  // If game is running, also send order books and leaderboard
  if (gameState && gameState.status === 'running') {
    socket.emit('orderBooks', matchingEngine.getAllOrderBooks());
    socket.emit('leaderboard', gameManager.getLiveLeaderboard());
  }

  // ===== GAME MANAGEMENT =====

  // Create a new game
  socket.on('createGame', (callback) => {
    if (typeof callback !== 'function') return;
    const tempHostId = `host_${socket.id}`;
    const result = gameManager.createGame(tempHostId);

    if (result.success) {
      // Reset matching engine for new game
      matchingEngine.reset();
      io.emit('gameState', gameManager.getGameState());
      console.log(`[SOCKET] Game created by ${socket.id}`);
    }

    callback(result);
  });

  // Join the game
  socket.on('joinGame', (data, callback) => {
    if (typeof callback !== 'function') return;
    const { playerName } = data;

    if (!playerName || playerName.trim().length === 0) {
      return callback({ success: false, error: 'Name is required' });
    }

    const result = gameManager.joinGame(playerName.trim());

    if (result.success) {
      const player = result.player;

      // Map socket to player
      socketToPlayer.set(socket.id, player.playerId);
      playerToSocket.set(player.playerId, socket.id);

      // If this is the first player and they created the game, make them host
      if (gameManager.currentGame && gameManager.currentGame.hostPlayerId.startsWith('host_')) {
        gameManager.currentGame.hostPlayerId = player.playerId;
        dataStore.saveGame(gameManager.currentGame);
      }

      // Send player their state
      socket.emit('playerState', gameManager.getPlayerState(player.playerId));

      // Broadcast updated game state
      io.emit('gameState', gameManager.getGameState());

      console.log(`[SOCKET] ${playerName} joined the game`);
    }

    callback(result);
  });

  // Start the game (host only)
  socket.on('startGame', (callback) => {
    if (typeof callback !== 'function') return;
    const playerId = socketToPlayer.get(socket.id);
    if (!playerId) {
      return callback({ success: false, error: 'Not in game' });
    }

    const result = gameManager.startGame(playerId);

    if (result.success) {
      // Broadcast game start
      io.emit('gameStarted', {
        gameState: gameManager.getGameState(),
        orderBooks: matchingEngine.getAllOrderBooks()
      });

      // Send each player their state
      for (const [socketId, pId] of socketToPlayer) {
        const playerSocket = io.sockets.sockets.get(socketId);
        if (playerSocket) {
          playerSocket.emit('playerState', gameManager.getPlayerState(pId));
        }
      }

      // Send initial leaderboard
      io.emit('leaderboard', gameManager.getLiveLeaderboard());

      console.log('[SOCKET] Game started!');
    }

    callback(result);
  });

  // Reset game (go back to lobby)
  socket.on('resetGame', (callback) => {
    if (typeof callback !== 'function') return;

    // Clear all player mappings
    socketToPlayer.clear();
    playerToSocket.clear();

    // Reset game manager
    gameManager.currentGame = null;
    if (gameManager.gameTimer) {
      clearInterval(gameManager.gameTimer);
      gameManager.gameTimer = null;
    }

    // Reset matching engine
    matchingEngine.reset();

    // Broadcast null game state so all clients return to lobby
    io.emit('gameState', null);
    io.emit('leaderboard', []);
    io.emit('orderBooks', {});

    console.log('[SOCKET] Game reset');
    callback({ success: true });
  });

  // ===== TRADING =====

  // Place an order
  socket.on('placeOrder', (data, callback) => {
    if (typeof callback !== 'function') return;
    const playerId = socketToPlayer.get(socket.id);
    if (!playerId) {
      return callback({ success: false, error: 'Not in game' });
    }

    if (gameManager.currentGame?.status !== 'running') {
      return callback({ success: false, error: 'Game is not running' });
    }

    const player = dataStore.getPlayer(playerId);
    if (!player) {
      return callback({ success: false, error: 'Player not found' });
    }

    const { product, side, orderType, quantity, price } = data;

    const result = matchingEngine.submitOrder(
      gameManager.currentGame.gameId,
      player,
      product,
      side,
      orderType,
      parseInt(quantity),
      price ? parseFloat(price) : null
    );

    if (result.errors.length > 0) {
      return callback({ success: false, error: result.errors.join(', ') });
    }

    // Send updated state to the player
    socket.emit('playerState', gameManager.getPlayerState(playerId));

    // Broadcast updated order book
    io.emit('orderBooks', matchingEngine.getAllOrderBooks());

    // If trades occurred, notify all players
    if (result.trades.length > 0) {
      io.emit('trades', result.trades.map(t => t.toJSON()));

      // Update all affected players
      for (const trade of result.trades) {
        const buyerSocketId = playerToSocket.get(trade.buyerId);
        const sellerSocketId = playerToSocket.get(trade.sellerId);

        if (buyerSocketId) {
          const bs = io.sockets.sockets.get(buyerSocketId);
          if (bs) bs.emit('playerState', gameManager.getPlayerState(trade.buyerId));
        }
        if (sellerSocketId) {
          const ss = io.sockets.sockets.get(sellerSocketId);
          if (ss) ss.emit('playerState', gameManager.getPlayerState(trade.sellerId));
        }
      }

      // Update leaderboard
      io.emit('leaderboard', gameManager.getLiveLeaderboard());
    }

    callback({
      success: true,
      order: result.order.toJSON(),
      trades: result.trades.map(t => t.toJSON())
    });
  });

  // Cancel an order
  socket.on('cancelOrder', (data, callback) => {
    if (typeof callback !== 'function') return;
    const playerId = socketToPlayer.get(socket.id);
    if (!playerId) {
      return callback({ success: false, error: 'Not in game' });
    }

    const { orderId } = data;
    const result = matchingEngine.cancelOrder(orderId, playerId);

    if (result.success) {
      // Send updated state
      socket.emit('playerState', gameManager.getPlayerState(playerId));

      // Broadcast updated order book
      io.emit('orderBooks', matchingEngine.getAllOrderBooks());
    }

    callback(result);
  });

  // Get order book
  socket.on('getOrderBooks', (callback) => {
    if (typeof callback !== 'function') return;
    callback(matchingEngine.getAllOrderBooks());
  });

  // Get player state
  socket.on('getPlayerState', (callback) => {
    if (typeof callback !== 'function') return;
    const playerId = socketToPlayer.get(socket.id);
    if (!playerId) {
      return callback(null);
    }
    callback(gameManager.getPlayerState(playerId));
  });

  // Get leaderboard
  socket.on('getLeaderboard', (callback) => {
    if (typeof callback !== 'function') return;
    callback(gameManager.getLiveLeaderboard());
  });

  // Get recent trades
  socket.on('getRecentTrades', (data, callback) => {
    if (typeof callback !== 'function') return;
    if (!gameManager.currentGame) return callback([]);
    const trades = dataStore.getTradesByGame(gameManager.currentGame.gameId);
    callback(trades.slice(-50).reverse().map(t => t.toJSON()));
  });

  // ===== DISCONNECT =====

  socket.on('disconnect', () => {
    const playerId = socketToPlayer.get(socket.id);

    if (playerId) {
      // Cancel all player's orders
      matchingEngine.cancelAllPlayerOrders(playerId);

      // Remove from game if in lobby
      if (gameManager.currentGame?.status === 'lobby') {
        gameManager.leaveGame(playerId);
      }

      // Clean up mappings
      socketToPlayer.delete(socket.id);
      playerToSocket.delete(playerId);

      // Broadcast updated state
      io.emit('gameState', gameManager.getGameState());
      io.emit('orderBooks', matchingEngine.getAllOrderBooks());

      console.log(`[SOCKET] Player ${playerId.slice(0, 8)} disconnected`);
    } else {
      console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    }
  });
});

// ===== GAME EVENTS =====

// Timer tick - broadcast remaining time
gameManager.onTimerTick = (remainingTime) => {
  io.emit('timer', { remainingTime });

  // Update leaderboard every 5 seconds
  if (remainingTime % 5 === 0) {
    io.emit('leaderboard', gameManager.getLiveLeaderboard());
  }
};

// Game end - broadcast final results
gameManager.onGameEnd = (leaderboard) => {
  // Cancel all orders
  if (gameManager.currentGame) {
    matchingEngine.cancelAllOrders(gameManager.currentGame.gameId);
  }

  io.emit('gameEnded', {
    leaderboard,
    gameState: gameManager.getGameState()
  });

  // Send final state to each player
  for (const [socketId, playerId] of socketToPlayer) {
    const playerSocket = io.sockets.sockets.get(socketId);
    if (playerSocket) {
      const player = dataStore.getPlayer(playerId);
      if (player) {
        playerSocket.emit('finalScore', player.pnlBreakdown);
      }
    }
  }
};

// ===== START SERVER =====

const PORT = process.env.PORT || 3001;
const localIP = getLocalIP();

server.listen(PORT, '0.0.0.0', () => {
  console.log('\n========================================');
  console.log('   TRADING EXCHANGE SERVER STARTED');
  console.log('========================================');
  console.log(`\nLocal:    http://localhost:${PORT}`);
  console.log(`Network:  http://${localIP}:${PORT}`);
  console.log('\nShare the Network URL with players on the same WiFi!');
  console.log('\nIn development, React dev server runs on port 3000');
  console.log('In production, the built client is served from port ' + PORT);
  console.log('\n========================================\n');
});
