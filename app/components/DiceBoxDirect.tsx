import { useRef, useEffect, useState, useCallback } from 'react';
import type { DiceRollingState } from '~/types';
import { useGlobalToast } from '~/utils/toast';

/** @jsxImportSource react */

// Type declarations for global objects
declare global {
  interface Window {
    THREE: object;
    CANNON: object;
    DICE: {
      dice_box: {
        new (container: HTMLElement): any;
      };
    };
  }
}

interface DiceNotation {
  set: string[];           // Array of dice types rolled (e.g., ['d20'])
  constant: number;        // Modifier added to result
  result: number[];        // Array of individual die results
  resultTotal: number;     // Sum of all dice + constant
  resultString: string;    // Formatted result string
  error: boolean;          // Whether parsing had errors
}

interface DiceBoxDirectProps {
  onPlayerRollComplete: (slotIndex: number, result: number, userId: string) => void;
  players: Array<{ slotIndex: number; characterName: string; userId: string; hasRolled: boolean; result?: number }>;
  currentUserId: string;
  diceState: DiceRollingState | null;
}

// Lazy load 3D dice only when needed
const loadDice3D = async () => {
  // Only load on pages that actually need 3D dice
  if (typeof window === 'undefined') return null;
  
  try {
    await Promise.all([
      import('/libs/three.min.js'),
      import('/libs/cannon.min.js'),
      import('/libs/teal.js'),
      import('/dice.js')
    ]);
    return window.DICE;
  } catch (error) {
    console.warn('[DiceBoxDirect] Failed to load 3D dice:', error);
    return null;
  }
};

