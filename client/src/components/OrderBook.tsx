import React from 'react';
import { OrderBookDepth } from '../types';
import './OrderBook.css';

interface OrderBookProps {
  orderBook: OrderBookDepth;
  onSelectPrice: (price: number, side: 'buy' | 'sell') => void;
}

const OrderBook: React.FC<OrderBookProps> = ({ orderBook, onSelectPrice }) => {
  const maxQuantity = Math.max(
    ...orderBook.bids.map(b => b.quantity),
    ...orderBook.asks.map(a => a.quantity),
    1
  );

  return (
    <div className="order-book">
      <div className="order-book-header">
        <h3>{orderBook.product.toUpperCase()}</h3>
        <div className="spread">
          {orderBook.spread !== null ? (
            <span>Spread: ${orderBook.spread}</span>
          ) : (
            <span>No spread</span>
          )}
        </div>
      </div>

      <div className="order-book-body">
        {/* Asks (sells) - displayed in reverse order (lowest at bottom) */}
        <div className="asks">
          <div className="level-header">
            <span>Price</span>
            <span>Size</span>
          </div>
          {orderBook.asks.slice(0, 5).reverse().map((level, i) => (
            <div
              key={`ask-${level.price}`}
              className="level ask"
              onClick={() => onSelectPrice(level.price, 'buy')}
            >
              <div
                className="level-bar"
                style={{ width: `${(level.quantity / maxQuantity) * 100}%` }}
              />
              <span className="price">${level.price}</span>
              <span className="quantity">{level.quantity}</span>
            </div>
          ))}
          {orderBook.asks.length === 0 && (
            <div className="empty-level">No asks</div>
          )}
        </div>

        {/* Best prices display */}
        <div className="best-prices">
          <div className="best-ask">
            Ask: {orderBook.bestAsk !== null ? `$${orderBook.bestAsk}` : '-'}
          </div>
          <div className="best-bid">
            Bid: {orderBook.bestBid !== null ? `$${orderBook.bestBid}` : '-'}
          </div>
        </div>

        {/* Bids (buys) - highest at top */}
        <div className="bids">
          {orderBook.bids.slice(0, 5).map((level, i) => (
            <div
              key={`bid-${level.price}`}
              className="level bid"
              onClick={() => onSelectPrice(level.price, 'sell')}
            >
              <div
                className="level-bar"
                style={{ width: `${(level.quantity / maxQuantity) * 100}%` }}
              />
              <span className="price">${level.price}</span>
              <span className="quantity">{level.quantity}</span>
            </div>
          ))}
          {orderBook.bids.length === 0 && (
            <div className="empty-level">No bids</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default OrderBook;
