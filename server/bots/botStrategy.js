/**
 * BotStrategy - Rational trading logic for bot players.
 *
 * Decision hierarchy per tick:
 *  1. Hit a favourable existing order (market order) to fill an inventory need
 *  2. Hit a favourable existing order (market order) to liquidate excess
 *  3. Post a passive limit bid for a needed ingredient
 *  4. Post a passive limit ask to sell excess
 *  5. Light market-making (post one bid or ask at a fair price to add liquidity)
 *
 * Pricing anchors:
 *  - Buy needed items up to scrap_value * (1 + marginAboveScrap)
 *  - Sell excess items at minimum scrap_value * (1 + marginAboveScrap),
 *    reduced slightly when < 20% of game time remains
 *  - Market-make at scrap_value ± a small spread
 */

class BotStrategy {
  constructor(config) {
    this.config = config;
  }

  /**
   * Determine how many complete sets the player can currently form,
   * what ingredients are still needed for the *next* set, and what
   * ingredients are in excess of that target.
   *
   * @returns {{ completeSets: number, needs: Record<string,number>, excess: Record<string,number> }}
   */
  analyzeInventoryNeeds(player) {
    const { setRecipe } = this.config;
    const inventory = player.inventory;

    // Count complete sets
    let completeSets = Infinity;
    for (const [product, required] of Object.entries(setRecipe)) {
      const have = inventory[product] || 0;
      completeSets = Math.min(completeSets, Math.floor(have / required));
    }
    if (!isFinite(completeSets)) completeSets = 0;

    // Needs / excess relative to completing one *more* set
    const targetSets = completeSets + 1;
    const needs = {};
    const excess = {};

    for (const [product, required] of Object.entries(setRecipe)) {
      const have = inventory[product] || 0;
      const target = required * targetSets;

      if (have < target) {
        needs[product] = target - have;
      } else if (have > target) {
        excess[product] = have - target;
      }
    }

    return { completeSets, needs, excess };
  }

  /**
   * Maximum price the bot is willing to pay for one unit of `product`.
   * @param {boolean} isNeeded - true when the ingredient is required for a set
   */
  _maxBuyPrice(product, isNeeded) {
    const scrap = this.config.scrapValues[product];
    const margin = this.config.bots.marginAboveScrap;

    if (isNeeded) {
      return Math.floor(scrap * (1 + margin));
    }
    // Market-making bid: just below scrap value
    return Math.floor(scrap * 0.9);
  }

  /**
   * Minimum price the bot is willing to accept when selling `product`.
   * @param {number} gameProgress - 0 (start) to 1 (end)
   */
  _minSellPrice(product, gameProgress) {
    const scrap = this.config.scrapValues[product];
    const margin = this.config.bots.marginAboveScrap;
    // Reduce required margin in the final 20% of the game (urgency to liquidate)
    const urgencyDiscount = gameProgress > 0.8 ? margin * 0.6 : 0;
    return Math.ceil(scrap * (1 + margin - urgencyDiscount));
  }

  /**
   * Generate one trading action for the bot this tick.
   *
   * @param {Player}                  player
   * @param {Map<string, OrderBook>}  orderBooks  - live OrderBook instances
   * @param {number}                  remainingTime - seconds left in game
   * @param {number}                  gameDuration  - total game duration
   * @returns {{ side, orderType, product, quantity, price? } | null}
   */
  generateTradingAction(player, orderBooks, remainingTime, gameDuration) {
    const gameProgress = 1 - (remainingTime / gameDuration);
    const { needs, excess } = this.analyzeInventoryNeeds(player);

    // ---- Priority 1: Immediately fill a needed ingredient via market order ----
    for (const [product, needed] of Object.entries(needs)) {
      const book = orderBooks[product];
      const bestAsk = book ? book.getBestAsk() : null;
      const maxPrice = this._maxBuyPrice(product, true);

      if (bestAsk && bestAsk.price <= maxPrice) {
        const qty = Math.min(
          needed,
          bestAsk.remainingQuantity,
          Math.floor(player.cash / bestAsk.price),
          5
        );
        if (qty >= 1) {
          return { side: 'buy', orderType: 'market', product, quantity: qty };
        }
      }
    }

    // ---- Priority 2: Immediately liquidate excess via market order ----
    for (const [product, amt] of Object.entries(excess)) {
      const book = orderBooks[product];
      const bestBid = book ? book.getBestBid() : null;
      const minPrice = this._minSellPrice(product, gameProgress);

      if (bestBid && bestBid.price >= minPrice) {
        const qty = Math.min(amt, bestBid.remainingQuantity, 5);
        if (qty >= 1) {
          return { side: 'sell', orderType: 'market', product, quantity: qty };
        }
      }
    }

    // ---- Priority 3: Post passive buy limit for a needed ingredient ----
    // Shuffle so we don't always post for the same product
    const neededProducts = Object.keys(needs).sort(() => Math.random() - 0.5);
    for (const product of neededProducts) {
      const needed = needs[product];
      const maxPrice = this._maxBuyPrice(product, true);
      const qty = Math.min(needed, Math.floor(player.cash / maxPrice), 5);
      if (qty >= 1 && maxPrice >= 1) {
        return { side: 'buy', orderType: 'limit', product, quantity: qty, price: maxPrice };
      }
    }

    // ---- Priority 4: Post passive sell limit for excess ----
    const excessProducts = Object.keys(excess).sort(() => Math.random() - 0.5);
    for (const product of excessProducts) {
      const amt = excess[product];
      const minPrice = this._minSellPrice(product, gameProgress);
      const qty = Math.min(amt, 5);
      if (qty >= 1) {
        return { side: 'sell', orderType: 'limit', product, quantity: qty, price: minPrice };
      }
    }

    // ---- Priority 5: Light market-making (40% chance) ----
    if (Math.random() < 0.4) {
      return this._marketMakeAction(player, orderBooks, gameProgress);
    }

    return null;
  }

  /**
   * Generate a single passive market-making order (bid or ask) on a random product.
   */
  _marketMakeAction(player, orderBooks, gameProgress) {
    const products = [...this.config.products].sort(() => Math.random() - 0.5);

    for (const product of products) {
      const scrap = this.config.scrapValues[product];

      // 50/50: try to post a bid or an ask
      if (Math.random() < 0.5) {
        // Passive bid slightly below scrap
        const bidPrice = Math.floor(scrap * 0.9);
        if (player.cash >= bidPrice && bidPrice >= 1) {
          return { side: 'buy', orderType: 'limit', product, quantity: 1, price: bidPrice };
        }
      } else {
        // Passive ask slightly above scrap (only if holding inventory)
        const inv = player.inventory[product] || 0;
        if (inv >= 1) {
          const askPrice = this._minSellPrice(product, gameProgress);
          return { side: 'sell', orderType: 'limit', product, quantity: 1, price: askPrice };
        }
      }
    }

    return null;
  }
}

module.exports = BotStrategy;
