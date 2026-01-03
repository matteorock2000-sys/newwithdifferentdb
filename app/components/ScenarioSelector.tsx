import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useFetcher, useNavigation } from '@remix-run/react';
import type { Character, ScenarioForDisplay, PlayerSlot, AdventureScenario, DiceRollingState, ScenarioVote } from '~/types';
import { useGlobalToast } from '~/utils/toast';
import { subscribeToRoomChanges } from '~/services/realtime.client';
import DiceBoxDirect from './DiceBoxDirect';
import ChatWindow from './ChatWindow';


interface ScenarioSelectorProps {
  scenarios: ScenarioForDisplay[] | null;
  isLoading: boolean; 
  activeCharacter: Character | null;
  showCountdown?: boolean;
  partyCharacters?: Character[];
  partySlots?: PlayerSlot[];
  currentUserId?: string;
  roomCode?: string | null;
  isHost?: boolean; // NEW: Track if current user is the host
}

export default function ScenarioSelector({ scenarios, activeCharacter, showCountdown: initialShowCountdown, partyCharacters = [], partySlots = [], currentUserId = '', roomCode: initialRoomCode = null, isHost = false }: ScenarioSelectorProps) {
  const { showToast } = useGlobalToast();
  
  // State for scenario suggestions from database
  const [recentSuggestions, setRecentSuggestions] = useState<Array<{
    id: string;
    user_id: string;
    username: string;
    message: string;
    created_at: string;
  }>>([]);
  const [lastSuggestionTime, setLastSuggestionTime] = useState<number>(0);
  const [lastSeenSuggestionId, setLastSeenSuggestionId] = useState<string | null>(null);
  const [lastToastSuggestionId, setLastToastSuggestionId] = useState<string | null>(null);
  const [lastToastTime, setLastToastTime] = useState<number>(0);
  // Chat state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const hasInitializedRef = useRef(false);
  const hasShownToastForCurrentSuggestion = useRef(false);
  const lastProcessedSuggestionId = useRef<string | null>(null);
  // State for vote objects (to display who voted)
  const [allVotes, setAllVotes] = useState<ScenarioVote[]>([]);
  // State for vote counts by scenario (for display)
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  
  console.log(`[SCENARIO SELECTOR] Props received:`, {
    isHost,
    roomCode: initialRoomCode,
    currentUserId,
    partySlots: partySlots.map(s => ({ type: s.type, characterId: s.characterId, userId: s.userId })),
    scenarios: scenarios?.length || 0,
    activeCharacter: activeCharacter ? { id: activeCharacter.id, name: activeCharacter.name } : null,
    partyCharactersCount: partyCharacters.length,
    partyCharacters: partyCharacters.map(c => ({ id: c.id, name: c.name, userId: c.userId }))
  });
  
  // Additional debugging for character data
  console.log(`[SCENARIO SELECTOR] Character data debug:`, {
    partyCharactersLength: partyCharacters.length,
    partyCharacters: partyCharacters.map(c => ({ id: c.id, name: c.name, userId: c.userId })),
    partySlotsWithCharacters: partySlots.map((s, index) => ({ 
      slotIndex: index, 
      type: s.type, 
      characterId: s.characterId, 
      userId: s.userId,
      characterName: s.characterName 
    }))
  });
  
  // Check if activeCharacter is missing and show error
  useEffect(() => {
    if (!activeCharacter) {
      console.warn(`[SCENARIO SELECTOR] Active character is missing! This will prevent scenario generation.`);
      showToast('Active character data is missing. Cannot generate scenarios.', 'error');
    }
  }, [activeCharacter, showToast]);

  // Initialize lastSeenSuggestionId from localStorage when roomCode is available
  useEffect(() => {
    if (typeof window !== 'undefined' && initialRoomCode && !hasInitializedRef.current) {
      const savedSeenId = localStorage.getItem(`lastSeenSuggestionId_${initialRoomCode}`);
      const savedToastId = localStorage.getItem(`lastToastSuggestionId_${initialRoomCode}`);
      
      if (savedSeenId) {
        setLastSeenSuggestionId(savedSeenId);
        lastProcessedSuggestionId.current = savedSeenId;
        console.log(`[SCENARIO SELECTOR] Initialized lastSeenSuggestionId from localStorage: ${savedSeenId}`);
      }
      
      if (savedToastId) {
        setLastToastSuggestionId(savedToastId);
        console.log(`[SCENARIO SELECTOR] Initialized lastToastSuggestionId from localStorage: ${savedToastId}`);
      }
      
      // Reset toast flag on initialization
      hasShownToastForCurrentSuggestion.current = false;
      console.log(`[SCENARIO SELECTOR] Reset toast flag on initialization`);
      
      hasInitializedRef.current = true;
    }
  }, [initialRoomCode]);

  // Effect to handle scenario updates from props (real-time sync)
  useEffect(() => {
    if (scenarios && scenarios.length > 0) {
      console.log(`[SCENARIO SELECTOR] Scenarios updated from props: ${scenarios.length} scenarios`);
      // Update interface ready state when scenarios are available
      setInterfaceReady(true);
    }
  }, [scenarios]);

  // Effect to handle scenario updates from props (real-time sync)
  useEffect(() => {
    if (scenarios && scenarios.length > 0) {
      console.log(`[SCENARIO SELECTOR] Scenarios updated from props: ${scenarios.length} scenarios`);
      // Update interface ready state when scenarios are available
      setInterfaceReady(true);
    }
  }, [scenarios]);

  // Mark interface as ready immediately to show UI without waiting for scenarios
  useEffect(() => {
    setInterfaceReady(true);
  }, []);
  
  // Suggestion polling effect - fetch suggestions and show toast notifications
  useEffect(() => {
    if (!initialRoomCode) return;
    
    console.log(`[SCENARIO SELECTOR] Starting suggestion polling for room ${initialRoomCode}`);
    
    const pollSuggestions = async () => {
      try {
        console.log(`[SCENARIO SELECTOR] Polling for suggestions in room ${initialRoomCode}`);
        const response = await fetch(`/api/room/suggestions?roomCode=${encodeURIComponent(initialRoomCode)}`);
        
        if (response.ok) {
          const data = await response.json();
          const newSuggestions = data.suggestions || [];
          
          console.log(`[SCENARIO SELECTOR] Current lastSeenSuggestionId: ${lastSeenSuggestionId}, New suggestions: ${newSuggestions.length}`);
          
          // Check if we have new suggestions and show toast for all users
          if (newSuggestions.length > 0) {
            // Only show toast if this is a truly new suggestion (not already processed)
            const latestSuggestion = newSuggestions[0]; // Most recent suggestion
            const isNewSuggestion = latestSuggestion.id !== lastProcessedSuggestionId.current;
            
            // Check if enough time has passed since the last toast
            const timeSinceLastToast = Date.now() - lastToastTime;
            const minToastInterval = 2000; // 2 seconds minimum between toasts
            
            if (isNewSuggestion && timeSinceLastToast >= minToastInterval) {
              // Show toast for ALL users (including the one who submitted it)
              const toastMessage = `${latestSuggestion.username} suggests: "${latestSuggestion.message}"`;
              console.log(`[SCENARIO SELECTOR] Showing toast: ${toastMessage} (isHost: ${isHost})`);
              showToast(toastMessage, 'info'); // Show for 3 seconds (default)
              
              // Update tracking
              setLastToastTime(Date.now());
              setLastToastSuggestionId(latestSuggestion.id);
              lastProcessedSuggestionId.current = latestSuggestion.id;
              setLastSeenSuggestionId(latestSuggestion.id);
              
              console.log(`[SCENARIO SELECTOR] Marked toast as shown for suggestion: ${latestSuggestion.id}`);
            } else if (!isNewSuggestion) {
              console.log(`[SCENARIO SELECTOR] Skipping toast - same suggestion as last processed (isHost: ${isHost})`);
            } else {
              console.log(`[SCENARIO SELECTOR] Skipping toast - too soon since last toast (${timeSinceLastToast}ms < ${minToastInterval}ms) (isHost: ${isHost})`);
            }
          }
          
          // Update suggestions list (keep only latest 3)
          const limitedSuggestions = newSuggestions.slice(0, 3);
          setRecentSuggestions(limitedSuggestions);
          
          // Store last seen suggestion ID in localStorage for persistence
          if (limitedSuggestions.length > 0) {
            localStorage.setItem(`lastSeenSuggestionId_${initialRoomCode}`, limitedSuggestions[0].id);
          }
          
          // Update last suggestion time
          if (newSuggestions.length > 0) {
            setLastSuggestionTime(new Date(newSuggestions[0].created_at).getTime());
          }
        } else {
          console.error(`[SCENARIO SELECTOR] Failed to fetch suggestions, status: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
      }
    };
    
    // Initial poll
    pollSuggestions();
    
    // Poll every 3 seconds
    const interval = setInterval(pollSuggestions, 3000);
    
    return () => {
      console.log(`[SCENARIO SELECTOR] Stopping suggestion polling for room ${initialRoomCode}`);
      clearInterval(interval);
    };
  }, [initialRoomCode, lastSeenSuggestionId, lastToastTime, isHost, showToast]);
  
  // Reset toast flag when room code changes
  useEffect(() => {
    if (initialRoomCode) {
      setLastToastSuggestionId(null);
      setLastToastTime(0);
      lastProcessedSuggestionId.current = null;
      console.log(`[SCENARIO SELECTOR] Reset toast flag for new room: ${initialRoomCode}`);
    }
  }, [initialRoomCode]);
  
  const fetcher = useFetcher<any>();
  const voteFetcher = useFetcher<any>();
  const scenarioFetcher = useFetcher<any>();
  const navigation = useNavigation();
  const [selectedDuration, setSelectedDuration] = useState<string>('Short');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [displayedScenarios, setDisplayedScenarios] = useState<ScenarioForDisplay[] | null>(scenarios);
  const [showCountdown, setShowCountdown] = useState(initialShowCountdown || false);
  const [countdown, setCountdown] = useState(5);
  const [scenarioVotes, setScenarioVotes] = useState<Record<string, ScenarioVote[]>>({});
  const [userVotes, setUserVotes] = useState<Record<number, string | null>>({});
  const [regenerationVotes, setRegenerationVotes] = useState<number>(0);
  const [autoGeneratedOnce, setAutoGeneratedOnce] = useState(false);
  const [roomCode, setRoomCode] = useState<string | null>(initialRoomCode);
  const [votesLoaded, setVotesLoaded] = useState(false);
  const [interfaceReady, setInterfaceReady] = useState(false);
  const [diceRolls, setDiceRolls] = useState<Record<number, number>>({});
  const [adventureStarted, setAdventureStarted] = useState(false);
  const [diceRollComplete, setDiceRollComplete] = useState(false);
  const [winningScenarioFromDice, setWinningScenarioFromDice] = useState<AdventureScenario | null>(null);
  const [lastVoteTime, setLastVoteTime] = useState<string>(new Date().toISOString());
  const [scenarioSelectionInProgress, setScenarioSelectionInProgress] = useState(false);
  const [diceSelectionApplied, setDiceSelectionApplied] = useState(false);
  
  const rollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const isGenerating = fetcher.state !== 'idle';
  const activePartyMembers = partyCharacters.filter(c => c);
  
  // Real-time dice rolling state
  const [diceState, setDiceState] = useState<DiceRollingState | null>(null);
  const [isInitializingDice, setIsInitializingDice] = useState(false);
  const [isSubmittingRoll, setIsSubmittingRoll] = useState(false);
  const [showDiceRoll, setShowDiceRoll] = useState(false);
  const [diceVotingStarted, setDiceVotingStarted] = useState(false); // Track if dice voting has started
  // Dice voting state - track demo rolls vs actual votes
  const [demoRolls, setDemoRolls] = useState<Record<number, number>>({});
  const [userSlotsToRoll, setUserSlotsToRoll] = useState<Set<number>>(new Set());
  
  // Calculate how many active slots the current user controls
  const userActiveSlots = partySlots.filter(slot => 
    (slot.type === 'Human' || slot.type === 'AI') && slot.userId === currentUserId
  ).length;
  
  // Calculate total active slots across all party
  const totalActiveSlots = partySlots.filter(slot => 
    slot.type === 'Human' || slot.type === 'AI'
  ).length;
  
  // Get the indices of slots owned by the current user for voting
  const userSlotIndices = useMemo(() => {
    return partySlots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => (slot.type === 'Human' || slot.type === 'AI') && slot.userId === currentUserId)
      .map(({ index }) => index);
  }, [partySlots, currentUserId]);
  
  // Initialize userSlotsToRoll for all users when component mounts or when userSlotIndices changes
  useEffect(() => {
    setUserSlotsToRoll(new Set(userSlotIndices));
    console.log(`[SCENARIO SELECTOR] Initialized userSlotsToRoll for user ${currentUserId}:`, userSlotIndices);
  }, [userSlotIndices, currentUserId]);
  
  // Count votes cast by current user
  const userVotesCast = Object.values(userVotes).filter(v => v !== null).length;

  // Auto-generate scenarios on first load when in countdown mode
  useEffect(() => {
    if (showCountdown && !autoGeneratedOnce && !displayedScenarios && !isGenerating && activeCharacter) {
      setAutoGeneratedOnce(true);
      // Automatically generate scenarios after countdown
      const timer = setTimeout(() => {
        triggerAutoGenerate();
      }, 5500); // Wait for countdown to finish
      return () => clearTimeout(timer);
    }
  }, [showCountdown, autoGeneratedOnce, displayedScenarios, isGenerating, activeCharacter]);

  const triggerAutoGenerate = () => {
    if (!activeCharacter) return;
    
    const formData = new FormData();
    formData.append('intent', 'generateScenarios');
    formData.append('duration', selectedDuration);
    formData.append('activeCharacter', JSON.stringify(activeCharacter));
    formData.append('partyCharacters', JSON.stringify(partyCharacters));
    formData.append('partySlots', JSON.stringify(partySlots));
    
    // Add custom prompt if provided
    if (customPrompt.trim()) {
      formData.append('regenerationPrompt', customPrompt.trim());
    }
    
    // Add roomCode if available for database storage
    if (roomCode) {
      formData.append('roomCode', roomCode);
    }
    
    // Add uniqueness parameter to ensure always unique scenarios
    formData.append('unique', 'true');
    formData.append('forceNewGeneration', 'true');
    
    fetcher.submit(formData, { method: 'post', action: '/game' });
  };

  // Subscribe to real-time dice state changes
  useEffect(() => {
    if (!roomCode) return;
    
    const unsubscribe = subscribeToRoomChanges(roomCode, (payload) => {
      const newDiceState = payload.new.dice_rolling_state;
      if (newDiceState) {
        setDiceState(newDiceState);
        // Update local diceRolls state for UI display
        setDiceRolls(newDiceState.rolls || {});
        // Check if complete
        if (newDiceState.status === 'completed') {
          setDiceRollComplete(true);
          
          // Automatically determine and display winning scenario (only once)
          if (!scenarioSelectionInProgress && !diceSelectionApplied) {
            setScenarioSelectionInProgress(true);
            setDiceSelectionApplied(true);
            const winningScenario = getWinningScenarioFromDiceRoll();
            if (winningScenario) {
              showToast(`Winner: ${newDiceState.players[newDiceState.winner!]?.characterName} rolled ${newDiceState.rolls[newDiceState.winner!]}! Starting "${winningScenario.title}"...`, 'success');
              
              // Auto-select scenario after 3 seconds
              setTimeout(() => {
                handleSelectScenario(winningScenario);
              }, 3000);
            } else {
              showToast('Dice tiebreaker completed, but winner did not vote for a scenario. Please select manually.', 'warning');
              setScenarioSelectionInProgress(false);
              setDiceSelectionApplied(false);
            }
          }
        }
        
        // Dice rolling UI is now handled by the presence of diceState
      }
    });
    
    return () => {
          unsubscribe();
          setScenarioSelectionInProgress(false);
        };
  }, [roomCode]);

  // Initial fetch and polling for dice rolling state when roomCode is available
  useEffect(() => {
    if (!roomCode) return;
    
    const fetchDiceState = async () => {
      try {
        const formData = new FormData();
        formData.append('intent', 'getDiceRollingState');
        formData.append('roomCode', roomCode);
        
        console.log(`[SCENARIO SELECTOR] Fetching dice state for room: ${roomCode}`);
        
        // Add timeout to fetch request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch('/api/room/dice', {
          method: 'POST',
          body: formData,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        console.log(`[SCENARIO SELECTOR] Dice fetch response status: ${response.status}`);
        console.log(`[SCENARIO SELECTOR] Dice fetch response headers:`, Object.fromEntries(response.headers.entries()));
        
        // Check if response is HTML instead of JSON
        const contentType = response.headers.get('content-type');
        console.log(`[SCENARIO SELECTOR] Dice fetch content-type: ${contentType}`);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        // Check if the response is HTML (which would indicate a 404 or error page)
        if (contentType && contentType.includes('text/html')) {
          const htmlText = await response.text();
          console.error(`[SCENARIO SELECTOR] Received HTML instead of JSON:`, htmlText.substring(0, 200));
          throw new Error('Received HTML response instead of JSON');
        }
        
        const result = await response.json();
        console.log(`[SCENARIO SELECTOR] Dice fetch response data:`, result);
        
        // Validate the response structure
        if (!result || typeof result !== 'object') {
          console.error('[SCENARIO SELECTOR] Invalid dice response structure:', result);
          return;
        }
        
        if (result.success && result.diceRollingState) {
          setDiceState(result.diceRollingState);
          setDiceRolls(result.diceRollingState.rolls || {});
        } else if (!result.success) {
          // If no dice state, clear it
          if (diceState) {
            setDiceState(null);
            setDiceRolls({});
          }
        }
      } catch (error) {
        console.error('[SCENARIO SELECTOR] Error fetching dice state:', error);
        if (error instanceof Error && error.name === 'AbortError') {
          console.error('[SCENARIO SELECTOR] Dice state fetch timed out after 5 seconds');
        } else {
          console.error('[SCENARIO SELECTOR] Dice fetch error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
          });
        }
        // Don't clear state on error - keep existing state
      }
    };
    
    // Initial fetch
    fetchDiceState();
    
    // Poll for dice state updates with dynamic interval based on state
    let interval: NodeJS.Timeout | null = null;
    
    const updatePolling = () => {
      // Clear existing interval
      if (interval) {
        clearInterval(interval);
      }
      
      // Use faster polling when rolling, slower when not
      const currentStatus = diceState?.status;
      const intervalMs = currentStatus === 'rolling' ? 1000 : 2000;
      
      // Create new interval
      interval = setInterval(fetchDiceState, intervalMs);
    };
    
    // Initial polling setup
    updatePolling();
    
    // Also poll every second to check if we need to change the interval
    const checkInterval = setInterval(updatePolling, 1000);
    
    return () => {
      if (interval) {
        clearInterval(interval);
      }
      clearInterval(checkInterval);
    };
  }, [roomCode, diceState]);

  // Countdown effect
  useEffect(() => {
    if (!showCountdown) return;

    if (countdown === 0) {
      setShowCountdown(false);
      setCountdown(5);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(countdown - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [showCountdown, countdown]);

  const handleVoteScenario = (slotIndex: number, scenarioId: string) => {
    // Only allow voting for slots owned by current user
    if (!userSlotIndices.includes(slotIndex)) {
      console.log(`[VOTING] Cannot vote for slot ${slotIndex} - not owned by current user`);
      return;
    }
    
    // Get user information for the vote
    const slot = partySlots[slotIndex];
    const username = slot.username || `Player ${slotIndex}`;
    
    // Client-side validation: Check if slot already voted for a different scenario
    const currentSlotVote = userVotes[slotIndex];
    if (currentSlotVote && currentSlotVote !== scenarioId) {
      // Show confirmation toast for vote change
      showToast(`Changing vote from ${currentSlotVote} to ${scenarioId}`, 'info');
    }
    
    setUserVotes(prev => {
      const newVotes = { ...prev };
      const previousVote = newVotes[slotIndex];
      
      if (previousVote === scenarioId) {
        // Retract vote
        delete newVotes[slotIndex];
        setScenarioVotes(prevVotes => ({
          ...prevVotes,
          [scenarioId]: prevVotes[scenarioId] ? prevVotes[scenarioId].filter(v => v.userId !== currentUserId) : []
        }));
      } else {
        // Change or cast new vote
        if (previousVote) {
          setScenarioVotes(prevVotes => ({
            ...prevVotes,
            [previousVote]: prevVotes[previousVote] ? prevVotes[previousVote].filter(v => v.userId !== currentUserId) : []
          }));
        }
        newVotes[slotIndex] = scenarioId;
        setScenarioVotes(prevVotes => ({
          ...prevVotes,
          [scenarioId]: [...(prevVotes[scenarioId] || []), { scenarioId, userId: currentUserId, slotIndex, timestamp: new Date().toISOString() }]
        }));
      }
      return newVotes;
    });
    
    // Submit vote to server for real-time updates
    if (roomCode) {
      const slot = partySlots[slotIndex];
      const characterId = slot?.characterId || '';
      
      const formData = new FormData();
      formData.append('intent', 'castVote');
      formData.append('scenarioId', scenarioId);
      formData.append('slotIndex', slotIndex.toString());
      formData.append('roomCode', roomCode);
      formData.append('username', username);
      formData.append('userId', currentUserId || 'unknown');
      formData.append('characterId', characterId);
      formData.append('partySlots', JSON.stringify(partySlots));
      // Note: scenarioSetId is not needed for castVote intent
      
      console.log(`[VOTING] Submitting vote for scenario ${scenarioId} from character ${characterId} (slot ${slotIndex}) in room ${roomCode}`);
      console.log(`[VOTING] Form data:`, {
        intent: 'castVote',
        scenarioId,
        slotIndex,
        roomCode,
        username,
        userId: currentUserId || 'unknown',
        characterId,
        hasCharacterId: !!characterId
      });
      
      try {
        voteFetcher.submit(formData, { method: 'post', action: '/game' });
        console.log(`[VOTING] Vote submission initiated successfully`);
      } catch (error) {
        console.error(`[VOTING] Vote submission failed:`, error);
        showToast('Failed to submit vote. Please try again.', 'error');
      }
    }
  };

  const handleVoteRegenerate = (slotIndex: number) => {
    // Only allow voting for slots owned by current user
    if (!userSlotIndices.includes(slotIndex)) {
      console.log(`[VOTING] Cannot vote for slot ${slotIndex} - not owned by current user`);
      return;
    }
    
    // Get user information for the vote
    const slot = partySlots[slotIndex];
    const username = slot.username || `Player ${slotIndex}`;
    
    // Client-side validation: Check if slot already voted for a different scenario
    const currentSlotVote = userVotes[slotIndex];
    if (currentSlotVote && currentSlotVote !== 'REGENERATE') {
      // Show confirmation toast for vote change
      showToast(`Changing vote from ${currentSlotVote} to REGENERATE`, 'info');
    }
    
    setUserVotes(prev => {
      const newVotes = { ...prev };
      const previousVote = newVotes[slotIndex];
      
      if (previousVote === 'REGENERATE') {
        // Retract regenerate vote
        delete newVotes[slotIndex];
        setRegenerationVotes(prev => prev - 1);
      } else {
        // Change vote to regenerate
        if (previousVote) {
          setScenarioVotes(prevVotes => ({
            ...prevVotes,
            [previousVote]: prevVotes[previousVote] ? prevVotes[previousVote].filter(v => v.userId !== currentUserId) : []
          }));
        }
        newVotes[slotIndex] = 'REGENERATE';
        setRegenerationVotes(prev => prev + 1);
      }
      return newVotes;
    });
    
    // Submit regenerate vote to server for real-time updates
    if (roomCode) {
      const slot = partySlots[slotIndex];
      const characterId = slot?.characterId || '';
      
      const formData = new FormData();
      formData.append('intent', 'castVote');
      formData.append('scenarioId', 'REGENERATE'); // Special scenario ID for regenerate
      formData.append('slotIndex', slotIndex.toString());
      formData.append('roomCode', roomCode);
      formData.append('username', username);
      formData.append('userId', currentUserId || 'unknown');
      formData.append('characterId', characterId);
      formData.append('partySlots', JSON.stringify(partySlots));
      // Note: scenarioSetId is not needed for castVote intent
      
      console.log(`[VOTING] Submitting regenerate vote from character ${characterId} (slot ${slotIndex}) in room ${roomCode}`);
      console.log(`[VOTING] Form data:`, {
        intent: 'castVote',
        scenarioId: 'REGENERATE',
        slotIndex,
        roomCode,
        username,
        userId: currentUserId || 'unknown',
        characterId,
        hasCharacterId: !!characterId
      });
      
      try {
        voteFetcher.submit(formData, { method: 'post', action: '/game' });
        console.log(`[VOTING] Regenerate vote submission initiated successfully`);
      } catch (error) {
        console.error(`[VOTING] Regenerate vote submission failed:`, error);
        showToast('Failed to submit regenerate vote. Please try again.', 'error');
      }
    }
  };

  const userHasCompletedVoting = userVotesCast >= userActiveSlots;
  // Calculate total votes based on actual userVotes state (more accurate)
  const totalVotesCast = allVotes.length;
  const regenerateVoteCount = regenerationVotes;
  const allHaveVoted = totalVotesCast >= totalActiveSlots;

  // Scenario suggestion handlers
  const handleSuggestScenario = () => {
    // Use the content from the custom prompt field instead of a separate modal
    const suggestionText = customPrompt.trim();
    
    if (!suggestionText) {
      alert("Please enter a scenario suggestion in the custom theme field above.");
      return;
    }

    // Send suggestion to server to notify other users in the room
    // Toast will appear for ALL users (including sender) when fetched via polling
    if (roomCode) {
      const formData = new FormData();
      formData.append('intent', 'broadcastSuggestion');
      formData.append('roomCode', roomCode);
      formData.append('suggestion', suggestionText);
      formData.append('userId', currentUserId || 'unknown');
      
      // Get username from party slots
      const username = partySlots.find(slot => slot.userId === currentUserId)?.username || 'Unknown Player';
      formData.append('username', username);
      
      // Submit to server to broadcast to other users
      fetcher.submit(formData, { method: 'post', action: '/game' });
    }
    
    // Clear the suggestion field after sending
    setCustomPrompt('');
  };
  const regenerateMajority = regenerateVoteCount > totalVotesCast / 2;

  const handleTiebreakerDiceRoll = async () => {
    if (!roomCode) return;
    
    try {
      setIsInitializingDice(true);
      
      // Initialize dice voting state (remove demo rolls)
      setDemoRolls({}); // Clear any demo rolls
      // Note: setUserSlotsToRoll is now handled automatically via useEffect
      
      // Call API to start dice rolling with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const formData = new FormData();
      formData.append('intent', 'startDiceRolling');
      formData.append('roomCode', roomCode);
      
      const response = await fetch('/api/room/dice', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      console.log('Tiebreaker dice roll response:', result);
      
      // VERIFICATION: Log detailed information about the dice state
      if (result.success) {
        console.log('[VERIFICATION] Dice rolling started successfully');
        console.log('[VERIFICATION] Checking dice state initialization...');
        
        // Wait a moment for state to propagate
        setTimeout(() => {
          if (diceState) {
            console.log('[VERIFICATION] Dice state received:', {
              status: diceState.status,
              playersCount: diceState.players.length,
              currentPlayerIndex: diceState.currentPlayerIndex,
              rolls: diceState.rolls
            });
            
            // Verify players array
            diceState.players.forEach((player, index) => {
              console.log(`[VERIFICATION] Player ${index}:`, {
                slotIndex: player.slotIndex,
                characterName: player.characterName,
                userId: player.userId
              });
            });
          } else {
            console.warn('[VERIFICATION] Dice state not yet received, will be updated via polling');
          }
        }, 500);
        
        showToast('Dice voting started! Use the 3D dice to roll for each of your active characters.', 'success');
        setDiceVotingStarted(true); // Set the dice voting started flag
        // Remove the demo rolls info toast
        // showToast('You can roll as many times as you want before submitting your final votes.', 'info');
        // The dice rolling state will be updated via polling, no need for showDiceRoll
      } else {
        console.error('[VERIFICATION] Failed to start dice rolling');
        showToast('Failed to start dice voting. Please try again.', 'error');
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Tiebreaker dice roll initialization timed out after 5 seconds');
        showToast('Dice voting initialization timed out. Please try again.', 'error');
      } else {
        console.error('Error starting dice voting:', error);
        showToast('Failed to start dice voting. Please try again.', 'error');
      }
    } finally {
      setIsInitializingDice(false);
    }
  };

  

  const onPlayerRollComplete = async (slotIndex: number, result: number, userId: string) => {
    if (!roomCode) return;
    
    try {
      setIsSubmittingRoll(true);
      
      console.log(`Recording roll for slot ${slotIndex}: ${result}`);
      
      // VERIFICATION: Log roll completion details
      console.log('[VERIFICATION] Roll completion called:', {
        slotIndex,
        result,
        userId,
        currentRolls: diceRolls,
        demoRolls,
        diceVotingStarted,
        totalActiveSlots: partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length
      });
      
      // Check if dice voting is active based on server state
      const isVotingActive = diceState && diceState.status === 'rolling';

      if (!isVotingActive) {
        console.log('[DICE VOTING] Voting is not active, storing as demo roll');
        // Store as demo roll for preview
        setDemoRolls(prev => ({ ...prev, [slotIndex]: result }));
        
        // Show info message about demo mode
        const characterId = partySlots[slotIndex]?.characterId;
        const character = activePartyMembers.find(c => c.id === characterId);
        const characterName = character?.name || partySlots[slotIndex]?.username || `Slot ${slotIndex}`;
        showToast(`Demo roll: ${result} for ${characterName}`, 'info');
        return;
      }
      
      // Check if user still needs to roll for this slot
      if (!userSlotsToRoll.has(slotIndex)) {
        console.log('[DICE VOTING] User has already rolled for this slot, storing as demo roll');
        setDemoRolls(prev => ({ ...prev, [slotIndex]: result }));
        
        // Get character name from the character object, not from the slot
        const characterId = partySlots[slotIndex]?.characterId;
        const character = activePartyMembers.find(c => c.id === characterId);
        const characterName = character?.name || partySlots[slotIndex]?.username || `Slot ${slotIndex}`;
        showToast(`Demo roll: ${result} for ${characterName} (already voted)`, 'info');
        return;
      }
      
      // This is an actual voting roll - use definitive values (remove demo rolls)
      setDemoRolls(prev => {
        const newDemoRolls = { ...prev };
        delete newDemoRolls[slotIndex]; // Remove demo roll
        return newDemoRolls;
      });
      
      // Optimistic update for UI with definitive value
      setDiceRolls(prev => ({ ...prev, [slotIndex]: result }));
      
      // Call API to record the roll with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const formData = new FormData();
      formData.append('intent', 'rollDice');
      formData.append('roomCode', roomCode);
      formData.append('slotIndex', slotIndex.toString());
      formData.append('diceResult', result.toString());
      formData.append('diceType', 'd20');
      formData.append('userIdForSlot', userId);
      
      const response = await fetch('/api/room/dice', {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const resultData = await response.json();
      
      console.log('Roll API response:', resultData);
      
      // VERIFICATION: Log API response details
      console.log('[VERIFICATION] Roll recording response:', {
        success: resultData.success,
        diceResult: resultData.diceResult,
        state: resultData.state
      });
      
      if (!resultData.success) {
        // Revert optimistic update on error
        setDemoRolls(prev => {
          const newDemoRolls = { ...prev };
          delete newDemoRolls[slotIndex];
          return newDemoRolls;
        });
        setDiceRolls(prev => {
          const newRolls = { ...prev };
          delete newRolls[slotIndex];
          return newRolls;
        });
        showToast('Failed to record dice roll. Please try again.', 'error');
      } else {
        console.log('Roll recorded successfully');
        
        // Remove slot from user's pending rolls
        setUserSlotsToRoll(prev => {
          const newSet = new Set(prev);
          newSet.delete(slotIndex);
          return newSet;
        });
        
        // Update diceRolls and log progress in the state update callback to avoid stale closure
        setDiceRolls(prev => {
          const newRolls = { ...prev, [slotIndex]: result };
          
          // VERIFICATION: Check if all players have rolled using the updated state
          const totalActiveSlots = partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length;
          const rolledCount = Object.keys(newRolls).length;
          
          console.log('[VERIFICATION] Roll progress:', {
            rolledCount,
            totalActiveSlots,
            completionPercentage: `${Math.round((rolledCount / totalActiveSlots) * 100)}%`
          });
          
          if (rolledCount === totalActiveSlots) {
            console.log('[VERIFICATION] All players have rolled, waiting for completion...');
          }
          
          return newRolls;
        });
        
        // Check if current user has completed all their rolls
        const userCompleted = userSlotsToRoll.size === 1 && !userSlotsToRoll.has(slotIndex);
        if (userCompleted) {
          // Get character name from the character object, not from the slot
          const characterId = partySlots[slotIndex]?.characterId;
          const character = activePartyMembers.find(c => c.id === characterId);
          const characterName = character?.name || partySlots[slotIndex]?.username || `Slot ${slotIndex}`;
          showToast(`All your characters have rolled! Waiting for other players...`, 'success');
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('Roll recording timed out after 5 seconds');
        showToast('Dice roll recording timed out. Please try again.', 'error');
      } else {
        console.error('Error recording dice roll:', error);
        showToast('Failed to record dice roll. Please try again.', 'error');
      }
      
      // Revert optimistic update on error
      setDemoRolls(prev => {
        const newDemoRolls = { ...prev };
        delete newDemoRolls[slotIndex];
        return newDemoRolls;
      });
      setDiceRolls(prev => {
        const newRolls = { ...prev };
        delete newRolls[slotIndex];
        return newRolls;
      });
    } finally {
      setIsSubmittingRoll(false);
    }
  };

  const handleSelectScenario = useCallback((scenario: ScenarioForDisplay) => {
    if (!activeCharacter) {
      alert("Active character data is missing. Cannot start game.");
      return;
    }

    console.log('[SCENARIO SELECTOR] handleSelectScenario called:', { 
      scenarioId: scenario.id, 
      scenarioTitle: scenario.title,
      roomCode,
      hasRoomCode: !!roomCode 
    });

    // If roomCode is provided, submit to game route to update room status and persist winner
    if (roomCode) {
      console.log('[SCENARIO SELECTOR] Submitting scenario selection to /game for room:', roomCode);
      const formData = new FormData();
      formData.append('intent', 'startGame');
      formData.append('roomCode', roomCode);
      formData.append('selectedScenarioId', scenario.id);
      setScenarioSelectionInProgress(true);
      scenarioFetcher.submit(formData, { method: 'post', action: '/game' });
      return;
    }

    // Otherwise, use the original game route logic
    console.log('[SCENARIO SELECTOR] Submitting scenario selection to /game (standalone)');
    const formData = new FormData();
    formData.append('intent', 'selectScenario');
    formData.append('activeCharacter', JSON.stringify(activeCharacter));
    formData.append('selectedScenario', JSON.stringify(scenario)); 
    scenarioFetcher.submit(formData, { method: 'post', action: '/game' });
  }, [activeCharacter, roomCode, scenarioFetcher]);

  const handleDurationChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDuration(e.target.value);
  };

  useEffect(() => {
    if (fetcher.data && fetcher.data.scenarios && fetcher.state === 'idle') {
      setDisplayedScenarios(fetcher.data.scenarios);
      // Reset voting when new scenarios are generated
      setUserVotes({});
      setScenarioVotes({});
      setRegenerationVotes(0);
      
      // Show success notification
      showToast(`Successfully generated ${fetcher.data.scenarios.length} adventure scenarios!`, 'success');
      console.log(`[SCENARIO SELECTOR] Successfully generated ${fetcher.data.scenarios.length} scenarios`);
    }
  }, [fetcher.data, fetcher.state, showToast]);

  const currentScenarios = displayedScenarios;

  // Determine winning scenario from dice roll
  const getWinningScenarioFromDiceRoll = useCallback(async () => {
    if (!diceState || diceState.status !== 'completed') return null;
    
    // Guard against missing scenarios
    if (!currentScenarios || currentScenarios.length === 0) {
      console.warn('[SCENARIO SELECTOR] No scenarios available for dice winner selection');
      return null;
    }
    
    let winnerCharacterId = '';
    
    if (diceState && diceState.winnerCharacterId) {
      winnerCharacterId = diceState.winnerCharacterId;
    } else if (diceState && diceState.winner !== null) {
      // Fallback: try to find character from slot index
      const winnerSlot = partySlots[diceState.winner];
      if (winnerSlot) {
        winnerCharacterId = winnerSlot.characterId || '';
      }
    }
    
    if (!winnerCharacterId) {
      console.error('[SCENARIO SELECTOR] Could not determine winner character ID from dice roll:', {
        diceState,
        partySlots
      });
      showToast('Dice tiebreaker completed, but could not determine winner. Please select manually.', 'warning');
      return null;
    }

    // Get the actual user votes from the database instead of local state
    try {
      const response = await fetch(`/api/room/votes?roomCode=${encodeURIComponent(initialRoomCode || '')}`);
      if (!response.ok) {
        throw new Error('Failed to fetch scenario votes');
      }
      
      const data = await response.json();
      const scenarioVotes = data.votes || [];
      
      // Find the winner's vote using multiple robust lookup strategies
      let winnerVoteData = null;
      let winnerVote = null;
      
      // Debug: Log winner information
      const winnerSlot = partySlots[diceState.winner];
      console.log('[DICE WINNER DEBUG] Winner info:', {
        diceStateWinner: diceState.winner,
        winnerSlot: winnerSlot,
        winnerCharacterId: winnerCharacterId,
        winnerUserId: winnerSlot?.userId,
        winnerCharacterName: winnerSlot?.characterName,
        winnerUsername: winnerSlot?.username
      });
      
      // Debug: Log all votes with detailed information
      console.log('[DICE WINNER DEBUG] All votes:', scenarioVotes.map(v => ({
        slotIndex: v.slotIndex,
        characterId: v.characterId,
        userId: v.userId,
        scenarioId: v.scenarioId,
        timestamp: v.timestamp
      })));
      
      // Strategy 1: Exact match by slotIndex and characterId (primary method)
      winnerVoteData = scenarioVotes.find(vote => 
        vote.slotIndex === diceState.winner && vote.characterId === winnerCharacterId && vote.characterId !== 'unknown'
      );
      console.log('[DICE WINNER DEBUG] Strategy 1 result:', winnerVoteData);
      
      // Strategy 2: Match by slotIndex only (if characterId is unknown or missing)
      if (!winnerVoteData) {
        winnerVoteData = scenarioVotes.find(vote => 
          vote.slotIndex === diceState.winner && vote.scenarioId
        );
        console.log('[DICE WINNER DEBUG] Strategy 2 result:', winnerVoteData);
      }
      
      // Strategy 3: Match by characterId only (if slotIndex lookup fails)
      if (!winnerVoteData) {
        winnerVoteData = scenarioVotes.find(vote => 
          vote.characterId === winnerCharacterId && vote.characterId !== 'unknown' && vote.scenarioId
        );
        console.log('[DICE WINNER DEBUG] Strategy 3 result:', winnerVoteData);
      }
      
      // Strategy 4: Match by userId and slotIndex (for cases where characterId is unreliable)
      if (!winnerVoteData) {
        const winnerSlot = partySlots[diceState.winner];
        if (winnerSlot && winnerSlot.userId) {
          winnerVoteData = scenarioVotes.find(vote => 
            vote.slotIndex === diceState.winner && vote.userId === winnerSlot.userId && vote.scenarioId
          );
          console.log('[DICE WINNER DEBUG] Strategy 4 result:', winnerVoteData);
        }
      }
      
      // Strategy 5: Match by character name from party data (last resort)
      if (!winnerVoteData) {
        const winnerSlot = partySlots[diceState.winner];
        const winnerName = winnerSlot?.characterName || winnerSlot?.username || '';
        if (winnerName) {
          // Find votes where the character name matches (this is a heuristic)
          winnerVoteData = scenarioVotes.find(vote => {
            // Try to match by looking up the character name from the vote's slot
            const voteSlot = partySlots[vote.slotIndex];
            const voteCharacterName = voteSlot?.characterName || voteSlot?.username || '';
            return voteCharacterName === winnerName && vote.scenarioId;
          });
          console.log('[DICE WINNER DEBUG] Strategy 5 result:', winnerVoteData);
        }
      }
      
      // Strategy 6: Direct slot lookup with any scenarioId (emergency fallback)
      if (!winnerVoteData) {
        winnerVoteData = scenarioVotes.find(vote => 
          vote.slotIndex === diceState.winner
        );
        console.log('[DICE WINNER DEBUG] Strategy 6 (emergency) result:', winnerVoteData);
      }
      
      winnerVote = winnerVoteData?.scenarioId;
      
      if (!winnerVote) {
        console.error('[SCENARIO SELECTOR] Dice winner determination failed - winner character did not vote:', {
          diceState,
          winnerCharacterId,
          winnerSlotIndex: diceState.winner,
          scenarioVotes: scenarioVotes.map(v => ({ 
            scenarioId: v.scenarioId, 
            userId: v.userId, 
            slotIndex: v.slotIndex, 
            characterId: v.characterId,
            timestamp: v.timestamp 
          })),
          partySlots
        });
        
        // Show more detailed error message
        const winnerSlot = partySlots[diceState.winner];
        const winnerName = winnerSlot?.characterName || winnerSlot?.username || 'Unknown';
        const winnerRoll = diceState.rolls[diceState.winner] || '?';
        
        // Find all votes for this winner (by slot and character)
        const winnerVotes = scenarioVotes.filter(v => 
          v.slotIndex === diceState.winner || v.characterId === winnerCharacterId
        );
        
        // Get votes by each strategy for debugging
        const strategy1Votes = scenarioVotes.filter(v => 
          v.slotIndex === diceState.winner && v.characterId === winnerCharacterId && v.characterId !== 'unknown'
        );
        const strategy2Votes = scenarioVotes.filter(v => 
          v.slotIndex === diceState.winner && v.scenarioId
        );
        const strategy3Votes = scenarioVotes.filter(v => 
          v.characterId === winnerCharacterId && v.characterId !== 'unknown' && v.scenarioId
        );
        const strategy4Votes = scenarioVotes.filter(v => {
          const voteSlot = partySlots[v.slotIndex];
          return v.slotIndex === diceState.winner && voteSlot?.userId === winnerSlot?.userId && v.scenarioId;
        });
        const strategy5Votes = scenarioVotes.filter(v => {
          const voteSlot = partySlots[v.slotIndex];
          const voteCharacterName = voteSlot?.characterName || voteSlot?.username || '';
          const winnerCharacterName = winnerSlot?.characterName || winnerSlot?.username || '';
          return voteCharacterName === winnerCharacterName && v.scenarioId;
        });
        
        console.log('[SCENARIO SELECTOR] Winner votes debug:', { 
          winnerVotes,
          winnerSlotIndex: diceState.winner,
          winnerCharacterId,
          allVotes: scenarioVotes,
          strategy1Votes,
          strategy2Votes,
          strategy3Votes,
          strategy4Votes,
          strategy5Votes
        });
        
        // Show detailed error with what votes were found by each strategy
        const voteDetails = `
Strat 1 (slot+char): ${strategy1Votes.length} votes (${strategy1Votes.map(v => v.scenarioId).join(', ')})
Strat 2 (slot only): ${strategy2Votes.length} votes (${strategy2Votes.map(v => v.scenarioId).join(', ')})
Strat 3 (char only): ${strategy3Votes.length} votes (${strategy3Votes.map(v => v.scenarioId).join(', ')})
Strat 4 (user+slot): ${strategy4Votes.length} votes (${strategy4Votes.map(v => v.scenarioId).join(', ')})
Strat 5 (name match): ${strategy5Votes.length} votes (${strategy5Votes.map(v => v.scenarioId).join(', ')})
        `;
        
        showToast(`🎉 Winner: ${winnerName} rolled ${winnerRoll}!\nWinner did not vote for a scenario. Please select manually.${voteDetails}`, 'warning');
        
        return null;
      }
      
      const winningScenario = currentScenarios.find(s => s.id === winnerVote);
      if (!winningScenario) {
        console.warn('[SCENARIO SELECTOR] Winning scenario not found for vote:', winnerVote);
        return null;
      }

      console.log('[SCENARIO SELECTOR] Winning scenario determined by dice:', {
        winnerCharacterId,
        winnerVote,
        scenario: winningScenario.title
      });
      
      return winningScenario;
    } catch (error) {
      console.error('[SCENARIO SELECTOR] Error fetching scenario votes for dice winner:', error);
      showToast('Error determining winner from dice roll. Please select scenario manually.', 'error');
      return null;
    }
  }, [diceState, currentScenarios, initialRoomCode, showToast, partySlots]);
  
  // Poll for new suggestions every 3 seconds
  useEffect(() => {
    if (!initialRoomCode) return;
    
    // Reset toast flag when room code changes
    hasShownToastForCurrentSuggestion.current = false;
    console.log(`[SCENARIO SELECTOR] Reset toast flag for new room: ${initialRoomCode}`);
    
    console.log(`[SCENARIO SELECTOR] Starting polling for room ${initialRoomCode}`);
    
    const interval = setInterval(async () => {
      try {
        console.log(`[SCENARIO SELECTOR] Polling for suggestions in room ${initialRoomCode}`);
        const response = await fetch(`/api/room/suggestions?roomCode=${encodeURIComponent(initialRoomCode)}`);
        console.log(`[SCENARIO SELECTOR] Polling response status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          const newSuggestions = data.suggestions || [];
          
          console.log(`[SCENARIO SELECTOR] Current lastSeenSuggestionId: ${lastSeenSuggestionId}, New suggestions: ${newSuggestions.length}`);
          
          // Check if we have new suggestions and show toast for all users
          if (newSuggestions.length > 0) {
            const newSuggestion = newSuggestions[0]; // Get the most recent suggestion
            
            console.log(`[SCENARIO SELECTOR] Checking suggestion ID: ${newSuggestion.id} vs lastSeen: ${lastSeenSuggestionId}, lastToast: ${lastToastSuggestionId}, lastProcessed: ${lastProcessedSuggestionId.current}`);
            console.log(`[SCENARIO SELECTOR] New suggestion details:`, {
              id: newSuggestion.id,
              message: newSuggestion.message,
              username: newSuggestion.username,
              createdAt: newSuggestion.created_at,
              userId: newSuggestion.user_id,
              currentUserId: currentUserId,
              isHost: isHost
            });
            
            // Check if we have a genuinely new suggestion by comparing IDs
            const isNewSuggestion = newSuggestion.id !== lastProcessedSuggestionId.current;
            
            // Only show toast if this is a truly new suggestion (not already processed)
            // and enough time has passed since the last toast
            // Show toast for ALL users (including the one who submitted it)
            const now = Date.now();
            const timeSinceLastToast = now - lastToastTime;
            const minToastInterval = 2000; // 2 seconds minimum between toasts
            
            const shouldShowToast = isNewSuggestion && timeSinceLastToast > minToastInterval;
            
            if (shouldShowToast) {
              const username = newSuggestion.username || 'Unknown Player';
              const toastMessage = `${username} suggests: "${newSuggestion.message}"`;
              console.log(`[SCENARIO SELECTOR] Showing toast: ${toastMessage} (isHost: ${isHost})`);
              showToast(toastMessage, 'info'); // Show for 3 seconds (default)
              
              // Update all tracking mechanisms immediately
              lastProcessedSuggestionId.current = newSuggestion.id;
              setLastSeenSuggestionId(newSuggestion.id);
              setLastToastSuggestionId(newSuggestion.id);
              setLastToastTime(now);
              
              if (typeof window !== 'undefined' && initialRoomCode) {
                localStorage.setItem(`lastSeenSuggestionId_${initialRoomCode}`, newSuggestion.id);
                localStorage.setItem(`lastToastSuggestionId_${initialRoomCode}`, newSuggestion.id);
                console.log(`[SCENARIO SELECTOR] Saved both IDs to localStorage: ${newSuggestion.id}`);
              }
              
              console.log(`[SCENARIO SELECTOR] Marked toast as shown for suggestion: ${newSuggestion.id}`);
            } else {
              if (!isNewSuggestion) {
                console.log(`[SCENARIO SELECTOR] Skipping toast - same suggestion as last processed (isHost: ${isHost})`);
              } else {
                console.log(`[SCENARIO SELECTOR] Skipping toast - too soon since last toast (${timeSinceLastToast}ms < ${minToastInterval}ms) (isHost: ${isHost})`);
              }
            }
            
            // Note: lastSeenSuggestionId is now updated immediately when toast is shown
            // This ensures the persistent display tracking is always current
          }
          
          // Only keep the last suggestion for display
          const lastSuggestion = newSuggestions.length > 0 ? [newSuggestions[0]] : [];
          setRecentSuggestions(lastSuggestion);
        } else {
          console.error(`[SCENARIO SELECTOR] Failed to fetch suggestions, status: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to fetch suggestions:', error);
      }
    }, 3000);
    
    return () => {
      console.log(`[SCENARIO SELECTOR] Stopping polling for room ${initialRoomCode}`);
      clearInterval(interval);
      
      // Clean up localStorage when polling stops
      if (typeof window !== 'undefined' && initialRoomCode) {
        localStorage.removeItem(`lastSeenSuggestionId_${initialRoomCode}`);
        localStorage.removeItem(`lastToastSuggestionId_${initialRoomCode}`);
      }
      
      // Reset ref when polling stops
      lastProcessedSuggestionId.current = null;
    };
  }, [initialRoomCode]);

  // Load scenarios on component mount and when room code changes
  useEffect(() => {
    const loadScenarios = async () => {
      if (!initialRoomCode) return;
      
      try {
        console.log(`[SCENARIO SELECTOR] Loading scenarios for room ${initialRoomCode}`);
        const response = await fetch(`/api/room/scenarios?roomCode=${encodeURIComponent(initialRoomCode)}`);
        
        if (response.ok) {
          const data = await response.json();
          const scenarios = data.scenarios || [];
          
          console.log(`[SCENARIO SELECTOR] Loaded ${scenarios.length} scenarios from room ${initialRoomCode}`);
          
          if (scenarios.length > 0) {
            setDisplayedScenarios(scenarios);
            
            // If this is a non-host user and scenarios were loaded from persistence, show a subtle notification
            if (!isHost) {
              showToast(`Loaded ${scenarios.length} scenarios from room`, 'info');
            }
          }
        } else {
          console.error(`[SCENARIO SELECTOR] Failed to load scenarios, status: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to load scenarios:', error);
      }
    };

    loadScenarios();
  }, [initialRoomCode, isHost, showToast]);

  // Load votes when scenarios are loaded
  useEffect(() => {
    const loadVotes = async () => {
      if (!initialRoomCode) return;
      
      try {
        console.log(`[SCENARIO SELECTOR] Loading votes for room ${initialRoomCode}`);
        const response = await fetch(`/api/room/votes?roomCode=${encodeURIComponent(initialRoomCode)}`);
        
        if (response.ok) {
          const data = await response.json();
          const voteUpdates = data.votes || [];
          
          console.log(`[SCENARIO SELECTOR] Loaded ${voteUpdates.length} votes from room ${initialRoomCode}`);
          console.log(`[SCENARIO SELECTOR] Vote data:`, voteUpdates);
          
          // Debug: Log detailed vote information
          console.log(`[VOTE DEBUG] Processing ${voteUpdates.length} votes with partyCharacters:`, partyCharacters.length);
          voteUpdates.forEach((vote: ScenarioVote, index) => {
            const slotInfo = partySlots[vote.slotIndex] || {};
            const characterId = slotInfo.characterId;
            const character = partyCharacters.find(c => c.id === characterId);
            
            // FIXED: Use character name from partyCharacters for accurate display
            const characterName = character ? character.name : (slotInfo.characterName || slotInfo.username || `Player ${vote.slotIndex}`);
            
            console.log(`[VOTE DEBUG] Vote ${index}:`, {
              scenarioId: vote.scenarioId,
              slotIndex: vote.slotIndex,
              userId: vote.userId,
              timestamp: vote.timestamp,
              slotCharacterId: characterId,
              foundCharacter: character ? { id: character.id, name: character.name, userId: character.userId } : null,
              slotUsername: slotInfo.username,
              slotCharacterName: slotInfo.characterName,
              finalCharacterName: characterName
            });
          });
          
          // Update vote counts by scenario
          const updatedVoteCounts: Record<string, number> = {};
          voteUpdates.forEach((vote: ScenarioVote) => {
            updatedVoteCounts[vote.scenarioId] = (updatedVoteCounts[vote.scenarioId] || 0) + 1;
          });
          console.log(`[VOTES LOADED] Updated voteCounts:`, updatedVoteCounts);
          setVoteCounts(updatedVoteCounts);
          
          // Store all vote objects for display
          setAllVotes(voteUpdates);
          
          // Update userVotes state based on the vote data
          const updatedUserVotes = {};
          voteUpdates.forEach((vote: ScenarioVote) => {
            if (vote.slotIndex !== undefined) {
              updatedUserVotes[vote.slotIndex] = vote.scenarioId;
            }
          });
          console.log(`[VOTES LOADED] Updated userVotes:`, updatedUserVotes);
          setUserVotes(updatedUserVotes);
        } else {
          console.error(`[SCENARIO SELECTOR] Failed to load votes, status: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to load votes:', error);
      }
    };

    loadVotes();
  }, [initialRoomCode, showToast]);
  
  // Also load votes when currentScenarios changes to ensure votes are loaded with scenarios
  useEffect(() => {
    if (initialRoomCode && currentScenarios && currentScenarios.length > 0) {
      const loadVotes = async () => {
        try {
          console.log(`[SCENARIO SELECTOR] Loading votes after scenarios loaded for room ${initialRoomCode}`);
          const response = await fetch(`/api/room/votes?roomCode=${encodeURIComponent(initialRoomCode)}`);
          
          if (response.ok) {
            const data = await response.json();
            const voteUpdates = data.votes || [];
            
            console.log(`[SCENARIO SELECTOR] Loaded ${voteUpdates.length} votes after scenarios loaded`);
            console.log(`[SCENARIO SELECTOR] Vote data after scenarios loaded:`, voteUpdates);
            
            // Update vote counts by scenario
            const updatedVoteCounts: Record<string, number> = {};
            voteUpdates.forEach((vote: ScenarioVote) => {
              updatedVoteCounts[vote.scenarioId] = (updatedVoteCounts[vote.scenarioId] || 0) + 1;
            });
            console.log(`[VOTES LOADED] Updated voteCounts after scenarios loaded:`, updatedVoteCounts);
            setVoteCounts(updatedVoteCounts);
            
            // Store all vote objects for display
            setAllVotes(voteUpdates);
            
            // Update userVotes state based on the vote data
            const updatedUserVotes = {};
            voteUpdates.forEach((vote: ScenarioVote) => {
              if (vote.slotIndex !== undefined) {
                updatedUserVotes[vote.slotIndex] = vote.scenarioId;
              }
            });
            console.log(`[VOTES LOADED] Updated userVotes after scenarios loaded:`, updatedUserVotes);
            setUserVotes(updatedUserVotes);
          } else {
            console.error(`[SCENARIO SELECTOR] Failed to load votes after scenarios loaded, status: ${response.status}`);
          }
        } catch (error) {
          console.error('Failed to load votes after scenarios loaded:', error);
        }
      };

      loadVotes();
    }
  }, [currentScenarios, initialRoomCode, showToast]);
  
  // Additional effect to ensure votes are loaded when component first mounts
  useEffect(() => {
    if (initialRoomCode) {
      const loadVotes = async () => {
        try {
          console.log(`[SCENARIO SELECTOR] Initial vote load on component mount for room ${initialRoomCode}`);
          const response = await fetch(`/api/room/votes?roomCode=${encodeURIComponent(initialRoomCode)}`);
          
          if (response.ok) {
            const data = await response.json();
            const voteUpdates = data.votes || [];
            
            console.log(`[SCENARIO SELECTOR] Initial load: ${voteUpdates.length} votes from room ${initialRoomCode}`);
            console.log(`[SCENARIO SELECTOR] Initial vote data:`, voteUpdates);
            
            // Update vote counts by scenario
            const updatedVoteCounts: Record<string, number> = {};
            voteUpdates.forEach((vote: ScenarioVote) => {
              updatedVoteCounts[vote.scenarioId] = (updatedVoteCounts[vote.scenarioId] || 0) + 1;
            });
            console.log(`[VOTES LOADED] Initial load - Updated voteCounts:`, updatedVoteCounts);
            setVoteCounts(updatedVoteCounts);
            
            // Store all vote objects for display
            setAllVotes(voteUpdates);
            
            // Update userVotes state based on the vote data - COMPLETELY REPLACE with loaded votes
            const updatedUserVotes: Record<number, string | null> = {};
            voteUpdates.forEach((vote: ScenarioVote) => {
              if (vote.slotIndex !== undefined && vote.userId === currentUserId) {
                updatedUserVotes[vote.slotIndex] = vote.scenarioId;
              }
            });
            console.log(`[VOTES LOADED] Initial load - Updated userVotes (complete replacement):`, updatedUserVotes);
            setUserVotes(updatedUserVotes);
            
            // Check for tiebreaker after loading votes on page refresh
            const totalVotesCast = allVotes.length;
            const totalActiveSlots = partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length;
            const allHaveVoted = totalVotesCast >= totalActiveSlots;
            
            const allVoteCounts = currentScenarios?.map(s => updatedVoteCounts[s.id] || 0) || [];
            const maxVotes = Math.max(...allVoteCounts, 0);
            const tiedScenarios = currentScenarios?.filter(s => (updatedVoteCounts[s.id] || 0) === maxVotes) || [];
            const hasClearWinner = tiedScenarios.length === 1 && maxVotes > 0;
            
            const needsTiebreakerNow = allHaveVoted && !regenerateMajority && !hasClearWinner && maxVotes > 0;
            
            console.log('[PAGE REFRESH] Tiebreaker check after loading votes:', {
              allHaveVoted,
              regenerateMajority,
              hasClearWinner,
              maxVotes,
              needsTiebreakerNow,
              voteCounts: updatedVoteCounts,
              userVotes: updatedUserVotes
            });
            
            if (needsTiebreakerNow && !showDiceRoll && !isInitializingDice) {
              console.log('[PAGE REFRESH] Automatically showing tiebreaker dice roller after page refresh');
              setShowDiceRoll(true);
              if (isHost) {
                handleTiebreakerDiceRoll();
              }
            }
          } else {
            console.error(`[SCENARIO SELECTOR] Failed to load initial votes, status: ${response.status}`);
          }
        } catch (error) {
          console.error('Failed to load initial votes:', error);
        }
      };

      loadVotes();
    }
  }, [initialRoomCode]);

  // Poll for new scenarios every 2 seconds for all users (including host)
  useEffect(() => {
    if (!initialRoomCode) return; // All users should poll for scenarios to ensure persistence
    
    console.log(`[SCENARIO SELECTOR] Starting scenario polling for non-host user in room ${initialRoomCode}`);
    
    const interval = setInterval(async () => {
      try {
        console.log(`[SCENARIO SELECTOR] Polling for scenarios in room ${initialRoomCode}`);
        const response = await fetch(`/api/room/scenarios?roomCode=${encodeURIComponent(initialRoomCode)}`);
        
        if (response.ok) {
          const responseText = await response.text();
          try {
            const data = JSON.parse(responseText);
            const newScenarios = data.scenarios || [];
            
            console.log(`[SCENARIO SELECTOR] Current scenarios: ${displayedScenarios?.length || 0}, New scenarios: ${newScenarios.length}`);
            
            // Check if we have new scenarios and update the display
            if (newScenarios.length > 0) {
              const wasEmpty = !displayedScenarios || displayedScenarios.length === 0;
              const isNewGeneration = displayedScenarios && newScenarios.length !== displayedScenarios.length;
              
              console.log(`[SCENARIO SELECTOR] Updating scenarios: wasEmpty=${wasEmpty}, isNewGeneration=${isNewGeneration}`);
              setDisplayedScenarios(newScenarios);
              
              // Show appropriate toast notification
              if (wasEmpty && isNewGeneration) {
                // Scenarios were loaded after being empty (page refresh or initial load)
                if (!isHost) {
                  showToast(`Loaded ${newScenarios.length} scenarios from room`, 'info');
                }
              } else if (isNewGeneration) {
                // New scenarios were generated
                const toastMessage = `Host generated ${newScenarios.length} new scenarios!`;
                showToast(toastMessage, 'info');
              }
              // If scenarios exist and count hasn't changed, don't show toast (existing scenarios)
            }
          } catch (e) {
            console.error(`[SCENARIO SELECTOR] Failed to parse JSON response. Response text:`, responseText);
          }
        } else {
          console.error(`[SCENARIO SELECTOR] Failed to fetch scenarios, status: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to fetch scenarios:', error);
      }
    }, 2000); // Poll every 2 seconds for faster updates
    
    return () => {
      console.log(`[SCENARIO SELECTOR] Stopping scenario polling for room ${initialRoomCode}`);
      clearInterval(interval);
    };
  }, [initialRoomCode, isHost, displayedScenarios]);

  // Handle voting responses to update UI without refresh
  useEffect(() => {
    if (voteFetcher.data && voteFetcher.state === 'idle') {
      if (voteFetcher.data.success) {
        showToast(voteFetcher.data.message || 'Vote cast successfully!', 'success');
      } else if (voteFetcher.data.error) {
        // Extract error message - handle both string and object error formats
        let errorMsg = 'Failed to cast vote.';
        
        if (typeof voteFetcher.data.error === 'string') {
          errorMsg = voteFetcher.data.error;
        } else if (voteFetcher.data.error && typeof voteFetcher.data.error === 'object') {
          errorMsg = voteFetcher.data.error.userMessage || 
                    voteFetcher.data.error.message || 
                    'An error occurred while casting your vote';
        }
        
        showToast(errorMsg, 'error');
      }
    }
  }, [voteFetcher.data, voteFetcher.state, showToast]);

  // Handle scenario regeneration when regenerate majority is reached
  useEffect(() => {
    if (regenerateMajority && isHost && roomCode) {
      console.log(`[SCENARIO SELECTOR] Regenerate majority reached, generating new scenarios for room ${roomCode}`);
      
      const formData = new FormData();
      formData.append('intent', 'generateScenarios');
      formData.append('duration', selectedDuration);
      formData.append('activeCharacter', JSON.stringify(activeCharacter));
      formData.append('partyCharacters', JSON.stringify(partyCharacters));
      formData.append('partySlots', JSON.stringify(partySlots));
      if (customPrompt.trim()) {
        formData.append('regenerationPrompt', customPrompt.trim());
      }
      formData.append('roomCode', roomCode);
      // Add uniqueness parameter to ensure always unique scenarios
      formData.append('unique', 'true');
      // Force generation to replace any existing scenarios
      formData.append('forceNewGeneration', 'true');
      
      fetcher.submit(formData, { method: 'post', action: '/game' });
    }
  }, [regenerateMajority, isHost, roomCode, selectedDuration, activeCharacter, partyCharacters, partySlots, customPrompt]);

  // Reset scenario selection flag when navigation begins (redirect happens)
  useEffect(() => {
    if (navigation.state !== 'idle') {
      console.log('[SCENARIO SELECTOR] Navigation detected, clearing selection flags:', { navigationState: navigation.state });
      setScenarioSelectionInProgress(false);
      setDiceSelectionApplied(false);
    }
  }, [navigation.state]);

  // Handle scenario selection responses to redirect without refresh
  useEffect(() => {
    if (scenarioFetcher.data && scenarioFetcher.state === 'idle') {
      console.log('[SCENARIO SELECTOR] Fetcher response:', scenarioFetcher.data);
      
      if (scenarioFetcher.data.error) {
        console.error('[SCENARIO SELECTOR] Scenario selection error:', scenarioFetcher.data.error);
        // Extract error message - handle both string and object error formats
        let errorMsg = 'Failed to save scenario selection';
        
        if (typeof scenarioFetcher.data.error === 'string') {
          errorMsg = scenarioFetcher.data.error;
        } else if (scenarioFetcher.data.error && typeof scenarioFetcher.data.error === 'object') {
          errorMsg = scenarioFetcher.data.error.userMessage || 
                    scenarioFetcher.data.error.message || 
                    'An error occurred while saving the scenario selection';
        }
        
        showToast(errorMsg, 'error');
        setScenarioSelectionInProgress(false);
        setDiceSelectionApplied(false);
      } else if (scenarioFetcher.data && scenarioFetcher.data.success) {
        // If server returned a success message without a redirect, show it
        const msg = scenarioFetcher.data.message || 'Selected scenario saved as winner.';
        console.log('[SCENARIO SELECTOR] Scenario selected successfully:', msg);
        showToast(msg, 'success');
        setScenarioSelectionInProgress(false);
        setDiceSelectionApplied(false);
      } else if (scenarioFetcher.data && scenarioFetcher.data.redirectTo) {
        // Server instructs client to navigate to map-generation
        const redirectUrl = scenarioFetcher.data.redirectTo;
        console.log('[SCENARIO SELECTOR] Server requested redirect to:', redirectUrl);
        showToast('🎉 Scenario winner saved! Proceeding to map generation...', 'success');
        setScenarioSelectionInProgress(false);
        setDiceSelectionApplied(false);
        // Use fetcher navigation to trigger loader properly
        window.location.href = redirectUrl;
      } else if (scenarioFetcher.data && !scenarioFetcher.data.error && !scenarioFetcher.data.success) {
        // Server redirected (no JSON response body)
        console.log('[SCENARIO SELECTOR] Server redirect detected (scenario saved and room updated)');
        showToast('🎉 Scenario winner saved! Proceeding to map generation...', 'success');
        // The redirect will happen automatically via Remix
        setScenarioSelectionInProgress(false);
        setDiceSelectionApplied(false);
      }
    }
  }, [scenarioFetcher.data, scenarioFetcher.state, showToast]);

  // Poll for real-time vote updates every 1 second
  useEffect(() => {
    if (!initialRoomCode || adventureStarted) return;
    
    console.log(`[SCENARIO SELECTOR] Starting vote polling for room ${initialRoomCode}`);
    
    // Initial fetch to get existing votes on page load
    const fetchInitialVotes = async () => {
      try {
        console.log(`[SCENARIO SELECTOR] Fetching initial votes for room ${initialRoomCode}`);
        const response = await fetch(`/api/room/votes?roomCode=${encodeURIComponent(initialRoomCode)}`);
        console.log(`[SCENARIO SELECTOR] Initial vote fetch response status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          const voteUpdates = data.votes || [];
          
          console.log(`[SCENARIO SELECTOR] Initial votes: ${voteUpdates.length}`);
          console.log(`[SCENARIO SELECTOR] Initial vote data:`, voteUpdates);
          
          if (voteUpdates.length > 0) {
            // Update vote counts by scenario
            const updatedVoteCounts: Record<string, number> = {};
            voteUpdates.forEach((vote: ScenarioVote) => {
              updatedVoteCounts[vote.scenarioId] = (updatedVoteCounts[vote.scenarioId] || 0) + 1;
            });
            console.log(`[INITIAL VOTES] Updated voteCounts:`, updatedVoteCounts);
            setVoteCounts(updatedVoteCounts);
            
            // Store all vote objects for display
            setAllVotes(voteUpdates);
            
            // Update userVotes state based on the vote data - COMPLETELY REPLACE with loaded votes
            const updatedUserVotes: Record<number, string | null> = {};
            voteUpdates.forEach((vote: ScenarioVote) => {
              if (vote.slotIndex !== undefined && vote.userId === currentUserId) {
                updatedUserVotes[vote.slotIndex] = vote.scenarioId;
              }
            });
            console.log(`[INITIAL VOTES] Updated userVotes (complete replacement):`, updatedUserVotes);
            setUserVotes(updatedUserVotes);
            
            // Set votesLoaded flag to true after initial vote fetch completes
            setVotesLoaded(true);
            
            // Refresh scenarios to get latest vote counts and userVotes
            const scenariosResponse = await fetch(`/api/room/scenarios?roomCode=${encodeURIComponent(initialRoomCode)}`);
            if (scenariosResponse.ok) {
              const scenariosData = await scenariosResponse.json();
              const updatedScenarios = scenariosData.scenarios || [];
              
              if (updatedScenarios.length > 0) {
                setDisplayedScenarios(updatedScenarios);
                
                // Update last vote time
                if (voteUpdates.length > 0) {
                  const latestVote = voteUpdates.reduce((latest: ScenarioVote, current: ScenarioVote) => 
                    new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
                  );
                  setLastVoteTime(latestVote.timestamp);
                }
                
                // Check for tiebreaker after initial votes are loaded
                const totalVotesCast = allVotes.length;
                const totalActiveSlots = partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length;
                const allHaveVoted = totalVotesCast >= totalActiveSlots;
                
                const allVoteCounts = updatedScenarios.map((s: AdventureScenario) => updatedVoteCounts[s.id] || 0);
                const maxVotes = Math.max(...allVoteCounts, 0);
                const tiedScenarios = updatedScenarios.filter((s: AdventureScenario) => (updatedVoteCounts[s.id] || 0) === maxVotes);
                const hasClearWinner = tiedScenarios.length === 1 && maxVotes > 0;
                const regenerateVoteCount = Object.values(updatedUserVotes).filter(vote => vote === 'REGENERATE').length;
                const totalVotesCastForRegen = allVotes.length;
                const regenerateMajority = regenerateVoteCount > totalVotesCastForRegen / 2;
                
                const needsTiebreakerNow = allHaveVoted && !regenerateMajority && !hasClearWinner && maxVotes > 0;
                
                console.log('[INITIAL VOTES] Tiebreaker check after loading:', {
                  allHaveVoted,
                  regenerateMajority,
                  hasClearWinner,
                  maxVotes,
                  needsTiebreakerNow,
                  voteCounts: updatedVoteCounts,
                  userVotes: updatedUserVotes
                });
                
                if (needsTiebreakerNow && !showDiceRoll && !isInitializingDice) {
                  console.log('[INITIAL VOTES] Automatically showing tiebreaker dice roller');
                  setShowDiceRoll(true);
                }
              }
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch initial votes:", error);
      }
    };
    
    // Fetch initial votes immediately
    fetchInitialVotes();
    
    const interval = setInterval(async () => {
      try {
        console.log(`[SCENARIO SELECTOR] Polling for votes in room ${initialRoomCode}`);
        const response = await fetch(`/api/room/votes?roomCode=${encodeURIComponent(initialRoomCode)}`);
        console.log(`[SCENARIO SELECTOR] Vote polling response status: ${response.status}`);
        
        if (response.ok) {
          const data = await response.json();
          const voteUpdates = data.votes || [];
          
          console.log(`[SCENARIO SELECTOR] Received ${voteUpdates.length} vote updates`);
          console.log(`[POLLING] Vote data:`, voteUpdates);
          
          // Update vote counts if there are changes
          if (voteUpdates.length > 0) {
            console.log(`[POLLING] Received ${voteUpdates.length} vote updates:`, voteUpdates);
            console.log(`[POLLING] Current voteCounts before update:`, voteCounts);
            
            // Update vote counts by scenario
            const updatedVoteCounts: Record<string, number> = { ...voteCounts };
            voteUpdates.forEach((vote: ScenarioVote) => {
              updatedVoteCounts[vote.scenarioId] = (updatedVoteCounts[vote.scenarioId] || 0) + 1;
            });
            console.log(`[POLLING] Updated voteCounts:`, updatedVoteCounts);
            setVoteCounts(updatedVoteCounts);
            
            // Update userVotes state based on the new vote data - COMPLETELY REPLACE with loaded votes
            const updatedUserVotes: Record<number, string | null> = {};
            voteUpdates.forEach((vote: ScenarioVote) => {
              if (vote.slotIndex !== undefined && vote.userId === currentUserId) {
                updatedUserVotes[vote.slotIndex] = vote.scenarioId;
              }
            });
            console.log(`[POLLING] Updated userVotes (complete replacement):`, updatedUserVotes);
            setUserVotes(updatedUserVotes);
            
            // Store all vote objects for display
            setAllVotes(voteUpdates);
            
            // Refresh scenarios to get latest vote counts and userVotes
            const scenariosResponse = await fetch(`/api/room/scenarios?roomCode=${encodeURIComponent(initialRoomCode)}`);
            if (scenariosResponse.ok) {
              const scenariosData = await scenariosResponse.json();
              const updatedScenarios = scenariosData.scenarios || [];
              
              if (updatedScenarios.length > 0) {
                setDisplayedScenarios(updatedScenarios);
                
                // Show notification for new votes
                const newVotes = voteUpdates.filter((vote: ScenarioVote) => 
                  new Date(vote.timestamp) > new Date(lastVoteTime)
                );
                
                if (newVotes.length > 0) {
                  const voteMessages = newVotes.map((vote: ScenarioVote) => {
                    const scenario = updatedScenarios.find((s: AdventureScenario) => s.id === vote.scenarioId);
                    const scenarioTitle = scenario ? scenario.title : 'Unknown Scenario';
                    
                    // Get the correct character information for the vote
                    const slotInfo = partySlots[vote.slotIndex] || {};
                    const characterId = slotInfo.characterId;
                    const character = partyCharacters.find(c => c.id === characterId);
                    const characterName = character?.name || slotInfo.characterName || slotInfo.username || `Player ${vote.slotIndex}`;
                    
                    // Debug logging for vote toast
                    console.log('[VOTE TOAST] Vote notification:', {
                      voteSlotIndex: vote.slotIndex,
                      voteUserId: vote.userId,
                      slotInfoCharacterId: characterId,
                      foundCharacter: character ? { id: character.id, name: character.name } : null,
                      fallbackName: slotInfo.characterName || slotInfo.username || `Player ${vote.slotIndex}`,
                      finalCharacterName: characterName,
                      scenarioTitle,
                      currentUserId
                    });
                    
                    // Additional debug for character mismatch in toast
                    if (characterId && !character) {
                      console.warn('[VOTE TOAST] Character not found in partyCharacters:', {
                        characterId,
                        slotInfo,
                        availableCharacters: partyCharacters.map(c => ({ id: c.id, name: c.name })),
                        voteData: { slotIndex: vote.slotIndex, userId: vote.userId }
                      });
                    }
                    
                    return `${characterName} (Slot ${vote.slotIndex}) voted for "${scenarioTitle}"`;
                  });
                  
                  if (voteMessages.length > 0) {
                    showToast(`New votes: ${voteMessages.join(', ')}`, 'info');
                  }
                }
                
                // Update last vote time
                if (voteUpdates.length > 0) {
                  const latestVote = voteUpdates.reduce((latest: ScenarioVote, current: ScenarioVote) => 
                    new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
                  );
                  setLastVoteTime(latestVote.timestamp);
                }
              }
            }
          }
        } else {
          console.error(`[SCENARIO SELECTOR] Failed to fetch votes, status: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to fetch votes:', error);
      }
    }, 1000); // Poll every 1 second for real-time updates
    
    return () => {
      console.log(`[SCENARIO SELECTOR] Stopping vote polling for room ${initialRoomCode}`);
      clearInterval(interval);
    };
  }, [initialRoomCode, adventureStarted, voteCounts, lastVoteTime, userVotes, showToast]); // Added dependencies
  
  // Find the scenario with the most votes
  const winningScenario = currentScenarios?.length ? currentScenarios.reduce((prev, current) => {
    const prevVotes = voteCounts[prev.id] || 0;
    const currentVotes = voteCounts[current.id] || 0;
    return currentVotes > prevVotes ? current : prev;
  }) : null;
  
  // Get all vote counts to check for ties
  const allVoteCounts = currentScenarios?.map(s => voteCounts[s.id] || 0) || [];
  const maxVotes = Math.max(...allVoteCounts, 0);
  const tiedScenarios = currentScenarios?.filter(s => (voteCounts[s.id] || 0) === maxVotes) || [];
  const hasClearWinner = tiedScenarios.length === 1 && maxVotes > 0;
  
  // For tiebreaker logic, we need to know the maximum possible votes (which is totalActiveSlots)
  const maxPossibleVotes = totalActiveSlots;
  
  // Determine if we should show "Start Your Adventure" button
  const shouldShowStartAdventure: boolean = allHaveVoted && !regenerateMajority && hasClearWinner;
  
  // Tiebreaker logic for scenarios with no clear winner
  const needsTiebreaker: boolean = allHaveVoted && !regenerateMajority && !hasClearWinner && maxPossibleVotes > 0;
  
  // Determine winning scenario for display
  const winningScenarioForDisplay = useMemo(() => {
    if (!shouldShowStartAdventure || !currentScenarios || currentScenarios.length === 0) {
      return null;
    }
    
    if (needsTiebreaker && diceRollComplete && winningScenarioFromDice) {
      return winningScenarioFromDice;
    }
    
    // Find scenario with most votes
    const tiedScenarios = currentScenarios.filter(s => voteCounts[s.id] === maxVotes);
    if (tiedScenarios.length === 1) {
      return tiedScenarios[0];
    }
    
    return null;
  }, [shouldShowStartAdventure, needsTiebreaker, diceRollComplete, winningScenarioFromDice, currentScenarios, maxVotes, voteCounts]);
  
  // Debug logging for tiebreaker logic
  useEffect(() => {
    console.log('Tiebreaker debug:', {
      allHaveVoted,
      regenerateMajority,
      hasClearWinner,
      maxVotes,
      needsTiebreaker,
      voteCounts,
      userVotes,
      totalActiveSlots,
      totalVotesCast,
      tiedScenarios: currentScenarios?.filter(s => (voteCounts[s.id] || 0) === maxVotes).map(s => ({ id: s.id, title: s.title, votes: voteCounts[s.id] || 0 }))
    });
  }, [allHaveVoted, regenerateMajority, hasClearWinner, maxVotes, needsTiebreaker, voteCounts, userVotes, currentScenarios, totalActiveSlots, totalVotesCast]);
  
  // Debug logging
  console.log('Voting debug:', {
    allHaveVoted,
    regenerateMajority,
    hasClearWinner,
    maxVotes,
    tiedScenarios: tiedScenarios.length,
    needsTiebreaker,
    voteCounts,
    userVotes,
    allVotes: allVotes.map(vote => ({
      scenarioId: vote.scenarioId,
      slotIndex: vote.slotIndex,
      userId: vote.userId,
      timestamp: vote.timestamp
    }))
  });

  

  // Check if we need to show tiebreaker on page load
  useEffect(() => {
    if (needsTiebreaker && !showDiceRoll && !isInitializingDice) {
      console.log('[TIEBREAKER] Tiebreaker detected on page load, showing dice roller');
      console.log('[TIEBREAKER] Debug:', { 
        allHaveVoted, 
        regenerateMajority, 
        hasClearWinner, 
        maxVotes, 
        needsTiebreaker, 
        voteCounts: Object.keys(voteCounts).map(key => ({ 
          scenarioId: key, 
          voteCount: voteCounts[key] || 0 
        })), 
        userVotes 
      });
      setShowDiceRoll(true);
    }
  }, [needsTiebreaker, showDiceRoll, isInitializingDice, allHaveVoted, regenerateMajority, hasClearWinner, maxVotes, voteCounts, userVotes]);

  // Auto-show tiebreaker when the last vote is cast and there's a tie
  useEffect(() => {
    console.log('[TIEBREAKER] Last vote cast check:', {
      allHaveVoted,
      needsTiebreaker,
      maxVotes,
      hasClearWinner,
      tiedScenarios: currentScenarios?.filter(s => (voteCounts[s.id] || 0) === maxVotes).map(s => s.title)
    });
    
    // When all votes are cast and there's a tie, automatically show the dice roller
    if (allHaveVoted && needsTiebreaker && !showDiceRoll && !isInitializingDice) {
      console.log('[TIEBREAKER] Auto-showing dice roller after last vote cast');
      setShowDiceRoll(true);
      
      // Also automatically start dice rolling for a seamless experience
      if (isHost) {
        handleTiebreakerDiceRoll();
      }
    }
  }, [allHaveVoted, needsTiebreaker, showDiceRoll, isInitializingDice, isHost, currentScenarios, voteCounts]);

  // Additional check when voting state is updated
  useEffect(() => {
    if (allHaveVoted && maxPossibleVotes > 0 && !regenerateMajority && !hasClearWinner) {
      console.log('[TIEBREAKER] Voting state updated - tiebreaker conditions met');
      console.log('[TIEBREAKER] Debug:', { 
        allHaveVoted, 
        regenerateMajority, 
        hasClearWinner, 
        maxVotes, 
        maxPossibleVotes, 
        needsTiebreaker, 
        voteCounts: Object.keys(voteCounts).map(key => ({ 
          scenarioId: key, 
          voteCount: voteCounts[key] || 0 
        })), 
        userVotes 
      });
      if (!showDiceRoll && !isInitializingDice) {
        setShowDiceRoll(true);
      }
    }
  }, [allHaveVoted, regenerateMajority, hasClearWinner, maxVotes, maxPossibleVotes, showDiceRoll, isInitializingDice, voteCounts, userVotes, needsTiebreaker]);

  // Check for tiebreaker when vote polling completes (after initial load)
  useEffect(() => {
    if (initialRoomCode && adventureStarted && !showDiceRoll && !isInitializingDice) {
      // Check if we have enough vote data and all players have voted
      if (allHaveVoted && maxPossibleVotes > 0 && !regenerateMajority && !hasClearWinner) {
        console.log('[TIEBREAKER] Initial vote polling complete - tiebreaker conditions met');
        console.log('[TIEBREAKER] Debug:', { 
          allHaveVoted, 
          regenerateMajority, 
          hasClearWinner, 
          maxVotes, 
          maxPossibleVotes, 
          needsTiebreaker, 
          voteCounts: Object.keys(voteCounts).map(key => ({ 
            scenarioId: key, 
            voteCount: voteCounts[key] || 0 
          })), 
          userVotes 
        });
        setShowDiceRoll(true);
      }
    }
  }, [initialRoomCode, adventureStarted, allHaveVoted, regenerateMajority, hasClearWinner, maxVotes, maxPossibleVotes, showDiceRoll, isInitializingDice, voteCounts, userVotes, needsTiebreaker]);

  // Automatically submit when all dice rolls are complete
  useEffect(() => {
    console.log('Dice completion check:', {
      diceRollsCount: Object.keys(diceRolls).length,
      totalActiveSlots,
      diceRollComplete,
      diceRolls
    });
    
    if (Object.keys(diceRolls).length === totalActiveSlots && totalActiveSlots >= 0 && !diceRollComplete) {
      console.log('All dice rolls complete, setting diceRollComplete to true');
      const timer = setTimeout(() => {
        setDiceRollComplete(true);
      }, 2000); // 2 second delay to show results before auto-submit
      
      return () => clearTimeout(timer);
    }
  }, [diceRolls, totalActiveSlots, diceRollComplete]);

  // Auto-submit scenario selection when dice roll is complete
  useEffect(() => {
    console.log('[SCENARIO SELECTOR] Auto-submit check:', {
      diceRollComplete,
      diceState: diceState ? diceState.status : 'null',
      totalActiveSlots,
      diceRollsCount: Object.keys(diceRolls).length,
      scenarioSelectionInProgress
    });
    
    if (diceRollComplete && diceState && diceState.status === 'completed' && !scenarioSelectionInProgress) {
      console.log('[SCENARIO SELECTOR] Auto-submitting scenario selection from dice tiebreaker');
      getWinningScenarioFromDiceRoll().then(winningScenario => {
        if (winningScenario) {
          console.log('[SCENARIO SELECTOR] Dice winner scenario:', { id: winningScenario.id, title: winningScenario.title });
          setWinningScenarioFromDice(winningScenario);
          setAdventureStarted(true);
          handleSelectScenario(winningScenario);
        } else {
          console.warn('[SCENARIO SELECTOR] Could not determine winning scenario from dice roll');
        }
      });
    }
  }, [diceRollComplete, diceState, diceRolls, totalActiveSlots, getWinningScenarioFromDiceRoll, handleSelectScenario, scenarioSelectionInProgress]);

  // If countdown is showing, display countdown overlay
  if (showCountdown) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gray-900">
        <div className="flex flex-col items-center justify-center">
          <div className="text-center">
            <h1 className="text-6xl font-medieval text-red-500 mb-8">Get Ready!</h1>
            <div className="text-9xl font-bold text-yellow-400 mb-8 animate-pulse">
              {countdown}
            </div>
            <p className="text-2xl text-gray-300">Prepare your adventure...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gray-900">
      <div className="w-full max-w-4xl bg-black bg-opacity-70 p-8 rounded-lg border border-gray-700 shadow-lg text-white">
        
        {/* Host Controls */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            {isHost && roomCode && (
              <button 
                onClick={async () => {
                  try {
                    // Reset room status back to lobby
                    const formData = new FormData();
                    formData.append('intent', 'resetRoomStatus');
                    formData.append('roomCode', roomCode);
                    
                    const response = await fetch('/game', {
                      method: 'POST',
                      body: formData
                    });
                    
                    if (response.ok) {
                      console.log(`[SCENARIO SELECTOR] Room ${roomCode} status reset to lobby by host`);
                    }
                  } catch (error) {
                    console.error('Failed to reset room status:', error);
                  }
                  
                  // Navigate back to room
                  window.location.href = `/game?roomCode=${roomCode}`;
                }}
                className="bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg transition duration-200 ease-in-out shadow-lg hover:shadow-xl"
              >
                ← Back to Room Setup
              </button>
            )}
          </div>
          <div className="text-gray-400 text-sm">
            {roomCode && `Room: ${roomCode}`}
          </div>
        </div>

        <h2 className="text-5xl font-medieval text-red-500 text-center mb-8">Choose Your Adventure!</h2>

        <div className="mb-8">
          <h3 className="text-3xl font-medieval text-red-400 mb-4">Campaign Duration & Theme</h3>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row gap-4 items-center">
              <label htmlFor="duration-select" className="text-lg text-gray-300 w-full sm:w-auto">Duration:</label>
              <select
                id="duration-select"
                value={selectedDuration}
                onChange={handleDurationChange}
                className="flex-grow p-3 bg-gray-700 text-white rounded-md border border-gray-600 focus:outline-none focus:border-red-500 text-lg"
                disabled={isGenerating}
              >
                <option value="Short">Short Campaign (30 min - 1 hr)</option>
                <option value="Medium">Medium Campaign (1 hr - 3 hrs)</option>
                <option value="Long">Long Campaign (3 hrs+)</option>
              </select>
            </div>

            <textarea
              className="w-full p-3 bg-gray-700 border border-gray-600 rounded-md text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 text-lg"
              rows={3}
              placeholder="Optional: Describe a custom theme or setting (e.g., 'A quest focused on political intrigue in a desert city'). This will influence all 4 generated scenarios. You can also use this field to suggest scenarios that will be broadcast to all players."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              disabled={isGenerating}
            ></textarea>

            {isHost ? (
              <button
                onClick={() => {
                  // Call the triggerAutoGenerate function which is already properly implemented
                  triggerAutoGenerate();
                }}
                className="bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-md text-xl transition duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={isGenerating}
              >
                {isGenerating ? 'Generating Scenarios...' : partySlots.length > 1 && regenerateVoteCount > 0 ? `Generate 4 Adventure Scenarios (${regenerateVoteCount}/${totalActiveSlots} votes for regeneration)` : 'Generate 4 Adventure Scenarios'}
              </button>
            ) : (
              <div className="space-y-4">
                <button
                  onClick={handleSuggestScenario}
                  className="bg-blue-700 hover:bg-blue-600 text-white font-bold py-3 px-6 rounded-md text-xl transition duration-200 ease-in-out"
                >
                  Broadcast Suggestion
                </button>
                <p className="text-gray-400 text-sm">Wait for the host to generate scenarios or broadcast your idea to the group using the field above</p>
              </div>
            )}
            
            {/* DEBUG INFO: Show host status and room details */}
            <div className="mt-4 p-3 bg-gray-700 rounded-md border border-gray-600">
              <div className="text-sm font-semibold text-gray-300 mb-2">Debug Info:</div>
              <div className="text-xs text-gray-400 space-y-1">
                <div>isHost: <span className={isHost ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{isHost.toString()}</span></div>
                <div>roomCode: <span className="text-yellow-400">{roomCode || 'null'}</span></div>
                <div>partySlots.length: <span className="text-yellow-400">{partySlots.length}</span></div>
                <div>currentUserId: <span className="text-yellow-400">{currentUserId || 'null'}</span></div>
              </div>
            </div>
          </div>
        </div>

        {/* Host Controls - Always visible for host */}
        {isHost && (
          <div className="mb-6 flex justify-between items-center border-t border-gray-600 pt-6">
            <div>
              <button 
                onClick={async () => {
                  try {
                    const formData = new FormData();
                    formData.append('intent', 'resetRoomStatus');
                    formData.append('roomCode', roomCode || '');
                    
                    const response = await fetch('/game', {
                      method: 'POST',
                      body: formData
                    });
                    
                    if (response.ok) {
                      console.log(`[SCENARIO SELECTOR] Room ${roomCode} status reset to lobby by host before generation`);
                    }
                  } catch (error) {
                    console.error('Failed to reset room status before generation:', error);
                  }
                  
                  // Navigate back to room
                  window.location.href = `/game?roomCode=${roomCode}`;
                }}
                className="bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg transition duration-200 ease-in-out shadow-lg hover:shadow-xl"
              >
                ← Back to Room Setup
              </button>
            </div>
            <div className="text-gray-400 text-sm">
              {roomCode && `Room: ${roomCode}`}
            </div>
          </div>
        )}

        {!interfaceReady ? (
          <div className="text-center text-gray-400 text-xl mt-8">
            <p>Initializing scenario selector...</p>
          </div>
        ) : isGenerating ? (
          <div className="text-center text-red-300 text-2xl mt-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-400 mb-4"></div>
            <p>Summoning the spirits of adventure...</p>
            <p className="text-yellow-300 text-sm mt-2">This may take 30-60 seconds. Please wait while scenarios are generated.</p>
            <p className="text-gray-400 text-xs mt-2">OpenRouter is processing your request...</p>
          </div>
        ) : fetcher.data?.error ? (
          <div className="text-center text-red-500 text-xl mt-8">
            <p>Error: {fetcher.data.error}</p>
            <p>Please try again or simplify your custom prompt.</p>
          </div>
        ) : currentScenarios && currentScenarios.length > 0 ? (
          <div className="mt-8">
            <h3 className="text-3xl font-medieval text-red-400 text-center mb-6">Available Scenarios</h3>
            
            {/* Party voting info */}
            {partySlots.length > 1 && (
              <div className="text-center mb-6 text-lg text-yellow-300">
                <p>Votes Cast: {totalVotesCast}/{totalActiveSlots} | Your Votes: {userVotesCast}/{userActiveSlots}</p>
                <p className="text-sm text-gray-400">You control {userActiveSlots} slot(s): {userSlotIndices.join(', ')}</p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {currentScenarios.map((scenario) => {
                const voteCount = voteCounts[scenario.id] || 0;
                return (
                  <div key={scenario.id} className="bg-gray-800 p-5 rounded-lg border border-gray-600 flex flex-col justify-between relative">
                    {/* Vote count badge - top right corner */}
                    {partySlots.length > 1 && (
                      <div className="absolute top-3 right-3 bg-yellow-400 text-black font-bold rounded-full w-8 h-8 flex items-center justify-center text-sm">
                        {voteCount}
                      </div>
                    )}
                    
                    {/* Show detailed voting information */}
                    {partySlots.length > 1 && (
                      <div className="mt-2 space-y-1">
                        {/* Show vote count and who voted */}
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-400">Votes: {voteCount}</span>
                          <span className="text-xs text-green-400">You have {userActiveSlots - userVotesCast} votes left</span>
                        </div>
                        
                        {/* Show who voted for this scenario with timestamps */}
                        <div className="text-xs text-gray-400">
                          {allVotes.filter(vote => vote.scenarioId === scenario.id).length > 0 ? (
                            allVotes
                              .filter(vote => vote.scenarioId === scenario.id)
                              .map((vote: ScenarioVote, index: number) => {
                                const timeAgo = new Date(vote.timestamp).toLocaleTimeString();
                                const slotInfo = partySlots[vote.slotIndex] || {};
                                
                                // Get the correct character information - FIXED: Use character name from partyCharacters if available, otherwise use slot fallback
                                const characterId = slotInfo.characterId;
                                const character = partyCharacters.find(c => c.id === characterId);
                                
                                // FIXED: Always prioritize the fallback name from slot data since it's more reliable
                                // The characterId might not match between slots and partyCharacters due to data consistency issues
                                const characterName = slotInfo.characterName 
                                  ? slotInfo.characterName 
                                  : (character ? character.name : (slotInfo.username || `Player ${vote.slotIndex}`));
                                
                                // Debug logging
                                console.log('[VOTE DISPLAY] Vote lookup:', {
                                  voteSlotIndex: vote.slotIndex,
                                  voteUserId: vote.userId,
                                  slotInfoCharacterId: characterId,
                                  foundCharacter: character ? { id: character.id, name: character.name } : null,
                                  slotCharacterName: slotInfo.characterName,
                                  slotUsername: slotInfo.username,
                                  finalCharacterName: characterName,
                                  currentUserId,
                                  isCurrentUser: vote.userId === currentUserId
                                });
                                
                                // Additional debug for character mismatch - show warning if characterId exists but character not found and no fallback name is available
                                if (characterId && !character && !slotInfo.characterName) {
                                  console.warn('[VOTE DISPLAY] Character not found in partyCharacters and no fallback name from slot:', {
                                    characterId,
                                    slotInfo,
                                    availableCharacters: partyCharacters.map(c => ({ id: c.id, name: c.name })),
                                    voteData: { slotIndex: vote.slotIndex, userId: vote.userId }
                                  });
                                }
                                
                                return (
                                  <span key={index} className={`inline-block px-2 py-1 rounded mr-1 mb-1 ${
                                    vote.userId === currentUserId 
                                      ? 'bg-green-200 text-green-900 border border-green-400' 
                                      : 'bg-blue-200 text-blue-900 border border-blue-400'
                                  }`}>
                                    {characterName} (Slot {vote.slotIndex}) • {timeAgo}
                                  </span>
                                );
                              })
                          ) : (
                            <span className="text-gray-500">No votes yet</span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div>
                      <h4 className="text-2xl font-medieval text-green-400 mb-2 pr-10">{scenario.title}</h4>
                      <p className="text-gray-300 text-sm mb-2"><strong>Environment:</strong> {scenario.surrounding}</p>
                      <p className="text-gray-300 text-sm mb-4"><strong>Objective:</strong> {scenario.objective}</p>
                      {scenario.possibleEncounters && scenario.possibleEncounters.length > 0 && (
                        <div className="mb-2">
                          <strong className="text-gray-400">Encounters:</strong>
                          <ul className="list-disc list-inside text-xs text-gray-300">
                            {scenario.possibleEncounters.slice(0, 3).map((encounter: string, index: number) => (
                              <li key={index}>{encounter}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {scenario.possibleEnemies && scenario.possibleEnemies.length > 0 && (
                        <div className="mb-2">
                          <strong className="text-gray-400">Enemies:</strong>
                          <ul className="list-disc list-inside text-xs text-gray-300">
                            {scenario.possibleEnemies.slice(0, 3).map((enemy: string, index: number) => (
                              <li key={index}>{enemy}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {scenario.bossFight && (
                        <div className="mb-2">
                          <strong className="text-gray-400">Boss:</strong>
                          <p className="text-xs text-gray-300">{scenario.bossFight.name} ({scenario.bossFight.description})</p>
                        </div>
                      )}
                    </div>

                    {partySlots.length > 1 ? (
                      <button
                        onClick={() => {
                          // Find first unvoted slot owned by current user and vote
                          for (const slotIndex of userSlotIndices) {
                            if (!userVotes[slotIndex]) {
                              handleVoteScenario(slotIndex, scenario.id);
                              return;
                            }
                          }
                        }}
                        disabled={userHasCompletedVoting}
                        className={`mt-4 w-full font-bold py-2 px-4 rounded-md transition duration-200 ease-in-out ${
                          userVotesCast > 0
                            ? 'bg-yellow-600 text-white'
                            : userHasCompletedVoting
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-blue-700 hover:bg-blue-600 text-white'
                        }`}
                      >
                        {userVotesCast > 0 ? `✓ Voted (${userVotesCast}/${userActiveSlots})` : 'Vote for This Adventure'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSelectScenario(scenario)}
                        className="mt-4 w-full bg-green-700 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-md transition duration-200 ease-in-out"
                      >
                        Start This Adventure
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Regenerate scenarios option for multi-party - only show when all active slots have voted */}
            {partySlots.length > 1 && allHaveVoted && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => {
                    // Find first unvoted slot owned by current user and vote to regenerate
                    for (const slotIndex of userSlotIndices) {
                      if (!userVotes[slotIndex]) {
                        handleVoteRegenerate(slotIndex);
                        return;
                      }
                    }
                  }}
                  disabled={userHasCompletedVoting}
                  className={`font-bold py-3 px-6 rounded-lg transition duration-200 ease-in-out ${
                    regenerationVotes > 0
                      ? 'bg-orange-600 text-white'
                      : userHasCompletedVoting
                      ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                      : 'bg-orange-700 hover:bg-orange-600 text-white'
                  }`}
                >
                  {regenerationVotes > 0 ? `✓ You Voted to Regenerate` : `Vote to Regenerate Scenarios`}
                </button>
                
                {/* Show regenerate status */}
                {regenerationVotes > 0 && (
                  <div className="mt-2 text-orange-300 text-sm">
                    {regenerationVotes}/{totalActiveSlots} votes to regenerate scenarios
                  </div>
                )}
              </div>
            )}

            {/* "Start Your Adventure" button when everyone has voted */}
            {shouldShowStartAdventure && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => {
                    if (winningScenarioForDisplay) {
                      setAdventureStarted(true);
                      handleSelectScenario(winningScenarioForDisplay);
                    }
                  }}
                  className="bg-green-700 hover:bg-green-600 text-white font-bold py-4 px-8 rounded-lg transition duration-200 ease-in-out text-2xl"
                >
                  🚀 Start Your Adventure!
                </button>
                
                {winningScenarioForDisplay && (
                  <div className="mt-4 p-4 bg-green-900 bg-opacity-30 rounded-lg border border-green-600">
                    <h4 className="text-lg font-semibold text-green-400 mb-2">Selected Scenario:</h4>
                    <p className="text-green-300">{winningScenarioForDisplay.title}</p>
                    <p className="text-sm text-green-400 mt-1">With {voteCounts[winningScenarioForDisplay.id] || 0} vote(s)</p>
                  </div>
                )}
              </div>
            )}
            
            {/* Regeneration button when majority votes to regenerate */}
            {regenerateMajority && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => {
                    if (!activeCharacter) {
                      alert("Active character data is missing. Cannot generate scenarios.");
                      return;
                    }
                    const formData = new FormData();
                    formData.append('intent', 'generateScenarios');
                    formData.append('duration', selectedDuration);
                    formData.append('activeCharacter', JSON.stringify(activeCharacter));
                    formData.append('partyCharacters', JSON.stringify(partyCharacters));
                    formData.append('partySlots', JSON.stringify(partySlots));
                    if (customPrompt.trim()) {
                      formData.append('regenerationPrompt', customPrompt.trim());
                    }
                    // Add uniqueness parameter to ensure always unique scenarios
                    formData.append('unique', 'true');
                    // Force generation to replace stored scenarios
                    formData.append('forceNewGeneration', 'true');
                    // Force generation to replace any existing scenarios
                    formData.append('forceNewGeneration', 'true');
                    fetcher.submit(formData, { method: 'post', action: '/game' });
                  }}
                  disabled={isGenerating}
                  className="bg-purple-700 hover:bg-purple-600 text-white font-bold py-4 px-8 rounded-lg transition duration-200 ease-in-out text-lg"
                >
                  {isGenerating ? 'Generating New Scenarios...' : `🔄 Generate New Scenarios (Majority Voted)`}
                </button>
                
                <div className="mt-2 text-purple-300">
                  Majority ({regenerateVoteCount}/{totalActiveSlots}) voted to regenerate scenarios
                </div>
              </div>
            )}
            
            {/* Tie-breaking dice roll for unresolved votes */}
            {needsTiebreaker && (
              <div className="mt-8 text-center">
                <div className="mb-4 p-4 bg-yellow-900 bg-opacity-30 rounded-lg border border-yellow-600">
                  <h4 className="text-lg font-semibold text-yellow-400">Tie-Breaking Required</h4>
                  <p className="text-yellow-300">No scenario has a clear majority. Rolling dice to determine the winner...</p>
                </div>
                
                {/* Show dice rolling status */}
                {showDiceRoll && (
                  <div className="text-sm text-gray-300">
                    {isInitializingDice ? 'Initializing dice rolling...' : 'Dice rolling in progress...'}
                  </div>
                )}
                
                {/* Debug button to test dice loading */}
                <div className="mt-4">
                  <button
                    onClick={() => {
                      console.log('Testing dice library loading...');
                      console.log('DICE object:', typeof (window as unknown as {DICE?: object}).DICE);
                      if ((window as unknown as {DICE?: object}).DICE) {
                        console.log('DICE.dice_box:', typeof (window as unknown as {DICE?: {dice_box?: object}}).DICE?.dice_box);
                      }
                    }}
                    className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded text-sm"
                  >
                    Debug Dice Loading
                  </button>
                  
                  {/* Manual dice roll test */}
                  <button
                    onClick={() => {
                      console.log('Manual dice roll test...');
                      setDiceRolls({0: 15, 1: 8}); // Simulate results
                      setDiceRollComplete(true);
                    }}
                    className="bg-green-700 hover:bg-green-600 text-white font-bold py-2 px-4 rounded text-sm ml-2"
                  >
                    Test Dice Results
                  </button>
                </div>
              </div>
            )}
            
            {/* 3D Dice Roller for tiebreaker */}
            {needsTiebreaker && showDiceRoll && (
              <div className="mt-8" style={{ zIndex: 10000, backgroundColor: 'transparent' }}>
                <div className="text-center mb-6">
                  <h3 className="text-3xl font-medieval text-yellow-400 mb-2">🎲 Rolling for Destiny...</h3>
                  <p className="text-lg text-yellow-300">Each player rolls a die to break the tie</p>
                  {diceState && diceState.players.length > 0 && (
                    <div className="mt-4 bg-yellow-900 bg-opacity-30 rounded-lg p-4 inline-block">
                      <div className="text-yellow-300 font-semibold mb-2">Tied Scenarios:</div>
                      <div className="text-yellow-200 text-sm">
                        {currentScenarios
                          .filter(s => (voteCounts[s.id] || 0) === maxVotes)
                          .map(s => s.title)
                          .join(' vs ')}
                      </div>
                    </div>
                  )}
                </div>
                
                {isInitializingDice && (
                  <div className="mb-4 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-400"></div>
                    <p className="mt-2 text-yellow-300 text-sm">Initializing dice rolling...</p>
                  </div>
                )}
                
                                  {diceState && (
                                    <>
                                    {console.log('[SCENARIO SELECTOR] Rendering DiceBoxDirect - conditions', { needsTiebreaker, showDiceRoll, isInitializingDice, diceStatePresent: !!diceState })}
                                    <DiceBoxDirect
                                      players={diceState.players.map(player => ({
                                        slotIndex: player.slotIndex,
                                        characterName: player.characterName,
                                        userId: player.userId,
                                        hasRolled: diceState.rolls[player.slotIndex] !== undefined,
                                        result: diceState.rolls[player.slotIndex]
                                      }))}
                                      currentUserId={currentUserId}
                                      diceState={diceState}
                                      onPlayerRollComplete={onPlayerRollComplete}
                                    />
                                    </>                )}
                
                {!diceState && !isInitializingDice && (
                  <div className="text-center text-gray-400">
                    Waiting for dice rolling to start...
                  </div>
                )}
                
                {diceState && diceState.status === 'completed' && (
                  <div className="text-center mt-6">
                    <div className="bg-green-600 text-white font-bold py-3 px-6 rounded-lg inline-block mb-4">
                      🎉 Winner: {diceState.players[diceState.winner!]?.characterName} rolled {diceState.rolls[diceState.winner!]}!
                    </div>
                    {(() => {
                      const winningScenario = winningScenarioFromDice;
                      if (winningScenario) {
                        return (
                          <div className="mb-4">
                            <div className="text-lg font-semibold">Starting: {winningScenario.title}</div>
                            <div className="text-sm text-gray-600 mb-4">{winningScenario.mapDescription}</div>
                          </div>
                        );
                      } else {
                        return (
                          <div className="mb-4 text-yellow-600">
                            Winner did not vote for a scenario. Please select manually.
                          </div>
                        );
                      }
                    })()}
                    <div className="flex gap-4 justify-center">
                      <button
                        onClick={() => {
                          if (scenarioSelectionInProgress) {
                            showToast('Scenario selection is already in progress.', 'info');
                            return;
                          }

                          const winningScenario = winningScenarioFromDice;
                          if (winningScenario) {
                            setAdventureStarted(true);
                            setScenarioSelectionInProgress(true);
                            handleSelectScenario(winningScenario);
                          } else {
                            // No winner available — reset dice and allow manual selection
                            setDiceRolls({});
                            setDiceRollComplete(false);
                          }
                        }}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-6 rounded-lg text-lg"
                      >
                        Next: Map Generation
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : currentScenarios && currentScenarios.length === 0 && !isGenerating ? (
          <div className="text-center text-gray-400 text-xl mt-8">
            <p>Select a campaign duration and click Generate 4 Adventure Scenarios to begin!</p>
          </div>
        ) : (
          <div className="text-center text-gray-400 text-xl mt-8">
            <p>Preparing scenario interface...</p>
          </div>
        )}
      </div>
      
      {roomCode && (
        <div className="mt-6 p-4 bg-gray-700 rounded-lg border border-gray-600">
          <div className="flex justify-between items-center mb-3">
            <h4 className="text-lg font-semibold text-gray-300">Recent Suggestions</h4>
            <button
              onClick={() => setIsChatOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded text-sm transition-colors"
            >
              💬 Open Chat
            </button>
          </div>
          {recentSuggestions.length === 0 ? (
            <p className="text-gray-400">No suggestions yet. Be the first to suggest a scenario!</p>
          ) : (
            <div className="space-y-2">
              {recentSuggestions.slice(0, 3).map((suggestion) => (
                <div key={suggestion.id} className="bg-gray-800 p-3 rounded border border-gray-600">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-yellow-400 font-semibold">{suggestion.username}</span>
                      <span className="text-gray-400 text-sm ml-2">
                        {new Date(suggestion.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                  <p className="text-gray-300 mt-1">“{suggestion.message}”</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Chat Window */}
      {roomCode && isChatOpen && (
        <ChatWindow
          roomCode={roomCode}
          currentUserId={currentUserId}
          currentUsername={partySlots.find(s => s.userId === currentUserId)?.username || 'Unknown Player'}
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
        />
      )}
    </div>
  );
}
