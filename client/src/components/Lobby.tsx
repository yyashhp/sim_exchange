import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import './Lobby.css';

const Lobby: React.FC = () => {
  const { gameState, config, createGame, joinGame, startGame, playerState } = useSocket();
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [gameMode, setGameMode] = useState<'sandwich' | 'randomProduct'>('sandwich');
  const [question, setQuestion] = useState('');

  const handleCreateGame = async () => {
    if (gameMode === 'randomProduct' && !question.trim()) {
      setError('Please enter a question for Random Product mode');
      return;
    }
    setLoading(true);
    setError('');
    const result: any = await createGame(gameMode, question.trim());
    setLoading(false);
    if (!result.success) {
      setError(result.error);
    }
  };

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    setLoading(true);
    setError('');
    const result: any = await joinGame(playerName.trim());
    setLoading(false);
    if (!result.success) {
      setError(result.error);
    }
  };

  const handleStartGame = async () => {
    setLoading(true);
    setError('');
    const result: any = await startGame();
    setLoading(false);
    if (!result.success) {
      setError(result.error);
    }
  };

  const isHost = playerState && gameState && gameState.hostPlayerId === playerState.playerId;

  // No game exists - show create game
  if (!gameState) {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <h1>🥪 Sandwich Trading Exchange</h1>
          <p className="subtitle">Select a game mode and create a new game</p>

          <div className="game-mode-selection">
            <h3>Game Mode</h3>
            <div className="mode-buttons">
              <button
                className={`btn mode-btn ${gameMode === 'sandwich' ? 'active' : ''}`}
                onClick={() => setGameMode('sandwich')}
              >
                🥪 Sandwich Exchange
              </button>
              <button
                className={`btn mode-btn ${gameMode === 'randomProduct' ? 'active' : ''}`}
                onClick={() => setGameMode('randomProduct')}
              >
                🎯 Random Product
              </button>
            </div>
          </div>

          {gameMode === 'randomProduct' && (
            <div className="question-input">
              <label htmlFor="question">Question:</label>
              <input
                id="question"
                type="text"
                placeholder="e.g., What is the close price of oil today?"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={200}
                disabled={loading}
              />
            </div>
          )}

          <button
            className="btn btn-primary btn-large"
            onClick={handleCreateGame}
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create New Game'}
          </button>

          {error && <p className="error">{error}</p>}

          {config && (
            <div className="game-rules">
              <h3>{gameMode === 'sandwich' ? 'Sandwich Exchange Rules' : 'Random Product Rules'}</h3>
              <ul>
                {gameMode === 'sandwich' ? (
                  <>
                    <li>⏱️ Trade for {config.gameDuration} seconds</li>
                    <li>🧺 Form complete sandwiches from random ingredients</li>
                    <li>📦 Leftover ingredients valued at scrap prices</li>
                    <li>🎯 Goal: Maximize your final portfolio value!</li>
                  </>
                ) : (
                  <>
                    <li>⏱️ Trade for {config.gameDuration} seconds</li>
                    <li>💰 Infinite cash - can go long or short</li>
                    <li>🎯 Trade based on your prediction</li>
                    <li>📊 Host enters correct value at end</li>
                    <li>💵 PnL calculated from your position</li>
                  </>
                )}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Game exists but player hasn't joined
  if (!playerState) {
    return (
      <div className="lobby">
        <div className="lobby-card">
          <h1>🥪 Join Game</h1>
          <p className="subtitle">{gameState.playerCount} / {gameState.maxPlayers} players</p>

          <form onSubmit={handleJoinGame}>
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={20}
              disabled={loading}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading || !playerName.trim()}
            >
              {loading ? 'Joining...' : 'Join Game'}
            </button>
          </form>

          {error && <p className="error">{error}</p>}

          <div className="players-list">
            <h3>Players in Lobby</h3>
            {gameState.players.map(p => (
              <div key={p.playerId} className="player-chip">{p.name}</div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Player is in lobby
  return (
    <div className="lobby">
      <div className="lobby-card">
        <h1>🥪 Game Lobby</h1>
        <p className="subtitle">Waiting for host to start...</p>

        <div className="player-info">
          <h3>Welcome, {playerState.name}!</h3>
          <p>Starting Cash: ${playerState.cash}</p>
          <p>Starting Inventory:</p>
          <div className="inventory-display">
            {config?.products.map(p => (
              <div key={p} className="inventory-item">
                <span className="item-name">{p}</span>
                <span className="item-count">{playerState.inventory[p] || 0}</span>
              </div>
            ))}
          </div>
          <p className="inventory-value">Total Value: ${playerState.inventoryValue}</p>
        </div>

        <div className="players-list">
          <h3>Players ({gameState.playerCount} / {gameState.maxPlayers})</h3>
          {gameState.players.map(p => (
            <div key={p.playerId} className={`player-chip ${p.playerId === playerState.playerId ? 'you' : ''}`}>
              {p.name} {p.playerId === gameState.hostPlayerId && '👑'}
              {p.playerId === playerState.playerId && ' (You)'}
            </div>
          ))}
        </div>

        {isHost ? (
          <button
            className="btn btn-primary btn-large"
            onClick={handleStartGame}
            disabled={loading || gameState.playerCount < 2}
          >
            {loading ? 'Starting...' : 'Start Game'}
          </button>
        ) : (
          <p className="waiting-message">Waiting for host to start the game...</p>
        )}

        {isHost && gameState.playerCount < 2 && (
          <p className="info">Need at least 2 players to start</p>
        )}

        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
};

export default Lobby;
