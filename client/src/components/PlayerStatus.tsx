import React from 'react';
import { useSocket } from '../context/SocketContext';
import './PlayerStatus.css';

const PlayerStatus: React.FC = () => {
  const { config, playerState, cancelOrder } = useSocket();

  if (!playerState || !config) return null;

  const handleCancelOrder = async (orderId: string) => {
    const result: any = await cancelOrder(orderId);
    if (!result.success) {
      alert(result.error);
    }
  };

  return (
    <div className="player-status">
      <div className="status-section">
        <h3>💰 Cash</h3>
        <div className="cash-display">${playerState.cash}</div>
      </div>

      <div className="status-section">
        <h3>📦 Inventory</h3>
        <div className="inventory-grid">
          {config.products.map(product => (
            <div key={product} className="inventory-item">
              <span className="item-icon">
                {product === 'bread' && '🍞'}
                {product === 'veggies' && '🥬'}
                {product === 'cheese' && '🧀'}
                {product === 'meat' && '🥩'}
              </span>
              <span className="item-name">{product}</span>
              <span className="item-count">{playerState.inventory[product] || 0}</span>
              <span className="item-value">${(playerState.inventory[product] || 0) * config.scrapValues[product]}</span>
            </div>
          ))}
        </div>
        <div className="inventory-total">
          <span>Total Value:</span>
          <span>${playerState.inventoryValue}</span>
        </div>
      </div>

      <div className="status-section">
        <h3>🥪 Sandwiches</h3>
        <div className="sets-display">
          <div className="sets-count">{playerState.completeSets}</div>
          <div className="sets-label">Complete Sets</div>
          <div className="sets-value">Worth ${playerState.completeSets * config.setValue}</div>
        </div>
      </div>

      <div className="status-section">
        <h3>📋 Open Orders ({playerState.openOrders.length})</h3>
        <div className="orders-list">
          {playerState.openOrders.length === 0 ? (
            <div className="no-orders">No open orders</div>
          ) : (
            playerState.openOrders.map(order => (
              <div key={order.orderId} className={`order-item ${order.side}`}>
                <div className="order-info">
                  <span className="order-side">{order.side.toUpperCase()}</span>
                  <span className="order-qty">{order.remainingQuantity}</span>
                  <span className="order-product">{order.product}</span>
                  <span className="order-price">@ ${order.price}</span>
                </div>
                <button
                  className="cancel-btn"
                  onClick={() => handleCancelOrder(order.orderId)}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="status-section summary">
        <h3>📊 Summary</h3>
        <div className="summary-row">
          <span>Cash:</span>
          <span>${playerState.cash}</span>
        </div>
        <div className="summary-row">
          <span>Inventory (scrap):</span>
          <span>${playerState.inventoryValue}</span>
        </div>
        <div className="summary-row">
          <span>Sets ({playerState.completeSets} × ${config.setValue}):</span>
          <span>${playerState.completeSets * config.setValue}</span>
        </div>
        <div className="summary-row total">
          <span>Est. Total:</span>
          <span>${playerState.cash + playerState.inventoryValue}</span>
        </div>
      </div>
    </div>
  );
};

export default PlayerStatus;
