/**
 * Database Analysis Queries
 *
 * Useful SQL queries for analyzing trading game data
 * Run from command line or import into your analysis scripts
 *
 * Usage:
 *   node server/database/analysis-queries.js [query-name] [gameId]
 */

const Database = require('better-sqlite3');
const path = require('path');

class GameAnalytics {
  constructor(dbPath = null) {
    this.dbPath = dbPath || path.join(__dirname, 'trading_game.db');
    this.db = new Database(this.dbPath, { readonly: true });
  }

  // ==================== GAME QUERIES ====================

  /**
   * Get all games with summary statistics
   */
  getAllGames() {
    return this.db.prepare(`
      SELECT
        g.game_id,
        g.status,
        g.start_time,
        g.end_time,
        COUNT(DISTINCT p.player_id) as player_count,
        COUNT(DISTINCT t.trade_id) as trade_count,
        ROUND(AVG(p.final_score), 2) as avg_final_score,
        MAX(p.final_score) as highest_score
      FROM games g
      LEFT JOIN players p ON g.game_id = p.game_id
      LEFT JOIN trades t ON g.game_id = t.game_id
      GROUP BY g.game_id
      ORDER BY g.created_at DESC
    `).all();
  }

  /**
   * Get detailed game summary
   */
  getGameSummary(gameId) {
    const game = this.db.prepare('SELECT * FROM games WHERE game_id = ?').get(gameId);
    const players = this.db.prepare(`
      SELECT
        name,
        cash,
        sets_formed,
        final_score,
        pnl_breakdown,
        is_bot
      FROM players
      WHERE game_id = ?
      ORDER BY final_score DESC NULLS LAST
    `).all(gameId);

    const trades = this.db.prepare(`
      SELECT COUNT(*) as count, SUM(value) as total_value
      FROM trades
      WHERE game_id = ?
    `).get(gameId);

    return { game, players, trades };
  }

  // ==================== PLAYER ANALYSIS ====================

  /**
   * Get player performance across all games
   */
  getPlayerStats(playerName) {
    return this.db.prepare(`
      SELECT
        name,
        COUNT(DISTINCT game_id) as games_played,
        AVG(final_score) as avg_score,
        MAX(final_score) as best_score,
        MIN(final_score) as worst_score,
        SUM(sets_formed) as total_sets_formed,
        AVG(sets_formed) as avg_sets_per_game
      FROM players
      WHERE name LIKE ?
      GROUP BY name
    `).get(`%${playerName}%`);
  }

  /**
   * Get top performers across all games
   */
  getTopPlayers(limit = 10) {
    return this.db.prepare(`
      SELECT
        name,
        COUNT(*) as games_played,
        ROUND(AVG(final_score), 2) as avg_score,
        MAX(final_score) as best_score,
        SUM(sets_formed) as total_sets
      FROM players
      WHERE final_score IS NOT NULL
      GROUP BY name
      ORDER BY avg_score DESC
      LIMIT ?
    `).all(limit);
  }

  // ==================== TRADING ANALYSIS ====================

  /**
   * Get trading volume by product
   */
  getTradingVolumeByProduct(gameId = null) {
    const query = gameId
      ? `SELECT
          product,
          COUNT(*) as trade_count,
          SUM(quantity) as total_quantity,
          ROUND(AVG(price), 2) as avg_price,
          ROUND(MIN(price), 2) as min_price,
          ROUND(MAX(price), 2) as max_price,
          ROUND(SUM(value), 2) as total_value
        FROM trades
        WHERE game_id = ?
        GROUP BY product
        ORDER BY total_value DESC`
      : `SELECT
          product,
          COUNT(*) as trade_count,
          SUM(quantity) as total_quantity,
          ROUND(AVG(price), 2) as avg_price,
          ROUND(MIN(price), 2) as min_price,
          ROUND(MAX(price), 2) as max_price,
          ROUND(SUM(value), 2) as total_value
        FROM trades
        GROUP BY product
        ORDER BY total_value DESC`;

    return gameId
      ? this.db.prepare(query).all(gameId)
      : this.db.prepare(query).all();
  }

