// Game Types

export type GameMode = 'sandwich' | 'randomProduct';

export interface GameConfig {
  gameMode: GameMode;
  gameDuration: number;
  products: string[];
  scrapValues: Record<string, number>;
  setValue: number;
  setRecipe: Record<string, number>;
  maxPlayers: number;
  question?: string; // For Random Product mode
  correctValue?: number; // For Random Product mode - set at end of game
  bots?: {
    maxBots: number;
    tradingInterval: { min: number; max: number };
    marginAboveScrap: number;
  };
}

export interface GameState {
  gameId: string;
  status: 'lobby' | 'running' | 'ended' | 'awaiting_value';
  gameMode: GameMode;
  hostPlayerId: string;
  remainingTime: number;
  playerCount: number;
  maxPlayers: number;
  players: { playerId: string; name: string; isBot: boolean }[];
  question?: string; // For Random Product mode
}

export interface PlayerState {
  playerId: string;
  name: string;
  cash: number;
  inventory: Record<string, number>;
  inventoryValue: number;
  completeSets: number;
  position?: number; // For Random Product mode: net position (positive = long, negative = short)
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
  isBot?: boolean;
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
  completeSets: number;
  setsValue: number;
  scrapValue: number;
  totalScore: number;
  pnl: number;
}
