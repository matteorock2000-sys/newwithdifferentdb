import { useRef, useEffect, useState, useCallback } from 'react';
import type { DiceRollingState } from '~/types';

/** @jsxImportSource react */

interface DiceRoller3DProps {
  onPlayerRollComplete: (slotIndex: number, result: number) => void;
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
  showRollButton = true
}: DiceRoller3DProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const diceBoxRef = useRef<any>(null);
  const [isRolling, setIsRolling] = useState(false);
  const [rollingDice, setRollingDice] = useState<Record<number, number>>({});
  
  // Consolidated handleRollDice
  const handleRollDice = useCallback((slotIndex: number) => {
    setIsRolling(true);
    setRollingDice({}); // Clear previous rolling state

    if (diceBoxRef.current) {
      // Use 3D dice
      diceBoxRef.current.roll()
        .then((results: any) => {
          console.log('3D dice roll initiated:', results);
          // after_roll callback in useEffect will handle onPlayerRollComplete
        })
        .catch((error: any) => {
          console.error('Error during 3D dice roll:', error);
          // Fallback to simulated roll on error
          const result = Math.floor(Math.random() * 20) + 1;
          setTimeout(() => {
            setIsRolling(false);
            onPlayerRollComplete(slotIndex, result);
          }, 1000);
        });
    } else {
      // Fallback to simulated roll if 3D dice not available or failed to load
      console.warn('3D dice library not available, using visual fallback');
      const result = Math.floor(Math.random() * 20) + 1;
      setTimeout(() => {
        setIsRolling(false);
        onPlayerRollComplete(slotIndex, result);
      }, 1000); // Simulate 1 second roll animation
    }
  }, [onPlayerRollComplete]);

  // useEffect for 3D dice library initialization and setup
  useEffect(() => {
    let isMounted = true;
    let diceBoxInstance: any = null; // Declare here to be accessible in cleanup

    const loadScript = (src: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const existingScript = document.querySelector(`script[src="${src}"]`);
        if (existingScript) {
          resolve();
          return;
        }
        
        const script = document.createElement('script');
        script.src = src;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
      });
    };
    
    const createDiceBox = () => {
      if (!containerRef.current || typeof (window as any).DICE === 'undefined') return;
      
      try {
        diceBoxInstance = new (window as any).DICE.dice_box(
          containerRef.current,
          {
            baseSize: 60,
            colorset: {
              background: '#111827', 
              backgroundTransparency: 0.8,
              top: '#f59e0b', 
              topTransparency: 0.9,
              left: '#d97706', 
              leftTransparency: 0.9,
              right: '#fbbf24', 
              rightTransparency: 0.9,
              outline: '#111827', 
              outlineTransparency: 0.8,
              spot: '#111827', 
              spotTransparency: 0.8,
              border: '#f59e0b', 
              borderTransparency: 0.8,
              pip: '#111827', 
              pipTransparency: 0.8,
            },
            notation: `1d20`,
            physics: {
              gravity: [0, -1000, 0],
              timeStep: 1 / 60,
              broadphase: 'Naive',
              friction: 0.9,
              restitution: 0.2,
              sleepSpeedLimit: 0.1,
              sleepTimeLimit: 1,
              solver: 'GSS',
              iterations: 10,
              defaultContactMaterial: {
                friction: 0.9,
                restitution: 0.2,
                contactEquationStiffness: 1e8,
                contactEquationRelaxation: 3,
              },
            },
          }
        );
        diceBoxRef.current = diceBoxInstance;
        
        if (diceBoxInstance && typeof diceBoxInstance.bind_swipe === 'function') {
          diceBoxInstance.bind_swipe(containerRef.current, before_roll, after_roll);
          console.log('3D dice box created successfully');
        }
      } catch (error) {
        console.error('Failed to create 3D dice box:', error);
      }
    };

    const before_roll = () => {
      setIsRolling(true);
      return null;
    };
    
    const after_roll = (notation: any, result: number[]) => {
      setIsRolling(false);
      // Find the current player who needs to roll
      const currentPlayer = players.find(p => p.userId === currentUserId && !p.hasRolled);
      if (currentPlayer && result.length > 0) {
        onPlayerRollComplete(currentPlayer.slotIndex, result[0]);
      }
    };

    const initialize3DDice = async () => {
      try {
        if (typeof (window as any).DICE !== 'undefined') {
          if (isMounted) {
            console.log('3D dice library already available or loaded');
            createDiceBox();
          }
          return;
        }
        
        const scripts = [
          '/libs/three.min.js',
          '/libs/cannon.min.js',
          '/libs/teal.js',
          '/dice.js'
        ];
        
        for (const src of scripts) {
          await loadScript(src);
        }
        
        setTimeout(() => {
          if (isMounted && typeof (window as any).DICE !== 'undefined') {
            console.log('3D dice library loaded successfully');
            createDiceBox();
          } else if (isMounted) {
            console.log('3D dice library not available, using visual fallback');
          }
        }, 300);
      } catch (error) {
        console.error('Error loading 3D dice library:', error);
        if (isMounted) {
          console.log('3D dice library failed to load, using visual fallback');
        }
      }
    };
    
    initialize3DDice();
    
    return () => {
      isMounted = false;
      if (diceBoxInstance && typeof diceBoxInstance.dispose === 'function') {
        diceBoxInstance.dispose();
      }
    };
  }, [players, currentUserId, onPlayerRollComplete]);
  
  return (
    <div className="dice-roller-3d">
      {/* Per-player results grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {players.map((player) => {
          const isCurrentPlayer = diceState && diceState.players[diceState.currentPlayerIndex]?.slotIndex === player.slotIndex;
          const isCurrentUser = player.userId === currentUserId;
          const hasRolled = player.hasRolled || rollingDice[player.slotIndex] !== undefined;
          const result = player.result || rollingDice[player.slotIndex];
          
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
                {diceState && diceState.players[diceState.currentPlayerIndex]?.slotIndex === player.slotIndex && (
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
              
              {diceState && diceState.players[diceState.currentPlayerIndex]?.slotIndex === player.slotIndex && showRollButton && (
                <div className="mt-3">
                  <button
                    onClick={() => handleRollDice(player.slotIndex)}
                    disabled={isRolling || hasRolled}
                    className="w-full bg-yellow-600 hover:bg-yellow-500 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded transition duration-200"
                  >
                    {isRolling ? '🎲 Rolling...' : '🎲 Roll D20'}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      {/* 3D Dice Container */}
      <div 
        ref={containerRef} 
        className="w-full h-64 bg-gray-900 rounded-lg relative overflow-hidden border-4 border-yellow-500"
        style={{ minHeight: '256px' }}
      />
      
      {/* Completion message */}
      {diceState && diceState.status === 'completed' && (
        <div className="mt-4 text-center">
          <div className="bg-green-600 text-white font-bold py-3 px-6 rounded-lg inline-block">
            Winner: {diceState.players[diceState.winner!]?.characterName} with {diceState.rolls[diceState.winner!]}!
          </div>
        </div>
      )}
      
      {/* Visual feedback for rolling dice */}
      {isRolling && (
        <div className="mt-4 text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
          <p className="mt-2 text-yellow-300 text-sm">Rolling dice...</p>
        </div>
      )}
    </div>
  );
}