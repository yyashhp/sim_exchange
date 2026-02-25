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
const { DataStore, SQLiteAdapter, PostgreSQLAdapter } = require('./models');
const GameManager = require('./engine/gameManager');
const MatchingEngine = require('./engine/matchingEngine');
const BotManager = require('./bots/botManager');

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
// Auto-detect database adapter:
// 1. If DATABASE_URL is set → Use PostgreSQL (centralized cloud database)
// 2. If USE_MEMORY_DB=true → Use in-memory (no persistence)
// 3. Otherwise → Use SQLite (local file database)
const useMemoryDb = process.env.USE_MEMORY_DB === 'true';
const usePg = !!process.env.DATABASE_URL;

let dbAdapter = null;
if (!useMemoryDb) {
  if (usePg) {
    dbAdapter = new PostgreSQLAdapter();
    console.log('[SERVER] 🌐 Using PostgreSQL - CENTRALIZED cloud database');
    console.log('[SERVER] 📊 All game servers will share the same data!');
  } else {
    dbAdapter = new SQLiteAdapter();
    console.log('[SERVER] 💾 Using SQLite - LOCAL file database');
    console.log('[SERVER] 📁 Data stored on this machine only');
    console.log('[SERVER] 💡 Tip: Set DATABASE_URL to use centralized PostgreSQL');
  }
}

const dataStore = new DataStore(dbAdapter);

if (useMemoryDb) {
  console.log('[SERVER] 🧠 Using in-memory storage (data will not persist)');
} else if (dbAdapter) {
  // Get stats (async for PostgreSQL)
  const statsPromise = dbAdapter.getStats();
  if (statsPromise instanceof Promise) {
    statsPromise.then(stats => {
      console.log('[SERVER] Database stats:', stats);
    }).catch(err => {
      console.error('[SERVER] Failed to get stats:', err.message);
    });
  } else {
    console.log('[SERVER] Database stats:', statsPromise);
  }
}

const gameManager = new GameManager(dataStore, config);
const matchingEngine = new MatchingEngine(dataStore, config);
const botManager = new BotManager(dataStore, gameManager, matchingEngine, config);

// Map socket IDs to player IDs
const socketToPlayer = new Map();
const playerToSocket = new Map();

// Track spectator sockets (no associated player)
const spectatorSockets = new Set();

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

