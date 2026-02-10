/**
 * Matching Engine - Handles order matching and trade execution
 *
 * Features:
 * - Price-time priority matching
 * - Market and limit order support
 * - Partial fills
 * - Self-trade prevention
 */

const { Order, Trade, OrderBook } = require('../models');

class MatchingEngine {
  constructor(dataStore, config) {
    this.dataStore = dataStore;
    this.config = config;
    this.orderBooks = new Map();

    // Initialize order books for each product
    for (const product of config.products) {
      this.orderBooks.set(product, new OrderBook(product));
    }
  }

  /**
   * Submit a new order
   * @returns {{ order: Order, trades: Trade[], errors: string[] }}
   */
  submitOrder(gameId, player, product, side, orderType, quantity, price = null) {
    const errors = [];
    const trades = [];

    // Validation
    if (!this.config.products.includes(product)) {
      errors.push(`Invalid product: ${product}`);
      return { order: null, trades, errors };
    }

    if (quantity < this.config.minOrderSize || quantity > this.config.maxOrderSize) {
      errors.push(`Quantity must be between ${this.config.minOrderSize} and ${this.config.maxOrderSize}`);
      return { order: null, trades, errors };
    }

    if (orderType === 'limit' && (price === null || price <= 0)) {
      errors.push('Limit orders require a positive price');
      return { order: null, trades, errors };
    }

    // Check if player has enough resources
    if (side === 'buy') {
      const requiredCash = orderType === 'limit' ? quantity * price : this.estimateMarketBuyCost(product, quantity);
      if (player.cash < requiredCash) {
        errors.push(`Insufficient cash. Required: ${requiredCash}, Available: ${player.cash}`);
        return { order: null, trades, errors };
      }
    } else {
      if ((player.inventory[product] || 0) < quantity) {
        errors.push(`Insufficient ${product}. Required: ${quantity}, Available: ${player.inventory[product] || 0}`);
        return { order: null, trades, errors };
      }
    }

    // Create the order
    const order = new Order(
      gameId,
      player.playerId,
      player.name,
      product,
      side,
      orderType,
      quantity,
      price
    );

    // Try to match the order
    const matchResult = this.matchOrder(order, player);
    trades.push(...matchResult.trades);

    // If order has remaining quantity and is a limit order, add to book
    if (order.remainingQuantity > 0 && orderType === 'limit') {
      const orderBook = this.orderBooks.get(product);
      orderBook.addOrder(order);
      player.addOrder(order.orderId);
    } else if (order.remainingQuantity > 0 && orderType === 'market') {
      // Market order with remaining quantity - no liquidity
      // Keep it open to be filled when liquidity arrives
      const orderBook = this.orderBooks.get(product);
      // Convert to aggressive limit order at best price
      if (side === 'buy') {
        order.price = 999999; // Very high price to ensure it's at top of book
      } else {
        order.price = 1; // Very low price to ensure it's at top of book
      }
      order.orderType = 'limit'; // Convert to limit
      orderBook.addOrder(order);
      player.addOrder(order.orderId);
      console.log(`[ENGINE] Market order ${order.orderId} has ${order.remainingQuantity} remaining - converted to aggressive limit`);
    }

    // Save order to datastore
    this.dataStore.saveOrder(order);

    return { order, trades, errors };
  }

  /**
   * Match an incoming order against the order book
   */
  matchOrder(incomingOrder, incomingPlayer) {
    const trades = [];
    const orderBook = this.orderBooks.get(incomingOrder.product);

    while (incomingOrder.remainingQuantity > 0) {
      // Get the best opposing order
      let opposingOrder;
      if (incomingOrder.side === 'buy') {
        opposingOrder = orderBook.getBestAsk();
      } else {
        opposingOrder = orderBook.getBestBid();
      }

      // No opposing order available
      if (!opposingOrder) {
        break;
      }

      // Self-trade prevention
      if (opposingOrder.playerId === incomingOrder.playerId) {
        console.log(`[ENGINE] Self-trade prevented for player ${incomingOrder.playerId}`);
        break;
      }

      // Price check for limit orders
      if (incomingOrder.orderType === 'limit') {
        if (incomingOrder.side === 'buy' && incomingOrder.price < opposingOrder.price) {
          break; // Buy price too low
        }
        if (incomingOrder.side === 'sell' && incomingOrder.price > opposingOrder.price) {
          break; // Sell price too high
        }
      }

      // Execute the trade
      const trade = this.executeTrade(incomingOrder, opposingOrder, incomingPlayer);
      if (trade) {
        trades.push(trade);
      }

      // Clean up filled orders
      orderBook.cleanup();
    }

    return { trades };
  }