  /**
   * Get price history for a product
   */
  getPriceHistory(product, gameId = null) {
    const query = gameId
      ? `SELECT
          executed_at as timestamp,
          price,
          quantity,
          buyer_id,
          seller_id
        FROM trades
        WHERE product = ? AND game_id = ?
        ORDER BY executed_at ASC`
      : `SELECT
          executed_at as timestamp,
          price,
          quantity,
          buyer_id,
          seller_id,
          game_id
        FROM trades
        WHERE product = ?
        ORDER BY executed_at ASC`;

    return gameId
      ? this.db.prepare(query).all(product, gameId)
      : this.db.prepare(query).all(product);
  }

  /**
   * Get most active traders
   */
  getMostActiveTraders(gameId, limit = 10) {
    return this.db.prepare(`
      SELECT
        p.name,
        COUNT(DISTINCT CASE WHEN t.buyer_id = p.player_id THEN t.trade_id END) as buys,
        COUNT(DISTINCT CASE WHEN t.seller_id = p.player_id THEN t.trade_id END) as sells,
        COUNT(DISTINCT t.trade_id) as total_trades,
        ROUND(SUM(CASE WHEN t.buyer_id = p.player_id THEN t.value ELSE 0 END), 2) as buy_value,
        ROUND(SUM(CASE WHEN t.seller_id = p.player_id THEN t.value ELSE 0 END), 2) as sell_value
      FROM players p
      LEFT JOIN trades t ON (t.buyer_id = p.player_id OR t.seller_id = p.player_id)
        AND t.game_id = p.game_id
      WHERE p.game_id = ?
      GROUP BY p.player_id, p.name
      ORDER BY total_trades DESC
      LIMIT ?
    `).all(gameId, limit);
  }

  // ==================== STRATEGY ANALYSIS ====================

  /**
   * Compare bot vs human performance
   */
  getBotVsHumanStats() {
    return this.db.prepare(`
      SELECT
        CASE WHEN is_bot = 1 THEN 'Bot' ELSE 'Human' END as player_type,
        COUNT(*) as total_players,
        ROUND(AVG(final_score), 2) as avg_score,
        ROUND(AVG(sets_formed), 2) as avg_sets,
        ROUND(AVG(cash), 2) as avg_cash_end
      FROM players
      WHERE final_score IS NOT NULL
      GROUP BY is_bot
    `).all();
  }

  /**
   * Analyze winning strategies
   */
  getWinningStrategies(gameId) {
    return this.db.prepare(`
      SELECT
        p.name,
        p.final_score,
        p.cash as final_cash,
        p.sets_formed,
        p.pnl_breakdown,
        COUNT(DISTINCT t.trade_id) as total_trades,
        COUNT(DISTINCT CASE WHEN t.buyer_id = p.player_id THEN t.trade_id END) as buys,
        COUNT(DISTINCT CASE WHEN t.seller_id = p.player_id THEN t.trade_id END) as sells
      FROM players p
      LEFT JOIN trades t ON (t.buyer_id = p.player_id OR t.seller_id = p.player_id)
        AND t.game_id = p.game_id
      WHERE p.game_id = ?
      GROUP BY p.player_id
      ORDER BY p.final_score DESC
    `).all(gameId);
  }

  // ==================== TIME-BASED ANALYSIS ====================

  /**
   * Get trading activity over time
   */
  getTradingActivityTimeline(gameId) {
    return this.db.prepare(`
      SELECT
        strftime('%Y-%m-%d %H:%M', executed_at) as time_bucket,
        COUNT(*) as trade_count,
        SUM(value) as total_value,
        AVG(price) as avg_price
      FROM trades
      WHERE game_id = ?
      GROUP BY time_bucket
      ORDER BY executed_at ASC
    `).all(gameId);
  }

  // ==================== EXPORT FUNCTIONS ====================

  /**
   * Export game data to CSV-friendly format
   */
  exportGameToCSV(gameId) {
    const trades = this.db.prepare(`
      SELECT
        t.trade_id,
        t.executed_at,
        t.product,
        t.quantity,
        t.price,
        t.value,
        bp.name as buyer_name,
        sp.name as seller_name
      FROM trades t
      JOIN players bp ON t.buyer_id = bp.player_id
      JOIN players sp ON t.seller_id = sp.player_id
      WHERE t.game_id = ?
      ORDER BY t.executed_at ASC
    `).all(gameId);

    return trades;
  }

