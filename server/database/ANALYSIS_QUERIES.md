# Database Analysis Queries

This document provides SQL queries for analyzing game data stored in the SQLite database.

## Database Location

- **Database File**: `server/database/trading_game.db`
- **Access**: Use any SQLite client (sqlite3 CLI, DB Browser for SQLite, etc.)

## Quick Access

```bash
# Access the database via CLI
sqlite3 server/database/trading_game.db

# Or copy it for analysis in other tools
cp server/database/trading_game.db ~/my_analysis/game_data.db
```

---

## Table Schema Overview

### Tables
- **games** - Game session metadata
- **players** - Player information and final scores
- **orders** - All orders placed (limit and market)
- **trades** - All executed trades
- **events** - Game events log (joins, starts, ends, etc.)

---

## Useful Analysis Queries

### 1. Game Summary Statistics

```sql
-- Get overview of all games
SELECT
  game_id,
  status,
  datetime(created_at) as created,
  datetime(start_time) as started,
  datetime(end_time) as ended,
  json_array_length(player_ids) as player_count,
  round((julianday(end_time) - julianday(start_time)) * 24 * 60, 2) as duration_minutes
FROM games
ORDER BY created_at DESC;
```

### 2. Player Performance Analysis

```sql
-- Top performers across all games
SELECT
  p.name,
  p.game_id,
  p.final_score,
  json_extract(p.pnl_breakdown, '$.pnl') as profit_loss,
  json_extract(p.pnl_breakdown, '$.completeSets') as sets_formed,
  p.cash as final_cash,
  COUNT(DISTINCT t.trade_id) as trade_count,
  p.is_bot
FROM players p
LEFT JOIN trades t ON (p.player_id = t.buyer_id OR p.player_id = t.seller_id)
WHERE p.final_score IS NOT NULL
GROUP BY p.player_id
ORDER BY p.final_score DESC
LIMIT 20;
```

```sql
-- Player profitability by game
SELECT
  name,
  game_id,
  initial_cash,
  cash as final_cash,
  (cash - initial_cash) as cash_change,
  json_extract(pnl_breakdown, '$.pnl') as total_pnl,
  json_extract(pnl_breakdown, '$.completeSets') as sets,
  json_extract(pnl_breakdown, '$.setsValue') as set_value,
  json_extract(pnl_breakdown, '$.scrapValue') as scrap_value
FROM players
WHERE final_score IS NOT NULL
ORDER BY json_extract(pnl_breakdown, '$.pnl') DESC;
```

### 3. Trading Activity Analysis

```sql
-- Most traded products
SELECT
  product,
  COUNT(*) as trade_count,
  SUM(quantity) as total_quantity,
  ROUND(AVG(price), 2) as avg_price,
  ROUND(MIN(price), 2) as min_price,
  ROUND(MAX(price), 2) as max_price,
  ROUND(SUM(value), 2) as total_value
FROM trades
GROUP BY product
ORDER BY trade_count DESC;
```

```sql
-- Trading volume by game
SELECT
  g.game_id,
  COUNT(t.trade_id) as total_trades,
  SUM(t.quantity) as total_items_traded,
  ROUND(SUM(t.value), 2) as total_trade_value,
  ROUND(AVG(t.value), 2) as avg_trade_value,
  COUNT(DISTINCT t.buyer_id) as unique_buyers,
  COUNT(DISTINCT t.seller_id) as unique_sellers
FROM games g
LEFT JOIN trades t ON g.game_id = t.game_id
GROUP BY g.game_id
ORDER BY total_trades DESC;
```

```sql
-- Price trends over time for a specific product
SELECT
  product,
  datetime(executed_at) as trade_time,
  price,
  quantity,
  value,
  -- Running average price
  ROUND(AVG(price) OVER (
    PARTITION BY product
    ORDER BY executed_at
    ROWS BETWEEN 9 PRECEDING AND CURRENT ROW
  ), 2) as moving_avg_10
FROM trades
WHERE product = 'Alpha'  -- Change to your product
ORDER BY executed_at;
```

### 4. Market Maker Analysis

```sql
-- Most active traders (buy and sell sides)
SELECT
  p.name,
  COUNT(CASE WHEN t.buyer_id = p.player_id THEN 1 END) as buys,
  COUNT(CASE WHEN t.seller_id = p.player_id THEN 1 END) as sells,
  COUNT(t.trade_id) as total_trades,
  ROUND(SUM(CASE WHEN t.buyer_id = p.player_id THEN t.value ELSE 0 END), 2) as bought_value,
  ROUND(SUM(CASE WHEN t.seller_id = p.player_id THEN t.value ELSE 0 END), 2) as sold_value,
  p.is_bot
FROM players p
LEFT JOIN trades t ON (p.player_id = t.buyer_id OR p.player_id = t.seller_id)
GROUP BY p.player_id
ORDER BY total_trades DESC
LIMIT 20;
```