  /**
   * Execute a trade between two orders
   */
  executeTrade(incomingOrder, restingOrder, incomingPlayer) {
    const quantity = Math.min(incomingOrder.remainingQuantity, restingOrder.remainingQuantity);
    const price = restingOrder.price; // Trade at the resting order's price

    // Determine buyer and seller
    let buyOrder, sellOrder, buyerId, sellerId;
    if (incomingOrder.side === 'buy') {
      buyOrder = incomingOrder;
      sellOrder = restingOrder;
      buyerId = incomingOrder.playerId;
      sellerId = restingOrder.playerId;
    } else {
      buyOrder = restingOrder;
      sellOrder = incomingOrder;
      buyerId = restingOrder.playerId;
      sellerId = incomingOrder.playerId;
    }

    // Get player objects
    const buyer = this.dataStore.getPlayer(buyerId);
    const seller = this.dataStore.getPlayer(sellerId);

    if (!buyer || !seller) {
      console.error('[ENGINE] Could not find buyer or seller');
      return null;
    }

    const tradeValue = quantity * price;

    // Check resources one more time
    if (buyer.cash < tradeValue) {
      console.log(`[ENGINE] Buyer ${buyerId} has insufficient cash for trade`);
      return null;
    }
    if ((seller.inventory[incomingOrder.product] || 0) < quantity) {
      console.log(`[ENGINE] Seller ${sellerId} has insufficient inventory for trade`);
      return null;
    }

    // Execute the trade
    // Update buyer
    buyer.cash -= tradeValue;
    buyer.inventory[incomingOrder.product] = (buyer.inventory[incomingOrder.product] || 0) + quantity;

    // Update seller
    seller.cash += tradeValue;
    seller.inventory[incomingOrder.product] = (seller.inventory[incomingOrder.product] || 0) - quantity;

    // Create trade record
    const trade = new Trade(
      incomingOrder.gameId,
      buyOrder.orderId,
      sellOrder.orderId,
      buyerId,
      sellerId,
      incomingOrder.product,
      quantity,
      price
    );

    // Update orders
    buyOrder.fill(trade.tradeId, quantity, price);
    sellOrder.fill(trade.tradeId, quantity, price);

    // Update player trade history
    buyer.addTrade(trade.tradeId);
    seller.addTrade(trade.tradeId);

    // Remove order from player's open orders if filled
    if (buyOrder.status === 'filled') {
      buyer.removeOrder(buyOrder.orderId);
    }
    if (sellOrder.status === 'filled') {
      seller.removeOrder(sellOrder.orderId);
    }

    // Save to datastore
    this.dataStore.saveTrade(trade);
    this.dataStore.savePlayer(buyer);
    this.dataStore.savePlayer(seller);
    this.dataStore.saveOrder(buyOrder);
    this.dataStore.saveOrder(sellOrder);

    console.log(`[ENGINE] Trade executed: ${quantity} ${incomingOrder.product} @ ${price} (${buyerId} <- ${sellerId})`);

    return trade;
  }

  /**
   * Cancel an order
   */
  cancelOrder(orderId, playerId) {
    const order = this.dataStore.getOrder(orderId);

    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    if (order.playerId !== playerId) {
      return { success: false, error: 'Not your order' };
    }

    if (order.status === 'filled' || order.status === 'cancelled') {
      return { success: false, error: 'Order already ' + order.status };
    }

    // Remove from order book
    const orderBook = this.orderBooks.get(order.product);
    orderBook.removeOrder(orderId);

    // Update order status
    order.cancel();

    // Update player
    const player = this.dataStore.getPlayer(playerId);
    if (player) {
      player.removeOrder(orderId);
      this.dataStore.savePlayer(player);
    }

    // Save order
    this.dataStore.saveOrder(order);

    console.log(`[ENGINE] Order cancelled: ${orderId}`);

    return { success: true, order };
  }

  /**
   * Estimate cost for a market buy order
   */
  estimateMarketBuyCost(product, quantity) {
    const orderBook = this.orderBooks.get(product);
    let remaining = quantity;
    let cost = 0;

    const asks = orderBook.asks.filter(o => o.status === 'open' || o.status === 'partial');

    for (const ask of asks) {
      if (remaining <= 0) break;
      const fillQty = Math.min(remaining, ask.remainingQuantity);
      cost += fillQty * ask.price;
      remaining -= fillQty;
    }

    // If not enough liquidity, estimate with a high price
    if (remaining > 0) {
      cost += remaining * 100; // High estimate for missing liquidity
    }

    return cost;
  }

  /**
   * Get order book depth for a product
   */
  getOrderBookDepth(product) {
    const orderBook = this.orderBooks.get(product);
    if (!orderBook) return null;
    return orderBook.getDepth(this.config.showOrderNames);
  }

  /**
   * Get all order books
   */
  getAllOrderBooks() {
    const books = {};
    for (const product of this.config.products) {
      books[product] = this.getOrderBookDepth(product);
    }
    return books;
  }

  /**
   * Cancel all orders for a player (e.g., when they disconnect)
   */
  cancelAllPlayerOrders(playerId) {
    const player = this.dataStore.getPlayer(playerId);
    if (!player) return;

    const orderIds = [...player.openOrderIds];
    for (const orderId of orderIds) {
      this.cancelOrder(orderId, playerId);
    }
  }

  /**
   * Cancel all orders in the game (e.g., when game ends)
   */
  cancelAllOrders(gameId) {
    for (const [product, orderBook] of this.orderBooks) {
      const orders = [...orderBook.bids, ...orderBook.asks];
      for (const order of orders) {
        if (order.gameId === gameId && (order.status === 'open' || order.status === 'partial')) {
          order.cancel();
          this.dataStore.saveOrder(order);
        }
      }
      orderBook.bids = [];
      orderBook.asks = [];
    }
    console.log(`[ENGINE] All orders cancelled for game ${gameId}`);
  }

  /**
   * Reset all order books (for new game)
   */
  reset() {
    for (const product of this.config.products) {
      this.orderBooks.set(product, new OrderBook(product));
    }
    console.log('[ENGINE] Order books reset');
  }

  /**
   * Get recent trades for a product
   */
  getRecentTrades(gameId, product, limit = 20) {
    const trades = this.dataStore.getTradesByGame(gameId);
    return trades
      .filter(t => t.product === product)
      .sort((a, b) => new Date(b.executedAt) - new Date(a.executedAt))
      .slice(0, limit);
  }
}

module.exports = MatchingEngine;
