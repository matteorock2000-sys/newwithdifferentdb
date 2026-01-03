import { useRef, useEffect, useState, useCallback } from 'react';
import type { DiceRollingState } from '~/types';
import { useGlobalToast } from '~/utils/toast';
import { logger } from '~/utils/logger';

/** @jsxImportSource react */

interface DiceBoxDirectProps {
  onPlayerRollComplete: (slotIndex: number, result: number, userId: string) => void;
  players: Array<{ slotIndex: number; characterName: string; userId: string; hasRolled: boolean; result?: number }>;
  currentUserId: string;
  diceState: DiceRollingState | null;
  demoRolls?: Record<number, number>; // Optional: demo rolls to display
}

export default function DiceBoxDirect({ 
  onPlayerRollComplete, 
  players, 
  currentUserId, 
  diceState,
  demoRolls
}: DiceBoxDirectProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const { showToast } = useGlobalToast();
  const [currentRollResult, setCurrentRollResult] = useState<number | null>(null);

  // Calculate if it's the current player's turn
  const isCurrentPlayer = diceState && diceState.players[diceState.currentPlayerIndex]?.userId === currentUserId;

  // Handle messages from the iframe
  useEffect(() => {
    console.log('[DiceBoxDirect] mounting - iframeRef.current (initial):', iframeRef.current);
    function handleIframeMessage(event: MessageEvent) {
      console.log('[DiceBoxDirect] Received iframe message:', event.data, 'event.source:', event.source, 'currentWindow:', iframeRef.current?.contentWindow);
      
      // Only accept messages from our iframe
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        console.log('[DiceBoxDirect] Message source does not match our iframe, ignoring');
        return;
      }

      const data = event.data;
      logger.debug('[DiceBoxDirect] Received message from iframe:', { data });
      
      switch (data?.type) {
        case 'DICE_BOX_READY':
          console.log('[DiceBoxDirect] Dice box ready received');
          logger.debug('[DiceBoxDirect] Dice box ready in iframe');
          setIsReady(true);
          break;
          
        case 'ROLL_STARTED':
          console.log('[DiceBoxDirect] Roll started received');
          logger.debug('[DiceBoxDirect] Roll started in iframe');
          setIsRolling(true);
          break;
          
        case 'ROLL_RESULT': {
          console.log('[DiceBoxDirect] Roll result received:', data);
          logger.debug('[DiceBoxDirect] Roll complete in iframe:', { result: data.notation.resultTotal });
          setIsRolling(false);
          setCurrentRollResult(data.notation.resultTotal);
          
          // Debug the full notation object
          console.log('[DiceBoxDirect] Full notation object:', {
            resultTotal: data.notation.resultTotal,
            result: data.notation.result,
            constant: data.notation.constant,
            set: data.notation.set
          });
          
          // Validate the result before proceeding
          if (data.notation.resultTotal === undefined || isNaN(data.notation.resultTotal) || data.notation.resultTotal < 1) {
            console.error('[DiceBoxDirect] Invalid dice result received:', data.notation.resultTotal);
            showToast('Invalid dice result. Please try rolling again.', 'error');
            return;
          }
          
          // Get current player and complete the roll
          const currentPlayer = diceState?.players[diceState.currentPlayerIndex];
          if (currentPlayer) {
            console.log('[DiceBoxDirect] Completing roll for player:', currentPlayer.characterName, 'result:', data.notation.resultTotal);
            onPlayerRollComplete(currentPlayer.slotIndex, data.notation.resultTotal, currentPlayer.userId);
          } else {
            console.warn('[DiceBoxDirect] No current player found to complete roll');
          }
          break;
        }
          
        case 'DICE_OFF_TABLE':
          console.log('[DiceBoxDirect] Dice off table received');
          logger.debug('[DiceBoxDirect] Dice fell off table in iframe');
          setIsRolling(false);
          showToast('Oops, your dice fell off the table. Please roll again.', 'error');
          break;
      }
    }

    window.addEventListener('message', handleIframeMessage);
    return () => window.removeEventListener('message', handleIframeMessage);
  }, [diceState, onPlayerRollComplete, showToast]);

  // Dev fallback: if iframe loads but doesn't post ready message, allow quick inspection in dev mode
  const handleIframeLoad = () => {
    console.log('[DiceBoxDirect] iframe onLoad fired', { iframe: iframeRef.current });
    if (process.env.NODE_ENV === 'development') {
      // Small delay to allow iframe scripts to initialize
      setTimeout(() => {
        if (!isReady) {
          console.log('[DiceBoxDirect] Dev fallback: setting isReady = true');
          setIsReady(true);
        }
      }, 600);
    }
  };

  // Handle dice state changes
  useEffect(() => {
    if (diceState?.status === 'rolling' && isReady) {
      const currentPlayer = diceState.players[diceState.currentPlayerIndex];
      if (currentPlayer) {
        logger.debug('[DiceBoxDirect] Dice state changed to rolling for player:', { playerName: currentPlayer.characterName });
      }
    }
  }, [diceState, isReady]);

  // Function to send roll command to iframe
  const sendRollCommand = useCallback((diceNotation: string) => {
    console.log('[DiceBoxDirect] sendRollCommand called with:', { diceNotation, isReady, iframeExists: !!iframeRef.current });
    
    if (iframeRef.current?.contentWindow && isReady) {
      console.log('[DiceBoxDirect] Sending roll command to iframe...');
      iframeRef.current.contentWindow.postMessage({ type: 'ROLL', diceNotation }, '*');
      logger.debug('[DiceBoxDirect] Sent roll command to iframe:', { diceNotation });
    } else {
      console.warn('[DiceBoxDirect] Cannot roll dice - iframe not ready or missing');
      logger.warn('[DiceBoxDirect] Attempted to roll dice before iframe was ready');
      showToast('3D dice not ready yet. Please wait a moment.', 'error');
    }
  }, [isReady, showToast]);

  // Replace click and keydown handlers to use sendRollCommand
  const handleClick = (e: React.MouseEvent) => {
    console.log('[DiceBoxDirect] handleClick called with:', { isRolling, isReady, isCurrentPlayer, target: e.currentTarget });
    
    e.preventDefault();
    e.stopPropagation();
    
    // Check if it's the current player's turn
    if (!isCurrentPlayer) {
      const currentPlayerName = diceState?.players[diceState.currentPlayerIndex]?.characterName || 'the current player';
      showToast(`It's not your turn yet. Please wait for ${currentPlayerName} to roll.`, 'info');
      return;
    }
    
    // Allow clicking the whole canvas when ready
    if (!isReady) {
      console.log('[DiceBoxDirect] Click handler: Not ready yet');
      logger.warn('[DiceBoxDirect] Attempted to roll dice before iframe was ready');
      showToast('3D dice not ready yet. Please wait a moment.', 'error');
      return;
    }
    
    if (!isRolling) {
      console.log('[DiceBoxDirect] Click handler: Rolling dice');
      sendRollCommand('1d20'); // Default roll notation
    } else {
      console.log('[DiceBoxDirect] Click handler: Already rolling');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    console.log('[DiceBoxDirect] handleKeyDown called with key:', e.key);
    
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      
      // Check if it's the current player's turn
      if (!isCurrentPlayer) {
        const currentPlayerName = diceState?.players[diceState.currentPlayerIndex]?.characterName || 'the current player';
        showToast(`It's not your turn yet. Please wait for ${currentPlayerName} to roll.`, 'info');
        return;
      }
      
      if (!isReady) {
        console.log('[DiceBoxDirect] Key handler: Not ready yet');
        logger.warn('[DiceBoxDirect] Attempted to roll dice before iframe was ready');
        showToast('3D dice not ready yet. Please wait a moment.', 'error');
        return;
      }
      
      if (!isRolling) {
        console.log('[DiceBoxDirect] Key handler: Rolling dice');
        sendRollCommand('1d20'); // Default roll notation
      } else {
        console.log('[DiceBoxDirect] Key handler: Already rolling');
      }
    }
  };

  return (
    <div className="dice-box-direct">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {players.map((player) => {
          const isCurrentPlayer = diceState && diceState.players[diceState.currentPlayerIndex]?.slotIndex === player.slotIndex;
          const isCurrentUser = player.userId === currentUserId;
          
          // Use demo roll if available, otherwise use the server result
          const demoResult = demoRolls?.[player.slotIndex];
          const serverResult = diceState?.rolls[player.slotIndex];
          const hasRolled = player.hasRolled || demoResult !== undefined || serverResult !== undefined;
          const result = demoResult !== undefined ? demoResult : serverResult !== undefined ? serverResult : player.result;

          return (
            <div 
              key={player.slotIndex}
              className={`p-4 rounded-lg border-2 transition-all duration-300 ${
                isCurrentPlayer 
                  ? 'border-yellow-400 bg-yellow-900/30 animate-pulse' 
                  : hasRolled 
                    ? 'border-green-400 bg-green-900/20' 
                    : 'border-gray-600 bg-gray-900/50'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-300">
                      Slot {player.slotIndex + 1}
                    </span>
                    {isCurrentUser && (
                      <span className="px-2 py-1 bg-blue-600 text-white text-xs rounded">
                        You
                      </span>
                    )}
                  </div>
                  <div className="text-lg font-bold text-white">
                    {player.characterName}
                  </div>
                </div>
                {isCurrentPlayer && (
                  <div className="text-yellow-300 font-semibold font-bold text-lg">
                    🎲 Your Turn!
                  </div>
                )}
              </div>

              <div className="text-center">
                {hasRolled ? (
                  <div className="text-4xl font-bold text-yellow-400">
                    {result}
                  </div>
                ) : (
                  <div className="text-gray-400 text-lg">
                    Waiting...
                  </div>
                )}
              </div>

              {isCurrentPlayer && !hasRolled && (
                <div className="mt-3 text-center text-yellow-400">
                  Click the dice below to roll!
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div 
        className={`w-full h-80 rounded-xl relative overflow-hidden border-4 transition-all duration-500`}
        style={{ 
          minHeight: '320px', 
          height: '45vh', 
          zIndex: 9998,
          position: 'relative',
          borderColor: !isReady ? '#ef4444' : isCurrentPlayer ? '#3b82f6' : '#6b7280', // Red if not ready, blue if current player, gray if not current player
          display: 'block',
          visibility: 'visible',
          background: 'transparent',
          borderRadius: '12px',
          cursor: !isReady ? 'default' : isCurrentPlayer ? 'pointer' : 'not-allowed',
          opacity: isCurrentPlayer ? 1 : 0.5 // Full opacity for current player, 50% for others
        }}
        title={isReady ? (isCurrentPlayer ? 'Your Turn - Click to roll!' : 'Waiting for your turn...') : '3D Dice Box Loading...'}
      >
        <iframe
          ref={iframeRef}
          src="/dice-roller-bridge.html"
          title="3D Dice Roller"
          onLoad={handleIframeLoad}
          className="w-full h-full border-none"
          sandbox="allow-scripts allow-same-origin"
        ></iframe>

        {/* Clickable Overlay for Dice Rolling */}
        {isReady && !isRolling && isCurrentPlayer && (
          <div
            className="absolute inset-0 bg-transparent"
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
            role="button"
            aria-label="3D Dice Roller - Click or press Enter/Space to roll dice"
            style={{ cursor: 'pointer', zIndex: 10000 }} // Ensure it's above the iframe
            title="Click or press Enter/Space to roll dice"
          />
        )}

        {/* Waiting for Turn Message */}
        {isReady && !isCurrentPlayer && (
          <div className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center">
            <div className="text-center text-white animate-pulse">
              <div className="text-2xl font-bold text-yellow-400 mb-2">
                Waiting for {diceState?.players[diceState.currentPlayerIndex]?.characterName}'s turn...
              </div>
              <div className="text-lg">Please wait your turn to roll the dice</div>
            </div>
          </div>
        )}

        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="text-center text-white">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400 mb-2"></div>
              <p>Loading 3D dice...</p>
              <p className="text-xs text-gray-300 mt-2">If this takes too long, try refreshing the page</p>
            </div>
          </div>
        )}
        
        {isRolling && currentRollResult !== null && (
          <div className="absolute top-4 right-4 bg-black bg-opacity-70 text-yellow-400 font-bold py-2 px-4 rounded-lg">
            Rolling: {currentRollResult}
          </div>
        )}

        {/* Debug info for development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="absolute bottom-2 left-2 bg-black bg-opacity-50 text-white text-xs px-2 py-1 rounded">
            Debug: isReady={isReady ? 'yes' : 'no'} | rolling={isRolling ? 'yes' : 'no'} | players={players.length}
          </div>
        )}
      </div>
    </div>
  );
}
