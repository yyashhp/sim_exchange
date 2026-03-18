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
      {config.gameMode === 'randomProduct' ? (
        // Random Product mode
        <>
          <div className="status-section">
            <h3>📊 Position</h3>
            <div className="position-display">
              <div className={`position-value ${(playerState.position || 0) >= 0 ? 'long' : 'short'}`}>
                {playerState.position || 0}
              </div>
              <div className="position-label">
                {(playerState.position || 0) > 0 ? 'Long' : (playerState.position || 0) < 0 ? 'Short' : 'Flat'}
              </div>
            </div>
          </div>

          <div className="status-section">
            <h3>💰 Cash</h3>
            <div className="cash-display">${playerState.cash.toFixed(2)}</div>
            <div className="cash-note">Infinite cash mode</div>
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
                      <span className="order-price">@ ${order.price?.toFixed(2) ?? 'MKT'}</span>
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
        </>
      ) : (
        // Sandwich Exchange mode
        <>
          <div className="status-section">
            <h3>💰 Cash</h3>
            <div className="cash-display">${playerState.cash.toFixed(2)}</div>
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
                  <span className="item-value">${((playerState.inventory[product] || 0) * config.scrapValues[product]).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="inventory-total">
              <span>Total Value:</span>
              <span>${(playerState.inventoryValue || 0).toFixed(2)}</span>
            </div>
          </div>

          <div className="status-section">
            <h3>🥪 Sandwiches</h3>
            <div className="sets-display">
              <div className="sets-count">{playerState.completeSets || 0}</div>
              <div className="sets-label">Complete Sets</div>
              <div className="sets-value">Worth ${((playerState.completeSets || 0) * config.setValue).toFixed(2)}</div>
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
                      <span className="order-price">@ ${order.price?.toFixed(2) ?? 'MKT'}</span>
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
              <span>${playerState.cash.toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Inventory (scrap):</span>
              <span>${(playerState.inventoryValue || 0).toFixed(2)}</span>
            </div>
            <div className="summary-row">
              <span>Sets ({playerState.completeSets || 0} × ${config.setValue}):</span>
              <span>${((playerState.completeSets || 0) * config.setValue).toFixed(2)}</span>
            </div>
            <div className="summary-row total">
              <span>Est. Total:</span>
              <span>${(playerState.cash + (playerState.inventoryValue || 0)).toFixed(2)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default PlayerStatus;