  /**
   * Generate comprehensive report
   */
  generateReport(gameId) {
    console.log('\n' + '='.repeat(80));
    console.log('  GAME ANALYSIS REPORT');
    console.log('='.repeat(80));

    const summary = this.getGameSummary(gameId);

    console.log('\n📊 GAME OVERVIEW');
    console.log(`Game ID: ${gameId}`);
    console.log(`Status: ${summary.game.status}`);
    console.log(`Duration: ${summary.game.start_time} to ${summary.game.end_time}`);
    console.log(`Total Trades: ${summary.trades.count}`);
    console.log(`Total Trade Value: $${summary.trades.total_value?.toFixed(2) || 0}`);

    console.log('\n🏆 LEADERBOARD');
    summary.players.forEach((p, i) => {
      const pnl = p.pnl_breakdown ? JSON.parse(p.pnl_breakdown) : null;
      console.log(`${i + 1}. ${p.name}${p.is_bot ? ' [BOT]' : ''}`);
      console.log(`   Score: $${p.final_score || 0} | Sets: ${p.sets_formed} | Cash: $${p.cash}`);
      if (pnl) {
        console.log(`   PnL: ${pnl.pnl >= 0 ? '+' : ''}$${pnl.pnl.toFixed(2)}`);
      }
    });

    console.log('\n📈 TRADING VOLUME BY PRODUCT');
    const volumes = this.getTradingVolumeByProduct(gameId);
    volumes.forEach(v => {
      console.log(`${v.product}:`);
      console.log(`  Trades: ${v.trade_count} | Volume: ${v.total_quantity} units`);
      console.log(`  Price: $${v.min_price} - $${v.max_price} (avg: $${v.avg_price})`);
      console.log(`  Total Value: $${v.total_value}`);
    });

    console.log('\n👥 MOST ACTIVE TRADERS');
    const traders = this.getMostActiveTraders(gameId, 5);
    traders.forEach((t, i) => {
      console.log(`${i + 1}. ${t.name}: ${t.total_trades} trades (${t.buys} buys, ${t.sells} sells)`);
    });

    console.log('\n' + '='.repeat(80) + '\n');
  }

  close() {
    this.db.close();
  }
}

// ==================== CLI INTERFACE ====================

if (require.main === module) {
  const analytics = new GameAnalytics();
  const command = process.argv[2];
  const gameId = process.argv[3];

  try {
    switch (command) {
      case 'games':
        console.log('\n📋 ALL GAMES:');
        console.table(analytics.getAllGames());
        break;

      case 'report':
        if (!gameId) {
          console.error('Error: gameId required for report');
          console.log('Usage: node analysis-queries.js report <gameId>');
          process.exit(1);
        }
        analytics.generateReport(gameId);
        break;

      case 'summary':
        if (!gameId) {
          console.error('Error: gameId required for summary');
          process.exit(1);
        }
        console.log('\n📊 GAME SUMMARY:');
        console.log(JSON.stringify(analytics.getGameSummary(gameId), null, 2));
        break;

      case 'top-players':
        console.log('\n🏆 TOP PLAYERS:');
        console.table(analytics.getTopPlayers());
        break;

      case 'volume':
        console.log('\n📈 TRADING VOLUME BY PRODUCT:');
        console.table(analytics.getTradingVolumeByProduct(gameId));
        break;

      case 'bot-stats':
        console.log('\n🤖 BOT VS HUMAN PERFORMANCE:');
        console.table(analytics.getBotVsHumanStats());
        break;

      default:
        console.log(`
Database Analysis Tool

Usage:
  node analysis-queries.js <command> [gameId]

Commands:
  games           - List all games with statistics
  report <id>     - Generate comprehensive report for a game
  summary <id>    - Get detailed game summary (JSON)
  top-players     - Show top performers across all games
  volume [id]     - Show trading volume by product (all games or specific game)
  bot-stats       - Compare bot vs human performance

Examples:
  node analysis-queries.js games
  node analysis-queries.js report abc-123-def
  node analysis-queries.js volume abc-123-def
        `);
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    analytics.close();
  }
}

module.exports = GameAnalytics;
