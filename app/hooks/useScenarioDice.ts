import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFetcher } from '@remix-run/react';
import type { ScenarioForDisplay, PlayerSlot, DiceRollingState, UseScenarioDiceReturn, RoomUpdatePayload } from '~/types'; // Import RoomUpdatePayload
import { useGlobalToast } from '~/utils/toast';
import { subscribeToRoomChanges } from '~/services/realtime.client';
import { logger } from '~/utils/logger';

// Audio context for turn change sound
let audioContext: AudioContext | null = null;

export function useScenarioDice({
  roomCode = '',
  partySlots = [],
  scenarios = null,
  userVotes = {},
  votesLoaded = false,
  needsTiebreaker = false,
  onScenarioSelected,
  currentUserId = '',
}: {
  roomCode?: string;
  partySlots?: PlayerSlot[];
  scenarios?: ScenarioForDisplay[] | null;
  userVotes?: Record<number, string | null>;
  votesLoaded?: boolean;
  needsTiebreaker?: boolean;
  onScenarioSelected?: (scenario: ScenarioForDisplay) => void;
  currentUserId?: string;
}): UseScenarioDiceReturn {
  const { showToast } = useGlobalToast();
  const diceFetcher = useFetcher<any>();
  
  const [diceState, setDiceState] = useState<DiceRollingState | null>(null);
  const [diceRolls, setDiceRolls] = useState<Record<number, number>>({});
  const [diceRollComplete, setDiceRollComplete] = useState(false);
  const [showDiceRoll, setShowDiceRoll] = useState(false);
  const [isInitializingDice, setIsInitializingDice] = useState(false);
  const [winningScenarioFromDice, setWinningScenarioFromDice] = useState<ScenarioForDisplay | null>(null);

  // Phase 1: Turn Detection State Variables
  const [previousDiceState, setPreviousDiceState] = useState<DiceRollingState | null>(null);
  const [lastNotifiedTurnIndex, setLastNotifiedTurnIndex] = useState<number>(-1);
  const [diceCompleted, setDiceCompleted] = useState(false);

  // Derived state
  const totalActiveSlots = useMemo(() => 
    partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length,
    [partySlots]
  );

  const rolledCount = useMemo(() => 
    Object.keys(diceRolls).length,
    [diceRolls]
  );

  const completionPercentage = useMemo(() => 
    totalActiveSlots > 0 ? Math.round((rolledCount / totalActiveSlots) * 100) : 0,
    [rolledCount, totalActiveSlots]
  );

  // Load dice state from server
  useEffect(() => {
    if (!roomCode) return;
    
    const loadDiceState = async () => {
      try {
        const response = await fetch(`/api/room/dice?roomCode=${encodeURIComponent(roomCode)}`);
        if (!response.ok) throw new Error('Failed to load dice state');
        
        const data = await response.json();
        setDiceState(data.diceState || null);
        setDiceRolls(data.diceRolls || {});
        setDiceRollComplete(data.diceRollComplete || false);
        setShowDiceRoll(data.showDiceRoll || false);
        setIsInitializingDice(data.isInitializingDice || false);
        setWinningScenarioFromDice(data.winningScenarioFromDice || null);
      } catch (error) {
        logger.error('Failed to load dice state', { error });
      }
    };
    
    loadDiceState();
  }, [roomCode]);

  // Subscribe to dice changes - Phase 1: Enhanced with Turn Detection
  useEffect(() => {
    if (!roomCode) return;
    
    const unsubscribe = subscribeToRoomChanges(roomCode, (changes: RoomUpdatePayload) => {
      if (changes.type === 'dice_updated') {
        const { diceState, diceRolls, diceRollComplete, showDiceRoll, isInitializingDice, winningScenarioFromDice } = changes.data;
        
        // Phase 1: Update previous state before setting new state
        if (diceState) {
          setPreviousDiceState(diceState);
        }
        
        setDiceState(diceState || null);
        setDiceRolls(diceRolls || {});
        setDiceRollComplete(diceRollComplete || false);
        setShowDiceRoll(showDiceRoll || false);
        setIsInitializingDice(isInitializingDice || false);
        setWinningScenarioFromDice(winningScenarioFromDice || null);
        
        // Phase 1: Detect turn changes and show notifications
        if (diceState) {
          const turnChange = detectTurnChange(diceState);
          handleTurnChange(turnChange);
          
          // Handle completion sound
          if (turnChange.type === 'completed') {
            playCompletionSound();
          }
        }
      }
    });
    
    return unsubscribe;
  }, [roomCode, currentUserId, showToast, detectTurnChange, handleTurnChange, playCompletionSound]);

  // Start tiebreaker dice roll
  const handleTiebreakerDiceRoll = useCallback(async () => {
    if (!roomCode || !scenarios || scenarios.length === 0) return;
    
    setIsInitializingDice(true);
    setShowDiceRoll(true);
    
    const formData = new FormData();
    formData.append('intent', 'startTiebreakerDice');
    formData.append('roomCode', roomCode);
    formData.append('scenarios', JSON.stringify(scenarios));
    formData.append('userVotes', JSON.stringify(userVotes));
    
    diceFetcher.submit(formData, { method: 'post', action: '/api/room/dice' });
  }, [roomCode, scenarios, userVotes, diceFetcher]);

  // Handle player roll complete
  const onPlayerRollComplete = useCallback(async (slotIndex: number, result: number, userId: string) => {
    if (!roomCode) return;
    
    const formData = new FormData();
    formData.append('intent', 'playerRollComplete');
    formData.append('roomCode', roomCode);
    formData.append('slotIndex', slotIndex.toString());
    formData.append('result', result.toString());
    formData.append('userId', userId);
    
    diceFetcher.submit(formData, { method: 'post', action: '/api/room/dice' });
  }, [roomCode, diceFetcher]);

  // Clear dice state
  const clearDiceState = useCallback(() => {
    setDiceState(null);
    setDiceRolls({});
    setDiceRollComplete(false);
    setShowDiceRoll(false);
    setIsInitializingDice(false);
    setWinningScenarioFromDice(null);
  }, []);

  // Handle dice fetcher data
  useEffect(() => {
    if (diceFetcher.data?.diceState) {
      setDiceState(diceFetcher.data.diceState);
      setDiceRolls(diceFetcher.data.diceRolls || {});
      setDiceRollComplete(diceFetcher.data.diceRollComplete || false);
      setShowDiceRoll(diceFetcher.data.showDiceRoll || false);
      setIsInitializingDice(diceFetcher.data.isInitializingDice || false);
      setWinningScenarioFromDice(diceFetcher.data.winningScenarioFromDice || null);
    }
  }, [diceFetcher.data]);

  // Phase 1: Turn Detection Logic
  const detectTurnChange = useCallback((newDiceState: DiceRollingState) => {
    if (!previousDiceState) {
      // First state received, check if it's user's turn
      const currentPlayer = newDiceState.players[newDiceState.currentPlayerIndex];
      if (currentPlayer?.userId === currentUserId && !diceRolls[newDiceState.currentPlayerIndex]) {
        return {
          type: 'started' as const,
          isUserTurn: true,
          playerName: currentPlayer.username || currentPlayer.userId,
          turnIndex: newDiceState.currentPlayerIndex
        };
      }
      return { type: 'none' as const };
    }

    const oldIndex = previousDiceState.currentPlayerIndex;
    const newIndex = newDiceState.currentPlayerIndex;
    const oldCompleted = previousDiceState.status === 'completed';
    const newCompleted = newDiceState.status === 'completed';

    // Check if dice rolling completed
    if (!oldCompleted && newCompleted) {
      return {
        type: 'completed' as const,
        isUserTurn: false,
        playerName: '',
        turnIndex: -1
      };
    }

    // Check for turn change
    if (oldIndex !== newIndex) {
      const currentPlayer = newDiceState.players[newIndex];
      const isUserTurn = currentPlayer?.userId === currentUserId;
      
      return {
        type: 'changed' as const,
        isUserTurn,
        playerName: currentPlayer?.username || currentPlayer?.userId || 'Unknown',
        turnIndex: newIndex
      };
    }

    return { type: 'none' as const };
  }, [previousDiceState, diceRolls, currentUserId]);

  // Phase 1: Enhanced Notifications
  const handleTurnChange = useCallback((change: any) => {
    if (change.type === 'none') return;

    // Prevent duplicate notifications for the same turn
    if (change.turnIndex === lastNotifiedTurnIndex) {
      return;
    }

    let message = '';
    let duration = 3000;
    let type: 'info' | 'success' = 'info';

    if (change.type === 'completed') {
      message = '✅ All rolls complete!';
      duration = 3000;
      type = 'success';
      setDiceCompleted(true);
      setLastNotifiedTurnIndex(-1); // Reset for next round
    } else if (change.isUserTurn) {
      message = '🎲 Your turn to roll!';
      duration = 4000; // Longer duration for user's turn
      type = 'info';
      playYourTurnSound();
    } else {
      message = `${change.playerName} is rolling...`;
      duration = 2000; // Shorter duration for other players
      type = 'info';
      playOtherPlayerSound();
    }

    showToast(message, type, duration);
    setLastNotifiedTurnIndex(change.turnIndex);
  }, [lastNotifiedTurnIndex, showToast, playYourTurnSound, playOtherPlayerSound]);

  // Phase 1: Sound Functions
  const playYourTurnSound = useCallback(() => {
    if (!audioContext) {
      initializeAudioContext();
    }

    if (audioContext) {
      try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        // Two-tone: ascending then descending
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
        oscillator.frequency.linearRampToValueAtTime(800, audioContext.currentTime + 0.1);
        oscillator.frequency.linearRampToValueAtTime(600, audioContext.currentTime + 0.2);
        
        gainNode.gain.setValueAtTime(0.15, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.4);
      } catch (e) {
        console.warn('Failed to play your turn sound:', e);
      }
    }
  }, [initializeAudioContext]);

  const playOtherPlayerSound = useCallback(() => {
    if (!audioContext) {
      initializeAudioContext();
    }

    if (audioContext) {
      try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(500, audioContext.currentTime);
        
        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.15);
      } catch (e) {
        console.warn('Failed to play other player sound:', e);
      }
    }
  }, [initializeAudioContext]);

  const playCompletionSound = useCallback(() => {
    if (!audioContext) {
      initializeAudioContext();
    }

    if (audioContext) {
      try {
        const notes = [261.63, 329.63, 392.00]; // C4, E4, G4
        const now = audioContext.currentTime;
        
        notes.forEach((frequency, index) => {
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();
          
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(frequency, now + index * 0.1);
          
          gainNode.gain.setValueAtTime(0.1, now + index * 0.1);
          gainNode.gain.exponentialRampToValueAtTime(0.01, now + index * 0.1 + 0.3);
          
          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);
          
          oscillator.start(now + index * 0.1);
          oscillator.stop(now + index * 0.1 + 0.3);
        });
      } catch (e) {
        console.warn('Failed to play completion sound:', e);
      }
    }
  }, [initializeAudioContext]);

  // Initialize audio context for turn change sound
  const initializeAudioContext = useCallback(() => {
    if (!audioContext && typeof window !== 'undefined') {
      try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      } catch (e) {
        console.warn('Web Audio API not supported');
      }
    }
  }, []);

  // Play turn change sound
  const playTurnChangeSound = useCallback(() => {
    if (!audioContext) {
      initializeAudioContext();
    }

    if (audioContext) {
      try {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.3);
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.3);
      } catch (e) {
        console.warn('Failed to play turn change sound:', e);
      }
    }
  }, [initializeAudioContext]);

  return {
    diceState,
    diceRolls,
    diceRollComplete,
    showDiceRoll,
    isInitializingDice,
    winningScenarioFromDice,
    handleTiebreakerDiceRoll,
    onPlayerRollComplete,
    clearDiceState,
  };
}