export default function DiceBoxDirect({ 
  onPlayerRollComplete, 
  players, 
  currentUserId, 
  diceState
}: DiceBoxDirectProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRolling, setIsRolling] = useState(false);
  const { showToast } = useGlobalToast();
  const [diceBox, setDiceBox] = useState<{ 
    start_throw: (beforeRoll: (notation: DiceNotation) => number[] | null | void, afterRoll: (notation: DiceNotation) => void) => void;
    bind_swipe: (container: HTMLElement, beforeRoll: (notation: DiceNotation) => number[] | null | void, afterRoll: (notation: DiceNotation) => void) => void;
    setDice: (notation: string) => void;
    reinit: (container: HTMLElement) => void;
  } | null>(null);
  const [currentRollResult, setCurrentRollResult] = useState<number | null>(null);

  // Load the required scripts dynamically
  const loadScripts = useCallback(async () => {
    try {
      // Check if scripts are already loaded globally
      if (window.THREE && window.CANNON && window.DICE?.dice_box) {
        console.log('[DiceBoxDirect] Scripts already loaded globally');
        console.log('[DiceBoxDirect] THREE type:', typeof window.THREE);
        console.log('[DiceBoxDirect] CANNON type:', typeof window.CANNON);
        console.log('[DiceBoxDirect] DICE.dice_box type:', typeof window.DICE.dice_box);
        return true;
      }

      console.log('[DiceBoxDirect] Starting script loading sequence...');
      
      // Load scripts in the correct order with dependencies
      console.log('[DiceBoxDirect] Loading THREE.js...');
      await loadScript('/libs/three.min.js');
      
      console.log('[DiceBoxDirect] Loading Cannon.js...');
      await loadScript('/libs/cannon.min.js');
      
      console.log('[DiceBoxDirect] Loading Teal.js...');
      await loadScript('/libs/teal.js');
      
      console.log('[DiceBoxDirect] Loading Dice.js...');
      await loadScript('/dice.js');
      
      console.log('[DiceBoxDirect] All scripts loaded: THREE=' + !!window.THREE + ', CANNON=' + !!window.CANNON + ', DICE=' + !!window.DICE);
      
      // Wait for DICE to be available with a reasonable timeout
      let attempts = 0;
      const maxAttempts = 50; // Reduced to 5 seconds max wait
      
      while (!window.DICE && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
        
        // Log progress every 10 attempts
        if (attempts % 10 === 0) {
          console.log(`[DiceBoxDirect] Waiting for DICE... (${attempts}/${maxAttempts})`);
          console.log(`[DiceBoxDirect] THREE=${!!window.THREE}, CANNON=${!!window.CANNON}, DICE=${!!window.DICE}`);
        }
      }
      
      // Final check
      if (!window.DICE) {
        console.error('[DiceBoxDirect] DICE object still not available after all attempts');
        console.log('[DiceBoxDirect] Checking window object for DICE:', window.DICE);
        console.log('[DiceBoxDirect] Available window properties:', Object.keys(window).filter(key => key.toLowerCase().includes('dice')));
        throw new Error('DICE object not available after script loading (attempts: ' + attempts + ')');
      }
      
      // Verify dice_box constructor exists
      if (!window.DICE.dice_box) {
        console.error('[DiceBoxDirect] DICE object exists but dice_box constructor is missing');
        console.log('[DiceBoxDirect] DICE properties:', Object.keys(window.DICE));
        
        // Add retry logic for dice_box constructor
        console.log('[DiceBoxDirect] Waiting for dice_box constructor to become available...');
        let diceBoxAttempts = 0;
        const diceBoxMaxAttempts = 10; // 5 seconds max wait (10 * 500ms)
        
        while (!window.DICE.dice_box && diceBoxAttempts < diceBoxMaxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 500));
          diceBoxAttempts++;
          console.log(`[DiceBoxDirect] Still waiting for dice_box constructor... (attempt ${diceBoxAttempts}/${diceBoxMaxAttempts})`);
        }
        
        if (!window.DICE.dice_box) {
          console.error('[DiceBoxDirect] DICE.dice_box constructor still not available after retry attempts');
          throw new Error('DICE.dice_box constructor not available after retry');
        }
      }
      
      console.log('[DiceBoxDirect] DICE.dice_box type:', typeof window.DICE.dice_box);
      
      console.log('[DiceBoxDirect] All scripts loaded successfully, DICE available');
      return true;
    } catch (error) {
      console.error('[DiceBoxDirect] Failed to load scripts:', error);
      console.log('[DiceBoxDirect] Try: 1) Refresh page, 2) Clear browser cache, 3) Check network connection');
      showToast('Failed to load 3D dice scripts after multiple attempts. Please refresh the page.', 'error');
      return false;
    }
  }, [showToast]);

  // Check if scripts are already loaded globally (from index.html)
  useEffect(() => {
    if (window.THREE && window.CANNON && window.DICE) {
      console.log('[DiceBoxDirect] Scripts already available globally');
      console.log('[DiceBoxDirect] DICE object:', window.DICE);
    } else {
      console.log('[DiceBoxDirect] Scripts not available globally, will load dynamically');
      console.log('[DiceBoxDirect] Available globals:', {
        THREE: !!window.THREE,
        CANNON: !!window.CANNON,
        DICE: !!window.DICE
      });
    }
  }, []);

  const loadScript = (src: string, maxRetries = 3, initialDelay = 500): Promise<void> => {
    return new Promise((resolve, reject) => {
      // Check if script is already loaded
      const existingScript = document.querySelector(`script[src="${src}"]`);
      if (existingScript) {
        console.log(`[DiceBoxDirect] ✓ Script already loaded: ${src}`);
        resolve();
        return;
      }

      let attempt = 0;
      
      const tryLoad = () => {
        attempt++;
        console.log(`[DiceBoxDirect] Loading script: ${src} (attempt ${attempt}/${maxRetries})`);
        
        const script = document.createElement('script');
        script.src = src;
        script.async = false; // Load synchronously to maintain order
        
        const onLoad = () => {
          console.log(`[DiceBoxDirect] ✓ Loaded ${src} successfully (attempt ${attempt})`);
          cleanup();
          resolve();
        };
        
        const onError = (error: Event | string) => {
          const errorMessage = typeof error === 'string' ? error : error?.toString() || 'Unknown error';
          console.log(`[DiceBoxDirect] ✗ Failed to load ${src}: ${errorMessage} (attempt ${attempt}/${maxRetries})`);
          cleanup();
          
          if (attempt < maxRetries) {
            const delay = initialDelay * Math.pow(2, attempt - 1); // Exponential backoff: 500ms, 1000ms, 2000ms
            console.log(`[DiceBoxDirect] Retrying in ${delay}ms...`);
            setTimeout(tryLoad, delay);
          } else {
            reject(new Error(`Failed to load ${src} after ${maxRetries} attempts`));
          }
        };
        
        const cleanup = () => {
          script.removeEventListener('load', onLoad);
          script.removeEventListener('error', onError);
        };
        
        script.addEventListener('load', onLoad);
        script.addEventListener('error', onError);
        document.body.appendChild(script);
      };
      
      tryLoad();
    });
  };

  // Initialize the dice box
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Prevent multiple initializations using a data attribute
    if (container.dataset.diceBoxInitialized === 'true') {
      console.log('[DiceBoxDirect] Dice box already initialized for this container');
      return;
    }
    container.dataset.diceBoxInitialized = 'true';

    const initDiceBox = async () => {
      console.log('[DiceBoxDirect] Starting dice box initialization');
      
      const scriptsLoaded = await loadScripts();
      console.log('[DiceBoxDirect] Scripts loaded:', scriptsLoaded);
      
      if (!scriptsLoaded) return;

      // Check if DICE is available before trying to use it
      if (!window.DICE) {
        console.error('[DiceBoxDirect] DICE object is not available even after script loading');
        showToast('3D dice scripts loaded but not available. Using fallback.', 'error');
        return;
      }

      // Wait for container to have proper dimensions and be visible
      await new Promise(resolve => {
        const checkDimensions = () => {
          const rect = container.getBoundingClientRect();
          const isVisible = getComputedStyle(container).display !== 'none';
          if (rect.width > 0 && rect.height > 0 && isVisible) {
            resolve(true);
          } else {
            setTimeout(checkDimensions, 100);
          }
        };
        checkDimensions();
      });

      console.log('[DiceBoxDirect] Container state before initialization:');
      console.log('[DiceBoxDirect] Container dimensions:', container.getBoundingClientRect());
      console.log('[DiceBoxDirect] Container display:', getComputedStyle(container).display);
      console.log('[DiceBoxDirect] Container visibility:', getComputedStyle(container).visibility);

      try {
        console.log('[DiceBoxDirect] Initializing dice box with container:', container);
        console.log('[DiceBoxDirect] DICE object available:', !!window.DICE);
        console.log('[DiceBoxDirect] DICE.dice_box type:', typeof window.DICE.dice_box);
        
        // Initialize the dice box
        const box = new window.DICE.dice_box(container);
        console.log('[DiceBoxDirect] Dice box instance created, type:', typeof box);
        console.log('[DiceBoxDirect] Dice box methods:', Object.keys(box).filter(k => typeof box[k] === 'function'));
        console.log('[DiceBoxDirect] Container children after dice box init:', container.children);
        
        // Force a reflow to ensure the container is properly rendered
        container.offsetHeight;
        
        console.log('[DiceBoxDirect] Setting dice notation to 1d20');
        box.setDice('1d20');
        
        // Set up event handlers
        const beforeRoll = (notation: DiceNotation) => {
          console.log('[DiceBoxDirect] Before roll');
          setIsRolling(true);
          window.parent.postMessage({ type: 'roll_started' }, '*');
        };

        const afterRoll = (notation: DiceNotation) => {
          console.log('[DiceBoxDirect] After roll, notation:', notation);
          console.log('[DiceBoxDirect] Result total:', notation.resultTotal);
          
          // Check for off-table dice condition
          if (notation.result[0] < 0) {
            console.log('[DiceBoxDirect] Dice fell off the table, showing error message');
            showToast('Oops, your dice fell off the table. Please roll again.', 'error');
            setIsRolling(false);
            return;
          }
          
          const result = notation.resultTotal;
          setCurrentRollResult(result);
          setIsRolling(false);
          
          // Get current player and complete the roll
          const currentPlayer = diceState?.players[diceState.currentPlayerIndex];
          if (currentPlayer) {
            onPlayerRollComplete(currentPlayer.slotIndex, result, currentPlayer.userId);
          }
        };

        // Note: bind_swipe removed to avoid conflicts with React synthetic events
        // Using JSX onClick handler instead for React-idiomatic event handling
        
        // Note: Native click listener removed to avoid conflicts with JSX onClick handler
        // Using React's synthetic events for consistent behavior

        // Set up resize observer to handle container size changes
        const resizeObserver = new ResizeObserver(() => {
          try {
            box.reinit(container);
          } catch (error) {
            console.warn('[DiceBoxDirect] Resize observer error:', error);
          }
        });
        resizeObserver.observe(container);

        setDiceBox(box);
        showToast('3D dice rolling is ready! Click or swipe to roll.', 'success');
        
      } catch (error) {
        console.error('[DiceBoxDirect] Failed to initialize dice box:', error);
        showToast('Failed to initialize 3D dice. Using fallback.', 'error');
      }
    };

    initDiceBox();

    return () => {
      // Cleanup - be more careful about removing children
      try {
        delete container.dataset.diceBoxInitialized;
        
        // Remove all children safely
        while (container.firstChild) {
          container.removeChild(container.firstChild);
        }
      } catch (error) {
        console.warn('[DiceBoxDirect] Cleanup error:', error);
      }
    };
  }, [diceState, currentUserId, onPlayerRollComplete, loadScripts, showToast]);

  // Handle dice state changes
  useEffect(() => {
    if (diceState?.status === 'rolling' && diceBox) {
      const currentPlayer = diceState.players[diceState.currentPlayerIndex];
      if (currentPlayer) {
        console.log('[DiceBoxDirect] Dice state changed to rolling for player:', currentPlayer.characterName);
      }
    }
  }, [diceState, diceBox]);

  return (
    <div className="dice-box-direct">
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
        className={`w-full h-80 rounded-xl relative overflow-hidden border-4 transition-all duration-500`}
        style={{ 
          minHeight: '320px', 
          height: '45vh', 
          zIndex: 9998,
          position: 'relative',
          borderColor: '#3b82f6', // Blue border instead of red
          display: 'block',
          visibility: 'visible',
          background: 'transparent',
          borderRadius: '12px'
        }}
        onClick={(e) => {
          // Using React onClick instead of bind_swipe to avoid conflicts between native preventDefault and React synthetic events
          // bind_swipe was removed because it calls preventDefault() on mousedown, which blocks React's synthetic click events
          e.preventDefault();
          e.stopPropagation();
          if (diceBox && !isRolling) {
            console.log('[DiceBoxDirect] Container clicked, starting throw');
            diceBox.start_throw(
              (notation: DiceNotation) => {
                console.log('[DiceBoxDirect] Before roll');
                setIsRolling(true);
              },
              (notation: DiceNotation) => {
                console.log('[DiceBoxDirect] After roll (click), notation:', notation);
                console.log('[DiceBoxDirect] Result total:', notation.resultTotal);
                
                // Check for off-table dice condition
                if (notation.result[0] < 0) {
                  console.log('[DiceBoxDirect] Dice fell off the table (click), showing error message');
                  showToast('Oops, your dice fell off the table. Please roll again.', 'error');
                  setIsRolling(false);
                  return;
                }
                
                const result = notation.resultTotal;
                setCurrentRollResult(result);
                setIsRolling(false);
                
                const currentPlayer = diceState?.players[diceState.currentPlayerIndex];
                if (currentPlayer) {
                  onPlayerRollComplete(currentPlayer.slotIndex, result, currentPlayer.userId);
                }
              }
            );
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (diceBox && !isRolling) {
              console.log('[DiceBoxDirect] Keyboard roll triggered');
              diceBox.start_throw(
                (notation: DiceNotation) => {
                  console.log('[DiceBoxDirect] Before roll');
                  setIsRolling(true);
                },
                (notation: DiceNotation) => {
                  console.log('[DiceBoxDirect] After roll (keyboard), notation:', notation);
                  console.log('[DiceBoxDirect] Result total:', notation.resultTotal);
                  
                  // Check for off-table dice condition
                  if (notation.result[0] < 0) {
                    console.log('[DiceBoxDirect] Dice fell off the table (keyboard), showing error message');
                    showToast('Oops, your dice fell off the table. Please roll again.', 'error');
                    setIsRolling(false);
                    return;
                  }
                  
                  const result = notation.resultTotal;
                  setCurrentRollResult(result);
                  setIsRolling(false);
                  
                  const currentPlayer = diceState?.players[diceState.currentPlayerIndex];
                  if (currentPlayer) {
                    onPlayerRollComplete(currentPlayer.slotIndex, result, currentPlayer.userId);
                  }
                }
              );
            }
          }
        }}
        tabIndex={0}
        role="button"
        aria-label="3D Dice Roller - Click or press Enter/Space to roll dice"
      >
        {!diceBox && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
            <div className="text-center text-white">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400 mb-2"></div>
              <p>Loading 3D dice...</p>
            </div>
          </div>
        )}
        
        {isRolling && currentRollResult !== null && (
          <div className="absolute top-4 right-4 bg-black bg-opacity-70 text-yellow-400 font-bold py-2 px-4 rounded-lg">
            Rolling: {currentRollResult}
          </div>
        )}
      </div>
    </div>
  );
}