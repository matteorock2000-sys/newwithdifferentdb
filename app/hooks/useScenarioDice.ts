import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFetcher } from '@remix-run/react';
import type { ScenarioForDisplay, PlayerSlot, DiceRollingState, UseScenarioDiceReturn, RoomUpdatePayload } from '~/types'; // Import RoomUpdatePayload
import { useGlobalToast } from '~/utils/toast';
import { subscribeToRoomChanges } from '~/services/realtime.client';
import { logger } from '~/utils/logger';

export function useScenarioDice({
  roomCode = '',
  partySlots = [],
  scenarios = null,
  userVotes = {},
  votesLoaded = false,
  needsTiebreaker = false,
  onScenarioSelected,
}: {
  roomCode?: string;
  partySlots?: PlayerSlot[];
  scenarios?: ScenarioForDisplay[] | null;
  userVotes?: Record<number, string | null>;
  votesLoaded?: boolean;
  needsTiebreaker?: boolean;
  onScenarioSelected?: (scenario: ScenarioForDisplay) => void;
}): UseScenarioDiceReturn {
  const { showToast } = useGlobalToast();
  const diceFetcher = useFetcher<any>();
  
  const [diceState, setDiceState] = useState<DiceRollingState | null>(null);
  const [diceRolls, setDiceRolls] = useState<Record<number, number>>({});
  const [diceRollComplete, setDiceRollComplete] = useState(false);
  const [showDiceRoll, setShowDiceRoll] = useState(false);
  const [isInitializingDice, setIsInitializingDice] = useState(false);
  const [winningScenarioFromDice, setWinningScenarioFromDice] = useState<ScenarioForDisplay | null>(null);

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

  // Subscribe to dice changes
  useEffect(() => {
    if (!roomCode) return;
    
    const unsubscribe = subscribeToRoomChanges(roomCode, (changes: RoomUpdatePayload) => { // Use new RoomUpdatePayload
      if (changes.type === 'dice_updated') {
        const { diceState, diceRolls, diceRollComplete, showDiceRoll, isInitializingDice, winningScenarioFromDice } = changes.data;
        setDiceState(diceState || null);
        setDiceRolls(diceRolls || {});
        setDiceRollComplete(diceRollComplete || false);
        setShowDiceRoll(showDiceRoll || false);
        setIsInitializingDice(isInitializingDice || false);
        setWinningScenarioFromDice(winningScenarioFromDice || null);
      }
    });
    
    return unsubscribe;
  }, [roomCode]);

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

  // Handle scenario selection from dice - REMOVED AUTOMATIC SELECTION
  // The scenario selection is now handled manually by the host through the UI
  // This useEffect has been removed to prevent automatic progression to map generation

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
