// Game Types

export type GameMode = 'sandwich' | 'randomProduct';

export interface GameConfig {
  gameMode?: GameMode;
  gameDuration: number;
  products: string[];
  scrapValues: Record<string, number>;
  setValue: number;
  setRecipe: Record<string, number>;
  maxPlayers: number;
  question?: string;
}

export interface GameState {
  gameId: string;
  status: 'lobby' | 'running' | 'ended' | 'awaiting_value';
  gameMode?: GameMode;
  hostPlayerId: string;
  remainingTime: number;
  playerCount: number;
  maxPlayers: number;
  players: { playerId: string; name: string }[];
  question?: string;
}

export interface PlayerState {
  playerId: string;
  name: string;
  cash: number;
  inventory: Record<string, number>;
  inventoryValue?: number;
  completeSets?: number;
  position?: number; // For Random Product mode
  openOrders: Order[];
  tradeCount: number;
}

export interface Order {
  orderId: string;
  playerId: string;
  playerName?: string;
  product: string;
  side: 'buy' | 'sell';
  orderType: 'limit' | 'market';
  quantity: number;
  remainingQuantity: number;
  price: number | null;
  status: 'open' | 'partial' | 'filled' | 'cancelled';
  createdAt: string;
}

export interface Trade {
  tradeId: string;
  gameId: string;
  buyOrderId: string;
  sellOrderId: string;
  buyerId: string;
  sellerId: string;
  product: string;
  quantity: number;
  price: number;
  value: number;
  executedAt: string;
}

export interface PriceLevel {
  price: number;
  quantity: number;
  orders: Order[];
}

export interface OrderBookDepth {
  product: string;
  bids: PriceLevel[];
  asks: PriceLevel[];
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
}

export interface LeaderboardEntry {
  playerId: string;
  name: string;
  estimatedValue?: number;
  completeSets?: number;
  totalScore?: number;
  cash?: number;
  setsValue?: number;
  scrapValue?: number;
  pnl?: number;
  rank?: number;
}

export interface PnLBreakdown {
  cash: number;
  completeSets?: number; // Sandwich mode
  setsValue?: number; // Sandwich mode
  scrapValue?: number; // Sandwich mode
  position?: number; // Random Product mode
  positionValue?: number; // Random Product mode
  correctValue?: number; // Random Product mode
  totalScore: number;
  pnl: number;
}
