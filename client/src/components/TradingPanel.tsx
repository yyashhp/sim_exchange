import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import './TradingPanel.css';

interface TradingPanelProps {
  selectedProduct: string;
  selectedPrice: number | null;
  selectedSide: 'buy' | 'sell' | null;
  onClearSelection: () => void;
}

const TradingPanel: React.FC<TradingPanelProps> = ({
  selectedProduct,
  selectedPrice,
  selectedSide,
  onClearSelection
}) => {
  const { config, playerState, placeOrder } = useSocket();
  const [product, setProduct] = useState(selectedProduct);
  const [side, setSide] = useState<'buy' | 'sell'>(selectedSide || 'buy');
  const [orderType, setOrderType] = useState<'limit' | 'market'>('limit');
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState(selectedPrice?.toString() || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Update when props change
  React.useEffect(() => {
    if (selectedProduct) setProduct(selectedProduct);
    if (selectedPrice !== null) setPrice(selectedPrice.toString());
    if (selectedSide) setSide(selectedSide);
  }, [selectedProduct, selectedPrice, selectedSide]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const qty = parseInt(quantity);
    const prc = orderType === 'limit' ? parseFloat(price) : undefined;

    if (isNaN(qty) || qty <= 0) {
      setError('Invalid quantity');
      setLoading(false);
      return;
    }

    if (orderType === 'limit' && (prc === undefined || isNaN(prc) || prc <= 0)) {
      setError('Invalid price for limit order');
      setLoading(false);
      return;
    }

    const result: any = await placeOrder(product, side, orderType, qty, prc);
    setLoading(false);

    if (!result.success) {
      setError(result.error);
    } else {
      setSuccess(`Order placed! ${result.trades?.length || 0} trades executed`);
      setQuantity('1');
      setTimeout(() => setSuccess(''), 3000);
    }
  };

  const estimatedCost = () => {
    if (!price || !quantity) return null;
    const total = parseFloat(price) * parseInt(quantity);
    if (isNaN(total)) return null;
    return total;
  };

  const canAfford = () => {
    if (!playerState) return false;
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty <= 0) return false;
    if (side === 'buy') {
      if (orderType === 'market') {
        // For market orders, just check player has some cash
        return playerState.cash > 0;
      }
      const cost = estimatedCost();
      return cost !== null && playerState.cash >= cost;
    } else {
      return (playerState.inventory[product] || 0) >= qty;
    }
  };

  return (
    <div className="trading-panel">
      <h3>Place Order</h3>

      <form onSubmit={handleSubmit}>
        {/* Product Selection */}
        <div className="form-group">
          <label>Product</label>
          <div className="product-buttons">
            {config?.products.map(p => (
              <button
                key={p}
                type="button"
                className={`product-btn ${product === p ? 'active' : ''}`}
                onClick={() => setProduct(p)}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Side Selection */}
        <div className="form-group">
          <label>Side</label>
          <div className="side-buttons">
            <button
              type="button"
              className={`side-btn buy ${side === 'buy' ? 'active' : ''}`}
              onClick={() => setSide('buy')}
            >
              BUY
            </button>
            <button
              type="button"
              className={`side-btn sell ${side === 'sell' ? 'active' : ''}`}
              onClick={() => setSide('sell')}
            >
              SELL
            </button>
          </div>
        </div>

        {/* Order Type */}
        <div className="form-group">
          <label>Order Type</label>
          <div className="type-buttons">
            <button
              type="button"
              className={`type-btn ${orderType === 'limit' ? 'active' : ''}`}
              onClick={() => setOrderType('limit')}
            >
              Limit
            </button>
            <button
              type="button"
              className={`type-btn ${orderType === 'market' ? 'active' : ''}`}
              onClick={() => setOrderType('market')}
            >
              Market
            </button>
          </div>
        </div>

        {/* Quantity */}
        <div className="form-group">
          <label>Quantity</label>
          <input
            type="number"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            min="1"
            max="100"
          />
        </div>

        {/* Price (for limit orders) */}
        {orderType === 'limit' && (
          <div className="form-group">
            <label>Price</label>
            <input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              min="1"
              step="1"
              placeholder="Enter price"
            />
          </div>
        )}

        {/* Order Summary */}
        <div className="order-summary">
          {side === 'buy' ? (
            <>
              <div className="summary-row">
                <span>Available Cash:</span>
                <span>${playerState?.cash || 0}</span>
              </div>
              {orderType === 'limit' && estimatedCost() !== null && (
                <div className="summary-row">
                  <span>Est. Cost:</span>
                  <span className={canAfford() ? 'affordable' : 'not-affordable'}>
                    ${estimatedCost()}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="summary-row">
              <span>Available {product}:</span>
              <span>{playerState?.inventory[product] || 0}</span>
            </div>
          )}
        </div>

        {error && <p className="error">{error}</p>}
        {success && <p className="success">{success}</p>}

        <button
          type="submit"
          className={`submit-btn ${side}`}
          disabled={loading || !canAfford()}
        >
          {loading ? 'Placing...' : `${side.toUpperCase()} ${quantity} ${product.toUpperCase()}`}
        </button>
      </form>
    </div>
  );
};

export default TradingPanel;
