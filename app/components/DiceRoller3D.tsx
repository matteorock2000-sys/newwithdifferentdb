import { useRef, useEffect, useState, useCallback } from 'react';
import type { DiceRollingState } from '~/types';
import { useGlobalToast } from '~/utils/toast';
import { logger } from '~/utils/logger';

/** @jsxImportSource react */

interface DiceRoller3DProps {
  onPlayerRollComplete: (slotIndex: number, result: number, userId: string) => void;
  players: Array<{ slotIndex: number; characterName: string; userId: string; hasRolled: boolean; result?: number }>;
  currentUserId: string;
  diceState: DiceRollingState | null;
  showRollButton?: boolean;
}

export default function DiceRoller3D({ 
  onPlayerRollComplete, 
  players, 
  currentUserId, 
  diceState,
  showRollButton = false
}: DiceRoller3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const diceIframeRef = useRef<HTMLIFrameElement>(null);
  const [isRolling, setIsRolling] = useState(false);
  const { showToast } = useGlobalToast();
  const iframeReadyRef = useRef(false);
  
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const { type, result } = event.data;
      
      if (type === 'DICE_ROLL_RESULT') {
        setIsRolling(false);
        const currentPlayer = diceState?.players[diceState.currentPlayerIndex];
        if (currentPlayer && result !== undefined) {
          onPlayerRollComplete(currentPlayer.slotIndex, result, currentPlayer.userId);
        }
      } else if (type === 'roll_started') {
        setIsRolling(true);
      } else if (type === 'iframe_ready') {
        iframeReadyRef.current = true;
        showToast('3D dice rolling is ready! Click or swipe to roll.', 'success');
        if (diceIframeRef.current?.contentWindow) {
          diceIframeRef.current.contentWindow.postMessage({
            type: 'set_viewer_user_id',
            userId: currentUserId,
          }, '*');
        }
      } else if (type === 'iframe_init_failed') {
        showToast(`3D dice rolling failed: ${event.data.error}. Using fallback method.`, 'error');
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [onPlayerRollComplete, currentUserId, diceState, showToast]);

  useEffect(() => {
    if (diceIframeRef.current?.contentWindow && diceState?.status === 'rolling') {
      const currentPlayer = diceState.players[diceState.currentPlayerIndex];
      if (currentPlayer) {
        diceIframeRef.current.contentWindow.postMessage({
          type: 'set_roll_context',
          userId: currentPlayer.userId,
          slotIndex: currentPlayer.slotIndex,
        }, '*');
      }
    }
  }, [diceState]);
  
  return (
    <div className="dice-roller-3d">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {players.map((player) => {
          const isCurrentPlayer = diceState && diceState.players[diceState.currentPlayerIndex]?.slotIndex === player.slotIndex;
          const isCurrentUser = player.userId === currentUserId;
          const hasRolled = player.hasRolled;
          const result = player.result;
          
          return (
            <div 
              key={player.slotIndex}
              className={`p-4 rounded-lg border-2 transition-all duration-300 ${
                isCurrentPlayer 
                  ? 'border-blue-400 bg-blue-900/30 animate-pulse' 
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
                  <div className="text-blue-300 font-semibold">
                    Your Turn!
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
        ref={containerRef} 
        className={`w-full h-80 bg-blue-500 rounded-xl relative overflow-hidden border-4 transition-all duration-500 border-blue-500`}
        style={{ minHeight: '320px', height: '45vh', zIndex: 9998 }}
        onClick={() => logger.debug('[DiceRoller3D] Container clicked!')}
      >
        <iframe
          ref={diceIframeRef}
          src="/dice-roller-bridge.html"
          title="3D Dice Roller"
          className="w-full h-full border-4 border-red-500"
          style={{ zIndex: 9999, pointerEvents: 'auto' }}
        />
      </div>
    </div>
  );
}