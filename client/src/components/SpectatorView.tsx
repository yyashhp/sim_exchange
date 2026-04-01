import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import OrderBook from './OrderBook';
import Leaderboard from './Leaderboard';
import RecentTrades from './RecentTrades';
import './SpectatorView.css';

const SpectatorView: React.FC = () => {
  const { config, gameState, orderBooks, remainingTime, leaderboard, resetGame } = useSocket();
  const [resetLoading, setResetLoading] = useState(false);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeColor = () => {
    if (remainingTime > 60) return '#4CAF50';
    if (remainingTime > 30) return '#ffd700';
    return '#ff6b6b';
  };

  const handleReset = async () => {
    setResetLoading(true);
    await resetGame();
    setResetLoading(false);
  };

  const isEnded = gameState?.status === 'ended';

  return (
    <div className="spectator-view">
      {/* Header */}
      <header className="spectator-header">
        <div className="header-left">
          <h1>{config?.gameMode === 'randomProduct' ? '📊 Random Product' : '🥪 Sandwich Exchange'}</h1>
          <span className="spectator-badge">👁 SPECTATING</span>
        </div>

        <div className="spectator-timer">
          {isEnded ? (
            <span className="ended-label">Game Over</span>
          ) : (
            <>
              <span className="timer-label">Time Remaining</span>
              <span className="timer-value" style={{ color: getTimeColor() }}>
                {formatTime(remainingTime)}
              </span>
            </>
          )}
        </div>

        <div className="header-right">
          {isEnded && (
            <button
              className="btn-reset"
              onClick={handleReset}
              disabled={resetLoading}
            >
              {resetLoading ? 'Resetting...' : 'New Game'}
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="spectator-content">
        {/* Order books — read-only (no click-to-fill) */}
        <div className="spectator-books">
          <h2>Order Books</h2>
          <div className="spectator-books-grid">
            {(config?.products || []).map(product => (
              <OrderBook
                key={product}
                orderBook={orderBooks[product] || {
                  product,
                  bids: [],
                  asks: [],
                  bestBid: null,
                  bestAsk: null,
                  spread: null
                }}
                onSelectPrice={() => {}}  // no-op: spectators can't trade
              />
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="spectator-sidebar">
          <Leaderboard />
          <RecentTrades />
        </div>
      </div>

      {/* Info bar */}
      <div className="spectator-info-bar">
        {isEnded
          ? `Final standings — ${leaderboard?.length || 0} player${(leaderboard?.length || 0) !== 1 ? 's' : ''} competed`
          : `Watching live · ${leaderboard?.length || 0} player${(leaderboard?.length || 0) !== 1 ? 's' : ''} trading`}
      </div>
    </div>
  );
};

export default SpectatorView;