```sql
-- Trading pairs (who traded with whom)
SELECT
  pb.name as buyer,
  ps.name as seller,
  COUNT(*) as trade_count,
  SUM(t.quantity) as total_quantity,
  ROUND(SUM(t.value), 2) as total_value
FROM trades t
JOIN players pb ON t.buyer_id = pb.player_id
JOIN players ps ON t.seller_id = ps.player_id
GROUP BY t.buyer_id, t.seller_id
ORDER BY trade_count DESC
LIMIT 20;
```

### 5. Order Book Analysis

```sql
-- Order fill rates
SELECT
  player_name,
  product,
  side,
  order_type,
  COUNT(*) as total_orders,
  SUM(CASE WHEN status = 'filled' THEN 1 ELSE 0 END) as filled,
  SUM(CASE WHEN status = 'partial' THEN 1 ELSE 0 END) as partial,
  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
  ROUND(100.0 * SUM(CASE WHEN status = 'filled' THEN 1 ELSE 0 END) / COUNT(*), 2) as fill_rate_pct
FROM orders
GROUP BY player_name, product, side, order_type
HAVING COUNT(*) >= 5  -- Only show players with at least 5 orders
ORDER BY fill_rate_pct DESC;
```

```sql
-- Aggressive vs passive trading (market vs limit orders)
SELECT
  p.name,
  COUNT(CASE WHEN o.order_type = 'market' THEN 1 END) as market_orders,
  COUNT(CASE WHEN o.order_type = 'limit' THEN 1 END) as limit_orders,
  ROUND(100.0 * COUNT(CASE WHEN o.order_type = 'market' THEN 1 END) / COUNT(*), 2) as market_pct,
  p.is_bot
FROM orders o
JOIN players p ON o.player_id = p.player_id
GROUP BY o.player_id
HAVING COUNT(*) >= 3
ORDER BY market_pct DESC;
```

### 6. Timing Analysis

```sql
-- Trading activity by time of game (early vs late)
WITH game_duration AS (
  SELECT
    game_id,
    start_time,
    end_time,
    (julianday(end_time) - julianday(start_time)) * 86400 as duration_seconds
  FROM games
  WHERE end_time IS NOT NULL
)
SELECT
  CASE
    WHEN (julianday(t.executed_at) - julianday(gd.start_time)) * 86400 < gd.duration_seconds * 0.33 THEN 'Early'
    WHEN (julianday(t.executed_at) - julianday(gd.start_time)) * 86400 < gd.duration_seconds * 0.67 THEN 'Mid'
    ELSE 'Late'
  END as game_phase,
  COUNT(*) as trade_count,
  ROUND(AVG(t.value), 2) as avg_trade_value,
  ROUND(AVG(t.price), 2) as avg_price
FROM trades t
JOIN game_duration gd ON t.game_id = gd.game_id
GROUP BY game_phase
ORDER BY
  CASE game_phase
    WHEN 'Early' THEN 1
    WHEN 'Mid' THEN 2
    WHEN 'Late' THEN 3
  END;
```

### 7. Bot vs Human Performance

```sql
-- Compare bot vs human performance
SELECT
  CASE WHEN is_bot = 1 THEN 'Bot' ELSE 'Human' END as player_type,
  COUNT(DISTINCT player_id) as player_count,
  ROUND(AVG(final_score), 2) as avg_final_score,
  ROUND(AVG(json_extract(pnl_breakdown, '$.pnl')), 2) as avg_pnl,
  ROUND(AVG(json_extract(pnl_breakdown, '$.completeSets')), 2) as avg_sets_formed,
  ROUND(AVG(json_array_length(trade_history)), 2) as avg_trades_per_player
FROM players
WHERE final_score IS NOT NULL
GROUP BY is_bot;
```

### 8. Set Formation Strategy Analysis

```sql
-- Players who formed the most sets
SELECT
  name,
  game_id,
  json_extract(pnl_breakdown, '$.completeSets') as sets_formed,
  json_extract(pnl_breakdown, '$.setsValue') as value_from_sets,
  json_extract(pnl_breakdown, '$.scrapValue') as value_from_scrap,
  json_extract(pnl_breakdown, '$.pnl') as total_pnl,
  final_score,
  is_bot
FROM players
WHERE json_extract(pnl_breakdown, '$.completeSets') > 0
ORDER BY json_extract(pnl_breakdown, '$.completeSets') DESC;
```

### 9. Market Efficiency Analysis

