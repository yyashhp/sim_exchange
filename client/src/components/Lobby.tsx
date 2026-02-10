import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import './Lobby.css';

const Lobby: React.FC = () => {
  const { gameState, config, createGame, joinGame, startGame, playerState } = useSocket();
  const [playerName, setPlayerName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreateGame = async () => {
    setLoading(true);
    setError('');
    const result: any = await createGame();
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
          <p className="subtitle">Trade ingredients, form sandwiches, maximize profit!</p>

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
              <h3>Game Rules</h3>
              <ul>
                <li>⏱️ Trade for {config.gameDuration} seconds</li>
                <li>🧺 Form complete sandwiches worth ${config.setValue}</li>
                <li>📦 Leftover ingredients valued at scrap prices:</li>
                <ul>
                  {config.products.map(p => (
                    <li key={p}>{p}: ${config.scrapValues[p]}</li>
                  ))}
                </ul>
                <li>🎯 Goal: Maximize your final portfolio value!</li>
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
