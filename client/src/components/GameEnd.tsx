import React, { useState } from 'react';
import { useSocket } from '../context/SocketContext';
import Leaderboard from './Leaderboard';
import './GameEnd.css';

const GameEnd: React.FC = () => {
  const { finalScore, playerState, leaderboard, config, gameState, resetGame, submitCorrectValue } = useSocket();
  const [correctValue, setCorrectValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const myRank = leaderboard.findIndex(e => e.playerId === playerState?.playerId) + 1;
  const isHost = playerState && gameState && gameState.hostPlayerId === playerState.playerId;

  const handleNewGame = async () => {
    await resetGame();
  };

  const handleSubmitCorrectValue = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(correctValue);
    if (isNaN(value)) {
      setError('Please enter a valid number');
      return;
    }
    setSubmitting(true);
    setError('');
    const result: any = await submitCorrectValue(value);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error || 'Failed to submit correct value');
    }
  };

  // Show correct value input form for Random Product mode when awaiting value
  if (gameState?.status === 'awaiting_value') {
    return (
      <div className="game-end">
        <div className="game-end-header">
          <h1>Time's Up!</h1>
          <div className="info-banner">Trading has ended</div>
        </div>

        <div className="game-end-content">
          {gameState.question && (
            <div className="question-display-large">
              <strong>Question:</strong> {gameState.question}
            </div>
          )}

          {isHost ? (
            <div className="correct-value-form">
              <h2>Enter the Correct Value</h2>
              <p className="form-description">Enter the correct answer to calculate final PnL for all players</p>
              <form onSubmit={handleSubmitCorrectValue}>
                <input
                  type="number"
                  step="any"
                  placeholder="Enter correct value"
                  value={correctValue}
                  onChange={(e) => setCorrectValue(e.target.value)}
                  disabled={submitting}
                  required
                />
                <button type="submit" className="btn btn-primary btn-large" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Correct Value'}
                </button>
                {error && <p className="error">{error}</p>}
              </form>
            </div>
          ) : (
            <div className="waiting-for-host">
              <p>Waiting for host to enter the correct value...</p>
              <div className="spinner"></div>
            </div>
          )}

          <div className="final-leaderboard">
            <h3>Current Positions</h3>
            <Leaderboard />
          </div>
        </div>
      </div>
    );
  }

  // Regular game end screen
  return (
    <div className="game-end">
      <div className="game-end-header">
        <h1>Game Over!</h1>
        {myRank === 1 && <div className="winner-banner">🏆 1st Place!</div>}
        {myRank === 2 && <div className="runner-up-banner">🥈 2nd Place!</div>}
        {myRank === 3 && <div className="runner-up-banner">🥉 3rd Place!</div>}
        {myRank > 3 && <div className="rank-banner">You finished #{myRank}</div>}
      </div>

      <div className="game-end-content">
        <div className="score-breakdown">
          <h2>Your Final Score</h2>

          {finalScore && (
            <div className="breakdown-card">
              {config?.gameMode === 'randomProduct' ? (
                // Random Product mode score breakdown
                <>
                  <div className="breakdown-row">
                    <span className="label">Position</span>
                    <span className="value">{(finalScore as any).position || 0}</span>
                  </div>

                  <div className="breakdown-row">
                    <span className="label">Correct Value</span>
                    <span className="value">${((finalScore as any).correctValue || 0).toFixed(2)}</span>
                  </div>

                  <div className="breakdown-row highlight">
                    <span className="label">Position Value</span>
                    <span className="value positive">${((finalScore as any).positionValue || 0).toFixed(2)}</span>
                  </div>

                  <div className="breakdown-row">
                    <span className="label">Cash</span>
                    <span className="value">${finalScore.cash.toFixed(2)}</span>
                  </div>

                  <div className="breakdown-row total">
                    <span className="label">Total Score</span>
                    <span className="value">${finalScore.totalScore.toFixed(2)}</span>
                  </div>

                  <div className="pnl-display">
                    <span className="pnl-label">Profit/Loss</span>
                    <span className={`pnl-value ${finalScore.pnl >= 0 ? 'positive' : 'negative'}`}>
                      {finalScore.pnl >= 0 ? '+' : ''}${finalScore.pnl.toFixed(2)}
                    </span>
                  </div>
                </>
              ) : (
                // Sandwich Exchange mode score breakdown
                <>
                  <div className="breakdown-row">
                    <span className="label">Cash</span>
                    <span className="value">${finalScore.cash}</span>
                  </div>

                  <div className="breakdown-row highlight">
                    <span className="label">Complete Sandwiches ({(finalScore as any).completeSets} x ${config?.setValue})</span>
                    <span className="value positive">${(finalScore as any).setsValue}</span>
                  </div>

                  <div className="breakdown-row">
                    <span className="label">Leftover Ingredients (scrap)</span>
                    <span className="value">${(finalScore as any).scrapValue}</span>
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
                </>
              )}
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