```sql
-- Spread analysis (difference between buy and sell orders)
WITH order_book AS (
  SELECT
    product,
    MAX(CASE WHEN side = 'buy' THEN price END) as best_bid,
    MIN(CASE WHEN side = 'sell' THEN price END) as best_ask
  FROM orders
  WHERE status IN ('open', 'partial')
  GROUP BY product
)
SELECT
  product,
  best_bid,
  best_ask,
  (best_ask - best_bid) as spread,
  ROUND(100.0 * (best_ask - best_bid) / best_ask, 2) as spread_pct
FROM order_book
WHERE best_bid IS NOT NULL AND best_ask IS NOT NULL;
```

### 10. Export Complete Game Data

```sql
-- Export everything for a specific game
.mode csv
.output game_export.csv

SELECT
  'GAME' as record_type,
  g.game_id,
  g.status,
  g.created_at,
  g.start_time,
  g.end_time,
  NULL as player_name,
  NULL as product,
  NULL as quantity,
  NULL as price
FROM games g
WHERE g.game_id = 'YOUR_GAME_ID_HERE'

UNION ALL

SELECT
  'PLAYER' as record_type,
  p.game_id,
  NULL,
  p.joined_at,
  NULL,
  NULL,
  p.name,
  NULL,
  p.final_score,
  json_extract(p.pnl_breakdown, '$.pnl')
FROM players p
WHERE p.game_id = 'YOUR_GAME_ID_HERE'

UNION ALL

SELECT
  'TRADE' as record_type,
  t.game_id,
  NULL,
  t.executed_at,
  NULL,
  NULL,
  pb.name || ' -> ' || ps.name,
  t.product,
  t.quantity,
  t.price
FROM trades t
JOIN players pb ON t.buyer_id = pb.player_id
JOIN players ps ON t.seller_id = ps.player_id
WHERE t.game_id = 'YOUR_GAME_ID_HERE';

.output stdout
```

---

## Advanced Analytics

### Player Behavior Clustering

```sql
-- Classify players by trading style
SELECT
  p.name,
  COUNT(o.order_id) as total_orders,
  COUNT(CASE WHEN o.order_type = 'market' THEN 1 END) as market_orders,
  COUNT(CASE WHEN o.side = 'buy' THEN 1 END) as buy_orders,
  COUNT(CASE WHEN o.side = 'sell' THEN 1 END) as sell_orders,
  COUNT(DISTINCT t.trade_id) as completed_trades,
  CASE
    WHEN COUNT(CASE WHEN o.order_type = 'market' THEN 1 END) * 1.0 / COUNT(o.order_id) > 0.7 THEN 'Aggressive'
    WHEN COUNT(CASE WHEN o.order_type = 'limit' THEN 1 END) * 1.0 / COUNT(o.order_id) > 0.7 THEN 'Passive'
    ELSE 'Mixed'
  END as trading_style,
  p.is_bot
FROM players p
LEFT JOIN orders o ON p.player_id = o.player_id
LEFT JOIN trades t ON (p.player_id = t.buyer_id OR p.player_id = t.seller_id)
GROUP BY p.player_id
HAVING COUNT(o.order_id) > 0;
```

---

## Quick Stats Commands

```bash
# Quick database overview
sqlite3 server/database/trading_game.db "
SELECT 'Games:' as stat, COUNT(*) as count FROM games
UNION ALL
SELECT 'Players:', COUNT(*) FROM players
UNION ALL
SELECT 'Orders:', COUNT(*) FROM orders
UNION ALL
SELECT 'Trades:', COUNT(*) FROM trades
UNION ALL
SELECT 'Events:', COUNT(*) FROM events;
"

# Export to CSV
sqlite3 -header -csv server/database/trading_game.db "SELECT * FROM trades;" > trades.csv
```

---

## Tips

1. **Performance**: The database has indexes on frequently queried columns (game_id, player_id, product, etc.)
2. **JSON Fields**: Use `json_extract()` to query JSON columns like `pnl_breakdown` and `inventory`
3. **Timestamps**: All timestamps are in ISO 8601 format; use `datetime()` for formatting
4. **Exports**: Use `.mode csv` and `.output filename.csv` in sqlite3 CLI for CSV exports
5. **Visualization**: Export to CSV and use Python/R/Excel for charts and graphs

---

## API Endpoints

You can also access data via API:

- **GET** `/api/database/stats` - Database statistics
- **GET** `/api/game/:gameId/export` - Export all data for a specific game

---

## Backup & Migration

```bash
# Backup the database
cp server/database/trading_game.db backup/trading_game_$(date +%Y%m%d).db

# Export to SQL dump
sqlite3 server/database/trading_game.db .dump > backup/dump.sql

# Migrate to PostgreSQL (using pgloader)
pgloader server/database/trading_game.db postgresql://user:pass@host/dbname
```

---

**Happy Analyzing! 📊**
