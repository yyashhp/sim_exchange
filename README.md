# 🥪 Sandwich Trading Exchange

A real-time multiplayer trading game where players trade ingredients to form complete sandwiches and maximize their profit.

## Quick Start

### 1. Start the Server

```bash
cd server
npm install  # First time only
npm start
```

The server will display:
```
========================================
   TRADING EXCHANGE SERVER STARTED
========================================

Local:    http://localhost:3001
Network:  http://192.168.x.x:3001

Share the Network URL with players on the same WiFi!
========================================
```

### 2. Start the Client

In a new terminal:

```bash
cd client
npm install  # First time only
npm start
```

This opens the game at `http://localhost:3000`

### 3. Connect from Other Devices

Players on the same WiFi network can join by visiting the **Network URL** shown by the server (e.g., `http://192.168.1.100:3001`) in their browser.

**Note:** For LAN play, players should connect to `http://<server-ip>:3000` (the React dev server) which proxies to the backend.

## Game Rules

### Objective
Trade ingredients with other players to form complete **sandwiches** and maximize your portfolio value.

### Ingredients & Values
| Ingredient | Scrap Value |
|------------|-------------|
| 🍞 Bread   | $2          |
| 🥬 Veggies | $4          |
| 🧀 Cheese  | $6          |
| 🥩 Meat    | $8          |

### Complete Sandwich
- **Recipe:** 1 Bread + 1 Veggies + 1 Cheese + 1 Meat
- **Value:** $30 (vs $20 scrap value = $10 arbitrage profit!)

### Starting Conditions
- Each player starts with **$100 cash**
- Each player starts with a random inventory worth approximately **$100**
- Game duration: **3 minutes**

### Final Scoring
1. Complete sandwiches are valued at **$30 each**
2. Leftover ingredients are valued at their scrap prices
3. Final Score = Cash + Sandwich Value + Scrap Value

## Trading

### Order Types
- **Limit Order:** Place a bid/ask at a specific price
- **Market Order:** Execute immediately at the best available price

### Order Book
- **Bids:** Buy orders (green) - sorted highest price first
- **Asks:** Sell orders (red) - sorted lowest price first
- Click on a price level to pre-fill the trading form

### Order Matching
- Price-time priority (best price first, then earliest order)
- Partial fills supported
- Self-trade prevention

## Architecture

```
trading-exchange/
├── server/                 # Node.js + Socket.io backend
│   ├── server.js          # Main server & WebSocket handlers
│   ├── config.json        # Game configuration
│   ├── models/            # Data models (Player, Order, Trade, etc.)
│   │   └── index.js
│   └── engine/            # Game logic
│       ├── gameManager.js # Game lifecycle management
│       └── matchingEngine.js # Order matching & execution
│
├── client/                # React frontend
│   └── src/
│       ├── context/       # Socket.io context provider
│       ├── components/    # UI components
│       └── types.ts       # TypeScript types
│
└── README.md
```

## Configuration

Edit `server/config.json` to customize:

```json
{
  "gameDuration": 180,        // Game length in seconds
  "startingCash": 100,        // Initial cash per player
  "maxPlayers": 8,            // Max players per game
  "products": ["bread", "veggies", "cheese", "meat"],
  "scrapValues": { "bread": 2, "veggies": 4, "cheese": 6, "meat": 8 },
  "setValue": 30,             // Value of a complete sandwich
  "setRecipe": { "bread": 1, "veggies": 1, "cheese": 1, "meat": 1 },
  "startingInventoryTargetTotalValue": 100,
  "showOrderNames": false     // Toggle anonymous vs named order book
}
```

## Data Storage

Currently, all game data is printed to the server console (for development). The data models are structured for easy database integration.

### Data Events Logged
- `[DATABASE] Game Saved` - Game state changes
- `[DATABASE] Player Saved` - Player state changes
- `[DATABASE] Order Saved` - New/updated orders
- `[DATABASE] Trade Executed` - Completed trades
- `[EVENT]` - Game events (join, start, end, etc.)

### Export API
```
GET /api/game/:gameId/export
```
Returns all game data as JSON for analysis.

## Future Improvements

- [ ] Persistent database (MongoDB/PostgreSQL)
- [ ] Game history and replay
- [ ] Advanced analytics dashboard
- [ ] Multiple concurrent games
- [ ] Spectator mode
- [ ] Mobile-responsive design
- [ ] Sound effects

## License

MIT
