import React from 'react';
import { SocketProvider, useSocket } from './context/SocketContext';
import Lobby from './components/Lobby';
import TradingGame from './components/TradingGame';
import GameEnd from './components/GameEnd';
import './App.css';

const AppContent: React.FC = () => {
  const { connected, gameState, playerState } = useSocket();

  // Not connected
  if (!connected) {
    return (
      <div className="loading-screen">
        <div className="loading-content">
          <div className="spinner"></div>
          <h2>Connecting to server...</h2>
          <p>Make sure the server is running on port 3001</p>
        </div>
      </div>
    );
  }

  // Game ended
  if (gameState?.status === 'ended' && playerState) {
    return <GameEnd />;
  }

  // Game running
  if (gameState?.status === 'running' && playerState) {
    return <TradingGame />;
  }

  // Lobby (no game, waiting to join, or waiting to start)
  return <Lobby />;
};

const App: React.FC = () => {
  return (
    <SocketProvider>
      <AppContent />
    </SocketProvider>
  );
};

export default App;
