import React from 'react';
import { useSocket } from '../context/SocketContext';
import './Leaderboard.css';

const Leaderboard: React.FC = () => {
  const { leaderboard, playerState, gameState } = useSocket();

  const isGameEnded = gameState?.status === 'ended';

  return (
    <div className="leaderboard">
      <h3>🏆 {isGameEnded ? 'Final Results' : 'Live Standings'}</h3>

      <div className="leaderboard-list">
        {(leaderboard || []).map((entry, index) => (
          <div
            key={entry.playerId}
            className={`leaderboard-item ${entry.playerId === playerState?.playerId ? 'you' : ''} ${index === 0 ? 'leader' : ''}`}
          >
            <div className="rank">
              {index === 0 ? '👑' : `#${index + 1}`}
            </div>
            <div className="player-name">
              {entry.name}
              {entry.playerId === playerState?.playerId && ' (You)'}
            </div>
            <div className="player-stats">
              {isGameEnded ? (
                <>
                  <div className="stat">
                    <span className="stat-label">Score</span>
                    <span className="stat-value">${(entry.totalScore || 0).toFixed(2)}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">PnL</span>
                    <span className={`stat-value ${(entry.pnl || 0) >= 0 ? 'positive' : 'negative'}`}>
                      {(entry.pnl || 0) >= 0 ? '+' : ''}${(entry.pnl || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Sets</span>
                    <span className="stat-value">🥪 {entry.completeSets}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="stat">
                    <span className="stat-label">Est. Value</span>
                    <span className="stat-value">${(entry.estimatedValue || 0).toFixed(2)}</span>
                  </div>
                  <div className="stat">
                    <span className="stat-label">Sets</span>
                    <span className="stat-value">🥪 {entry.completeSets}</span>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}

        {(!leaderboard || leaderboard.length === 0) && (
          <div className="no-data">No players yet</div>
        )}
      </div>
    </div>
  );
};

export default Leaderboard;
