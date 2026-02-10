import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameConfig, GameState, PlayerState, OrderBookDepth, LeaderboardEntry, Trade, PnLBreakdown } from '../types';

interface SocketContextType {
  socket: Socket | null;
  connected: boolean;
  config: GameConfig | null;
  gameState: GameState | null;
  playerState: PlayerState | null;
  orderBooks: Record<string, OrderBookDepth>;
  leaderboard: LeaderboardEntry[];
  recentTrades: Trade[];
  remainingTime: number;
  finalScore: PnLBreakdown | null;

  // Actions
  createGame: () => Promise<any>;
  joinGame: (name: string) => Promise<any>;
  startGame: () => Promise<any>;
  placeOrder: (product: string, side: 'buy' | 'sell', orderType: 'limit' | 'market', quantity: number, price?: number) => Promise<any>;
  cancelOrder: (orderId: string) => Promise<any>;
  resetGame: () => Promise<any>;
}

const SocketContext = createContext<SocketContextType | null>(null);

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

interface SocketProviderProps {
  children: ReactNode;
}

export const SocketProvider: React.FC<SocketProviderProps> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState<GameConfig | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [playerState, setPlayerState] = useState<PlayerState | null>(null);
  const [orderBooks, setOrderBooks] = useState<Record<string, OrderBookDepth>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [recentTrades, setRecentTrades] = useState<Trade[]>([]);
  const [remainingTime, setRemainingTime] = useState(0);
  const [finalScore, setFinalScore] = useState<PnLBreakdown | null>(null);

  useEffect(() => {
    // Connect to server - use current host for LAN play
    const serverUrl = process.env.REACT_APP_SERVER_URL || `http://${window.location.hostname}:3001`;
    const newSocket = io(serverUrl);

    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('Disconnected from server');
      setConnected(false);
    });

    newSocket.on('config', (data: GameConfig) => {
      setConfig(data);
    });

    newSocket.on('gameState', (data: GameState | null) => {
      setGameState(data);
      if (data?.remainingTime) {
        setRemainingTime(Math.round(data.remainingTime));
      }
      // If game state is null (reset), clear player state
      if (!data) {
        setPlayerState(null);
        setOrderBooks({});
        setLeaderboard([]);
        setRecentTrades([]);
        setFinalScore(null);
        setRemainingTime(0);
      }
    });

    newSocket.on('playerState', (data: PlayerState) => {
      setPlayerState(data);
    });

    newSocket.on('orderBooks', (data: Record<string, OrderBookDepth>) => {
      setOrderBooks(data);
    });

    newSocket.on('leaderboard', (data: LeaderboardEntry[]) => {
      setLeaderboard(data);
    });

    newSocket.on('timer', (data: { remainingTime: number }) => {
      setRemainingTime(Math.round(data.remainingTime));
    });

    newSocket.on('trades', (data: Trade[]) => {
      setRecentTrades(prev => [...data, ...prev].slice(0, 50));
    });

    newSocket.on('gameStarted', (data: { gameState: GameState; orderBooks: Record<string, OrderBookDepth> }) => {
      setGameState(data.gameState);
      setOrderBooks(data.orderBooks);
      setFinalScore(null);
      setRecentTrades([]);
    });

    newSocket.on('gameEnded', (data: { leaderboard: LeaderboardEntry[]; gameState: GameState }) => {
      setGameState(data.gameState);
      setLeaderboard(data.leaderboard);
    });

    newSocket.on('finalScore', (data: PnLBreakdown) => {
      setFinalScore(data);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  const createGame = useCallback(() => {
    return new Promise((resolve) => {
      socket?.emit('createGame', resolve);
    });
  }, [socket]);

  const joinGame = useCallback((name: string) => {
    return new Promise((resolve) => {
      socket?.emit('joinGame', { playerName: name }, resolve);
    });
  }, [socket]);

  const startGame = useCallback(() => {
    return new Promise((resolve) => {
      socket?.emit('startGame', resolve);
    });
  }, [socket]);

  const placeOrder = useCallback((
    product: string,
    side: 'buy' | 'sell',
    orderType: 'limit' | 'market',
    quantity: number,
    price?: number
  ) => {
    return new Promise((resolve) => {
      socket?.emit('placeOrder', { product, side, orderType, quantity, price }, resolve);
    });
  }, [socket]);

  const cancelOrder = useCallback((orderId: string) => {
    return new Promise((resolve) => {
      socket?.emit('cancelOrder', { orderId }, resolve);
    });
  }, [socket]);

  const resetGame = useCallback(() => {
    return new Promise((resolve) => {
      socket?.emit('resetGame', resolve);
    });
  }, [socket]);

  const value: SocketContextType = {
    socket,
    connected,
    config,
    gameState,
    playerState,
    orderBooks,
    leaderboard,
    recentTrades,
    remainingTime,
    finalScore,
    createGame,
    joinGame,
    startGame,
    placeOrder,
    cancelOrder,
    resetGame,
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};
