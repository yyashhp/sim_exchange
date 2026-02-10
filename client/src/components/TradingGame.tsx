import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import OrderBook from './OrderBook';
import TradingPanel from './TradingPanel';
import PlayerStatus from './PlayerStatus';
import Leaderboard from './Leaderboard';
import RecentTrades from './RecentTrades';
import './TradingGame.css';

const TradingGame: React.FC = () => {
  const { config, orderBooks, remainingTime, playerState } = useSocket();
  const [selectedProduct, setSelectedProduct] = useState(config?.products[0] || 'bread');
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [selectedSide, setSelectedSide] = useState<'buy' | 'sell' | null>(null);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSelectPrice = (product: string, price: number, side: 'buy' | 'sell') => {
    setSelectedProduct(product);
    setSelectedPrice(price);
    setSelectedSide(side);
  };

  const getTimeColor = () => {
    if (remainingTime > 60) return '#4CAF50';
    if (remainingTime > 30) return '#ffd700';
    return '#ff6b6b';
  };

  return (
    <div className="trading-game">
      {/* Header */}
      <header className="game-header">
        <div className="header-left">
          <h1>🥪 Sandwich Exchange</h1>
          <span className="player-name">{playerState?.name}</span>
        </div>
        <div className="timer" style={{ color: getTimeColor() }}>
          <span className="timer-label">Time Remaining</span>
          <span className="timer-value">{formatTime(remainingTime)}</span>
        </div>
        <div className="header-right">
          <div className="quick-stats">
            <div className="quick-stat">
              <span className="stat-label">Cash</span>
              <span className="stat-value">${playerState?.cash || 0}</span>
            </div>
            <div className="quick-stat">
              <span className="stat-label">Sets</span>
              <span className="stat-value">🥪 {playerState?.completeSets || 0}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="game-content">
        {/* Order Books */}
        <div className="order-books-section">
          <h2>Order Books</h2>
          <div className="order-books-grid">
            {config?.products.map(product => (
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
                onSelectPrice={(price, side) => handleSelectPrice(product, price, side)}
              />
            ))}
          </div>
        </div>

        {/* Trading Panel */}
        <div className="trading-section">
          <TradingPanel
            selectedProduct={selectedProduct}
            selectedPrice={selectedPrice}
            selectedSide={selectedSide}
            onClearSelection={() => {
              setSelectedPrice(null);
              setSelectedSide(null);
            }}
          />
        </div>

        {/* Right Sidebar */}
        <div className="sidebar">
          <PlayerStatus />
          <Leaderboard />
          <RecentTrades />
        </div>
      </div>

      {/* Game Rules Reminder */}
      <div className="rules-reminder">
        <strong>Goal:</strong> Form complete sandwiches (1 of each: 🍞🥬🧀🥩) worth ${config?.setValue || 30}.
        Leftover ingredients: bread=${config?.scrapValues.bread}, veggies=${config?.scrapValues.veggies},
        cheese=${config?.scrapValues.cheese}, meat=${config?.scrapValues.meat}
      </div>
    </div>
  );
};

export default TradingGame;
