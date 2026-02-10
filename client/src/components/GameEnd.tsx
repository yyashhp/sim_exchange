import React from 'react';
import { useSocket } from '../context/SocketContext';
import Leaderboard from './Leaderboard';
import './GameEnd.css';

const GameEnd: React.FC = () => {
  const { finalScore, playerState, leaderboard, config, resetGame } = useSocket();

  const myRank = leaderboard.findIndex(e => e.playerId === playerState?.playerId) + 1;

  const handleNewGame = async () => {
    await resetGame();
  };

  return (
    <div className="game-end">
      <div className="game-end-header">
        <h1>Game Over!</h1>
        {myRank === 1 && <div className="winner-banner">1st Place!</div>}
        {myRank === 2 && <div className="runner-up-banner">2nd Place!</div>}
        {myRank === 3 && <div className="runner-up-banner">3rd Place!</div>}
        {myRank > 3 && <div className="rank-banner">You finished #{myRank}</div>}
      </div>

      <div className="game-end-content">
        <div className="score-breakdown">
          <h2>Your Final Score</h2>

          {finalScore && (
            <div className="breakdown-card">
              <div className="breakdown-row">
                <span className="label">Cash</span>
                <span className="value">${finalScore.cash}</span>
              </div>

              <div className="breakdown-row highlight">
                <span className="label">Complete Sandwiches ({finalScore.completeSets} x ${config?.setValue})</span>
                <span className="value positive">${finalScore.setsValue}</span>
              </div>

              <div className="breakdown-row">
                <span className="label">Leftover Ingredients (scrap)</span>
                <span className="value">${finalScore.scrapValue}</span>
              </div>

              <div className="breakdown-row total">
                <span className="label">Total Score</span>
                <span className="value">${finalScore.totalScore}</span>
              </div>

              <div className="pnl-display">
                <span className="pnl-label">Profit/Loss</span>
                <span className={`pnl-value ${finalScore.pnl >= 0 ? 'positive' : 'negative'}`}>
                  {finalScore.pnl >= 0 ? '+' : ''}${finalScore.pnl}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="final-leaderboard">
          <Leaderboard />
        </div>
      </div>

      <div className="game-end-footer">
        <button className="btn btn-primary btn-large" onClick={handleNewGame}>
          New Game
        </button>
        <p>Start a new game session for all players</p>
      </div>
    </div>
  );
};

export default GameEnd;