// Get database statistics
app.get('/api/database/stats', (req, res) => {
  if (useMemoryDb) {
    return res.json({
      mode: 'in-memory',
      message: 'Using in-memory storage - no persistent database'
    });
  }
  res.json({
    mode: 'sqlite',
    ...dbAdapter.getStats()
  });
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

  // Late-join: if a game is already running, this socket becomes a spectator automatically
  if (gameState && gameState.status === 'running') {
    spectatorSockets.add(socket.id);
    socket.emit('spectatorMode', true);
    socket.emit('orderBooks', matchingEngine.getAllOrderBooks());
    socket.emit('leaderboard', gameManager.getLiveLeaderboard());
    console.log(`[SOCKET] ${socket.id} auto-assigned as spectator (game in progress)`);
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

  // Voluntarily join as a spectator (lobby only)
  socket.on('joinAsSpectator', (callback) => {
    if (typeof callback !== 'function') return;

    // Can't spectate if already a player
    if (socketToPlayer.has(socket.id)) {
      return callback({ success: false, error: 'Already joined as a player' });
    }

    if (!gameManager.currentGame) {
      return callback({ success: false, error: 'No active game to spectate' });
    }

    spectatorSockets.add(socket.id);
    socket.emit('spectatorMode', true);
    console.log(`[SOCKET] ${socket.id} joined as spectator (voluntary)`);
    callback({ success: true });
  });

  // Join the game
  socket.on('joinGame', (data, callback) => {
    if (typeof callback !== 'function') return;
    const { playerName } = data;

    if (!playerName || playerName.trim().length === 0) {
      return callback({ success: false, error: 'Name is required' });
    }

    // If game is already running, auto-spectate (should already be set on connect,
    // but handle the case where they emit joinGame anyway)
    if (gameManager.currentGame?.status === 'running') {
      spectatorSockets.add(socket.id);
      socket.emit('spectatorMode', true);
      return callback({ success: true, spectator: true, message: 'Game in progress — joined as spectator' });
    }

    // If lobby is full (human players only), auto-spectate
    if (gameManager.isLobbyFull()) {
      spectatorSockets.add(socket.id);
      socket.emit('spectatorMode', true);
      console.log(`[SOCKET] ${socket.id} auto-spectating — lobby full`);
      return callback({ success: true, spectator: true, message: 'Lobby is full — joined as spectator' });
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

  // Configure bots (host only, lobby only)
  socket.on('configureBots', (data, callback) => {
    if (typeof callback !== 'function') return;
    const playerId = socketToPlayer.get(socket.id);
    if (!playerId) {
      return callback({ success: false, error: 'Not in game' });
    }
    if (!gameManager.currentGame) {
      return callback({ success: false, error: 'No active game' });
    }
    if (gameManager.currentGame.hostPlayerId !== playerId) {
      return callback({ success: false, error: 'Only the host can configure bots' });
    }
    if (gameManager.currentGame.status !== 'lobby') {
      return callback({ success: false, error: 'Can only configure bots before the game starts' });
    }

    const count = parseInt(data?.botCount ?? 0, 10);
    if (isNaN(count) || count < 0 || count > (config.bots?.maxBots ?? 10)) {
      return callback({ success: false, error: `Bot count must be 0–${config.bots?.maxBots ?? 10}` });
    }

    botManager.configureBots(gameManager.currentGame.gameId, count);
    io.emit('gameState', gameManager.getGameState());
    callback({ success: true, botCount: botManager.getBotCount() });
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
      // Start bot trading
      botManager.startBotTrading();

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

    // Stop bots and clean up
    const gameId = gameManager.currentGame?.gameId;
    botManager.cleanup(gameId);

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

    // Clear spectators and tell all clients to exit spectator mode
    spectatorSockets.clear();
    io.emit('spectatorMode', false);

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

    // Validate quantity has at most 2 decimal places
    const parsedQuantity = parseFloat(quantity);
    if (isNaN(parsedQuantity) || parsedQuantity <= 0) {
      return callback({ success: false, error: 'Invalid quantity' });
    }
    if (parsedQuantity !== Math.round(parsedQuantity * 100) / 100) {
      return callback({ success: false, error: 'Quantity must have at most 2 decimal places' });
    }

    const result = matchingEngine.submitOrder(
      gameManager.currentGame.gameId,
      player,
      product,
      side,
      orderType,
      parsedQuantity,
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
    // Remove from spectators if applicable
    spectatorSockets.delete(socket.id);

    const playerId = socketToPlayer.get(socket.id);

    if (playerId) {
      // Cancel all player's orders
      matchingEngine.cancelAllPlayerOrders(playerId);

      // Remove from game if in lobby, then handle host transfer
      if (gameManager.currentGame?.status === 'lobby') {
        const wasHost = gameManager.currentGame.hostPlayerId === playerId;
        gameManager.leaveGame(playerId);

        if (wasHost && gameManager.currentGame) {
          // Promote the next human player in the lobby to host
          const remaining = gameManager.currentGame.playerIds
            .filter(id => {
              const p = dataStore.getPlayer(id);
              return p && !p.isBot;
            });

          if (remaining.length > 0) {
            gameManager.currentGame.hostPlayerId = remaining[0];
            dataStore.saveGame(gameManager.currentGame);
            console.log(`[SOCKET] Host transferred to ${remaining[0].slice(0, 8)}`);

            // Notify the new host via their socket
            const newHostSocketId = playerToSocket.get(remaining[0]);
            if (newHostSocketId) {
              const newHostSocket = io.sockets.sockets.get(newHostSocketId);
              if (newHostSocket) {
                newHostSocket.emit('playerState', gameManager.getPlayerState(remaining[0]));
              }
            }
          } else {
            // No human players left — tear down the game so the lobby resets
            botManager.cleanup(gameManager.currentGame.gameId);
            gameManager.currentGame = null;
            if (gameManager.gameTimer) {
              clearInterval(gameManager.gameTimer);
              gameManager.gameTimer = null;
            }
            matchingEngine.reset();
            spectatorSockets.clear();
            console.log('[SOCKET] No players left in lobby — game torn down');
          }
        }
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

// ===== BOT EVENTS =====

// After a bot places an order, broadcast market updates to all clients
botManager.onBotAction = (result) => {
  // Always refresh order books
  io.emit('orderBooks', matchingEngine.getAllOrderBooks());

  if (result.trades && result.trades.length > 0) {
    io.emit('trades', result.trades.map(t => t.toJSON()));
    io.emit('leaderboard', gameManager.getLiveLeaderboard());

    // Notify human players whose positions changed
    for (const trade of result.trades) {
      for (const humanId of [trade.buyerId, trade.sellerId]) {
        const socketId = playerToSocket.get(humanId);
        if (socketId) {
          const playerSocket = io.sockets.sockets.get(socketId);
          if (playerSocket) {
            playerSocket.emit('playerState', gameManager.getPlayerState(humanId));
          }
        }
      }
    }
  }
};

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
  // Stop bots
  botManager.stopBotTrading();

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

// Graceful shutdown
const gracefulShutdown = async () => {
  console.log('\n[SERVER] Shutting down gracefully...');
  if (dbAdapter && !useMemoryDb) {
    const closeResult = dbAdapter.close();
    if (closeResult instanceof Promise) {
      await closeResult;
    }
  }
  server.close(() => {
    console.log('[SERVER] Server closed');
    process.exit(0);
  });
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
