import React from 'react';
import { useSocket } from '../context/SocketContext';
import './RecentTrades.css';

const RecentTrades: React.FC = () => {
  const { recentTrades, playerState } = useSocket();

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const isMyTrade = (trade: any) => {
    if (!playerState) return false;
    return trade.buyerId === playerState.playerId || trade.sellerId === playerState.playerId;
  };

  return (
    <div className="recent-trades">
      <h3>📈 Recent Trades</h3>

      <div className="trades-list">
        {recentTrades.slice(0, 15).map(trade => (
          <div
            key={trade.tradeId}
            className={`trade-item ${isMyTrade(trade) ? 'my-trade' : ''}`}
          >
            <div className="trade-time">{formatTime(trade.executedAt)}</div>
            <div className="trade-product">{trade.product}</div>
            <div className="trade-details">
              <span className="trade-qty">{trade.quantity}</span>
              <span className="trade-at">@</span>
              <span className="trade-price">${trade.price}</span>
            </div>
            <div className="trade-value">${trade.value}</div>
          </div>
        ))}

        {recentTrades.length === 0 && (
          <div className="no-trades">No trades yet</div>
        )}
      </div>
    </div>
  );
};

export default RecentTrades;
