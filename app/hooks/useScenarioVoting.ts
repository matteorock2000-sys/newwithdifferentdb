import { useState, useEffect, useCallback, useMemo } from 'react';
import { useFetcher, FetcherWithComponents } from '@remix-run/react';
import type { Character, ScenarioForDisplay, PlayerSlot, ScenarioVote, UseScenarioVotingReturn } from '~/types';
import { useGlobalToast } from '~/utils/toast';
import { subscribeToRoomChanges } from '~/services/realtime.client';
import { logger } from '~/utils/logger';
import { retryOperation } from '~/utils/retry';
import { createErrorResponse } from '~/utils/errors';

export function useScenarioVoting({
  activeCharacter,
  partySlots = [],
  currentUserId = '',
  roomCode = '',
  initialScenarios = null,
  onScenariosGenerated,
}: {
  activeCharacter: Character | null;
  partyCharacters?: Character[];
  partySlots?: PlayerSlot[];
  currentUserId?: string;
  roomCode?: string;
  initialScenarios?: ScenarioForDisplay[] | null;
  onScenariosGenerated?: (scenarios: ScenarioForDisplay[]) => void;
}): UseScenarioVotingReturn {
  const { showToast } = useGlobalToast();
  const voteFetcher: FetcherWithComponents<{ success: boolean; message?: string }> = useFetcher();
  const scenarioFetcher: FetcherWithComponents<{ scenarios: ScenarioForDisplay[] }> = useFetcher();
  
  const [userVotes, setUserVotes] = useState<Record<number, string | null>>({});
  const [scenarioVotes, setScenarioVotes] = useState<Record<string, ScenarioVote[]>>({});
  const [regenerationVotes, setRegenerationVotes] = useState(0);
  const [votesLoaded, setVotesLoaded] = useState(false);
  const [votesError, setVotesError] = useState(false);
  const [displayedScenarios, setDisplayedScenarios] = useState<ScenarioForDisplay[] | null>(initialScenarios);
  const [selectedDuration, setSelectedDuration] = useState<string>('Short');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStage, setGenerationStage] = useState<'analyzing' | 'generating' | 'finalizing' | null>(null);

  // Derived state
  const userSlotIndices = useMemo(() => 
    partySlots.map((s, i) => s.userId === currentUserId ? i : -1).filter(i => i !== -1), 
    [partySlots, currentUserId]
  );

  const userActiveSlots = useMemo(() => 
    partySlots.filter(slot => (slot.type === 'Human' || slot.type === 'AI') && slot.userId === currentUserId).length,
    [partySlots, currentUserId]
  );

  const userVotesCount = useMemo(() => 
    Object.keys(userVotes).length,
    [userVotes]
  );

  const userRegenerateVotesCount = useMemo(() => 
    Object.values(userVotes).filter(vote => vote === 'REGENERATE').length,
    [userVotes]
  );

  const totalVotesCast = useMemo(() => {
    const scenarioVotesCount = Object.values(scenarioVotes).reduce((sum, votes) => sum + votes.length, 0);
    const regenerateVotesCount = regenerationVotes;
    return scenarioVotesCount + regenerateVotesCount;
  }, [scenarioVotes, regenerationVotes]);

  const totalActiveSlots = useMemo(() => 
    partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length,
    [partySlots]
  );

  const allSlotsVoted = useMemo(() => 
    totalVotesCast >= totalActiveSlots,
    [totalVotesCast, totalActiveSlots]
  );

  const userCanStillVote = useMemo(() => 
    userVotesCount < userActiveSlots,
    [userVotesCount, userActiveSlots]
  );

  const userHasCompletedVoting = useMemo(() => 
    (userVotesCount + userRegenerateVotesCount) >= userActiveSlots,
    [userVotesCount, userRegenerateVotesCount, userActiveSlots]
  );

  const regenerateMajority = useMemo(() => 
    regenerationVotes > totalActiveSlots / 2,
    [regenerationVotes, totalActiveSlots]
  );

  const winningScenario = useMemo(() => {
    if (!displayedScenarios || displayedScenarios.length === 0) return null;
    
    let maxVotes = 0;
    let winningScenarioId = null;
    
    for (const scenario of displayedScenarios) {
      const voteCount = (scenarioVotes[scenario.id] || []).length;
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        winningScenarioId = scenario.id;
      }
    }
    
    if (!winningScenarioId) return null;
    
    // Check for tie
    const tieCount = displayedScenarios.filter(s => 
      (scenarioVotes[s.id] || []).length === maxVotes
    ).length;
    
    if (tieCount > 1) {
      return null; // Tie detected
    }
    
    return displayedScenarios.find(s => s.id === winningScenarioId) || null;
  }, [displayedScenarios, scenarioVotes]);

  const needsTiebreaker = useMemo(() => {
    if (!displayedScenarios || displayedScenarios.length === 0) return false;
    
    let maxVotes = 0;
    let winningScenarioId = null;
    
    for (const scenario of displayedScenarios) {
      const voteCount = (scenarioVotes[scenario.id] || []).length;
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        winningScenarioId = scenario.id;
      }
    }
    
    if (!winningScenarioId) return false;
    
    // Check for tie between scenarios with same max votes
    const tieCount = displayedScenarios.filter(s => 
      (scenarioVotes[s.id] || []).length === maxVotes
    ).length;
    
    // Check if we have 3 or 4 players voting for 3 or 4 different scenarios (each with 1 vote)
    const scenariosWithOneVote = displayedScenarios.filter(s => 
      (scenarioVotes[s.id] || []).length === 1
    ).length;
    
    const totalActiveSlots = partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length;
    const totalVotesCast = Object.values(scenarioVotes).reduce((sum, votes) => sum + votes.length, 0);
    
    // Trigger tiebreaker if:
    // 1. There's a tie between scenarios with same max votes, OR
    // 2. We have 3 or 4 players and they voted for 3 or 4 different scenarios (each with 1 vote)
    const multipleScenariosWithOneVote = scenariosWithOneVote >= 3 && 
                                        scenariosWithOneVote === totalActiveSlots && 
                                        totalVotesCast === totalActiveSlots;
    
    return tieCount > 1 || multipleScenariosWithOneVote;
  }, [displayedScenarios, scenarioVotes, partySlots]);

  const tiedScenarios = useMemo(() => {
    if (!displayedScenarios || displayedScenarios.length === 0) return null;
    
    let maxVotes = 0;
    
    for (const scenario of displayedScenarios) {
      const voteCount = (scenarioVotes[scenario.id] || []).length;
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
      }
    }
    
    if (maxVotes === 0) return null;
    
    const tied = displayedScenarios.filter(s => 
      (scenarioVotes[s.id] || []).length === maxVotes
    );
    
    // Check if we have 3 or 4 players voting for 3 or 4 different scenarios (each with 1 vote)
    const scenariosWithOneVote = displayedScenarios.filter(s => 
      (scenarioVotes[s.id] || []).length === 1
    ).length;
    
    const totalActiveSlots = partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length;
    const totalVotesCast = Object.values(scenarioVotes).reduce((sum, votes) => sum + votes.length, 0);
    
    const multipleScenariosWithOneVote = scenariosWithOneVote >= 3 && 
                                        scenariosWithOneVote === totalActiveSlots && 
                                        totalVotesCast === totalActiveSlots;
    
    // Return tied scenarios if there's a tie OR if multiple scenarios have one vote each
    return (tied.length > 1 || multipleScenariosWithOneVote) ? tied : null;
  }, [displayedScenarios, scenarioVotes, partySlots]);

  const isClearWinner = useMemo(() => {
    return !needsTiebreaker && !!winningScenario;
  }, [needsTiebreaker, winningScenario]);

  const shouldShowStartAdventure = useMemo(() => {
    return allSlotsVoted && !needsTiebreaker && !!winningScenario;
  }, [allSlotsVoted, needsTiebreaker, winningScenario]);

  // Load votes from server
  useEffect(() => {
    if (!roomCode) return;
    
    const loadVotes = async () => {
      try {
        const response = await fetch(`/api/room/votes?roomCode=${encodeURIComponent(roomCode)}`);
        if (!response.ok) throw new Error('Failed to load votes');
        
        const data = await response.json();
        setScenarioVotes(data.scenarioVotes || {});
        setRegenerationVotes(data.regenerationVotes || 0);
        setVotesLoaded(true);
        setVotesError(false);
      } catch (error) {
        logger.error('Failed to load votes', { error });
        
        // Use standardized error message
        const errorResponse = createErrorResponse("NETWORK_TIMEOUT", "Failed to load votes initially");
        showToast(errorResponse.error.userMessage, "error");
        
        setVotesError(true);
        setVotesLoaded(true);
      }
    };
    
    loadVotes();
  }, [roomCode, showToast]);

  // Subscribe to room changes with retry
  useEffect(() => {
    if (!roomCode) return;
    
    const unsubscribe = subscribeToRoomChanges(roomCode, (changes) => {
      if (changes.type === 'votes_updated') {
        setScenarioVotes(changes.data.scenarioVotes || {});
        setRegenerationVotes(changes.data.regenerationVotes || 0);
      } else if (changes.type === 'scenarios_updated') {
        setDisplayedScenarios(changes.data.scenarios ?? null);
        showToast('Scenarios have been updated!', 'info');
      }
    });
    
    return unsubscribe;
  }, [roomCode, showToast]);

  // Add offline detection and retry logic
  useEffect(() => {
    const handleOnline = () => {
      showToast("Connection restored", "success");
      // Reload votes when back online
      if (roomCode) {
        const loadVotes = async () => {
          try {
            const response = await retryOperation(
              () => fetch(`/api/room/votes?roomCode=${encodeURIComponent(roomCode)}`),
              {
                maxAttempts: 3,
                delayMs: 1000,
                shouldRetry: (error: Error) => error?.message?.includes("network")
              }
            );
            
            if (!response.ok) throw new Error("Failed to load votes");
            
            const data = await response.json();
            setScenarioVotes(data.scenarioVotes || {});
            setRegenerationVotes(data.regenerationVotes || 0);
            setVotesLoaded(true);
            setVotesError(false);
          } catch (error) {
            logger.error("Failed to load votes after reconnect", { error });
            
            // Use standardized error message
            const errorResponse = createErrorResponse("NETWORK_TIMEOUT", "Failed to load votes after reconnect");
            showToast(errorResponse.error.userMessage, "error");
            
            setVotesError(true);
            setVotesLoaded(true);
          }
        };
        
        loadVotes();
      }
    };

    const handleOffline = () => {
      showToast("Connection lost. Changes will sync when back online.", "warning");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [roomCode, showToast]);

  // Handle vote scenario
  const handleVoteScenario = useCallback((slotIndex: number, scenarioId: string) => {
    if (!currentUserId || !roomCode) return;
    
    const slot = partySlots[slotIndex];
    if (!slot || slot.userId !== currentUserId) {
      showToast('You can only vote for your own slots', 'error');
      return;
    }
    
    if (userVotes[slotIndex]) {
      showToast('This slot has already voted', 'error');
      return;
    }
    
    setUserVotes(prev => ({ ...prev, [slotIndex]: scenarioId }));
    
    const formData = new FormData();
    formData.append('intent', 'voteScenario');
    formData.append('roomCode', roomCode);
    formData.append('slotIndex', slotIndex.toString());
    formData.append('scenarioId', scenarioId);
    formData.append('userId', currentUserId);
    
    voteFetcher.submit(formData, { method: 'post', action: '/api/room/votes' });
  }, [currentUserId, roomCode, partySlots, userVotes, voteFetcher, showToast]);

  // Handle vote regenerate
  const handleVoteRegenerate = useCallback((slotIndex: number) => {
    if (!currentUserId || !roomCode) return;
    
    const slot = partySlots[slotIndex];
    if (!slot || slot.userId !== currentUserId) {
      showToast('You can only vote for your own slots', 'error');
      return;
    }
    
    if (userVotes[slotIndex]) {
      showToast('This slot has already voted', 'error');
      return;
    }
    
    setUserVotes(prev => ({ ...prev, [slotIndex]: 'REGENERATE' }));
    
    const formData = new FormData();
    formData.append('intent', 'voteRegenerate');
    formData.append('roomCode', roomCode);
    formData.append('slotIndex', slotIndex.toString());
    formData.append('userId', currentUserId);
    
    voteFetcher.submit(formData, { method: 'post', action: '/api/room/votes' });
  }, [currentUserId, roomCode, partySlots, userVotes, voteFetcher, showToast]);

  // Clear votes
  const clearVotes = useCallback(() => {
    setUserVotes({});
    setScenarioVotes({});
    setRegenerationVotes(0);
  }, []);

  // Handle suggest scenario
  const handleSuggestScenario = useCallback(() => {
    if (!roomCode || !customPrompt.trim()) return;
    
    const formData = new FormData();
    formData.append('intent', 'suggestScenario');
    formData.append('roomCode', roomCode);
    formData.append('prompt', customPrompt);
    formData.append('userId', currentUserId || '');
    
    scenarioFetcher.submit(formData, { method: 'post', action: '/api/room/suggestions' });
  }, [roomCode, customPrompt, currentUserId, scenarioFetcher]);

  // Handle generate scenarios
  const handleGenerateScenarios = useCallback(() => {
    if (!roomCode || !activeCharacter) return;
    
    // Start progress tracking
    setIsGenerating(true);
    setGenerationProgress(0);
    setGenerationStage('analyzing');
    
    // Simulate progress during generation
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += 10;
      setGenerationProgress(Math.min(progress, 70)); // Cap at 70% until response
      if (progress >= 70) {
        clearInterval(progressInterval);
      }
    }, 500);
    
    // Update stage
    setTimeout(() => setGenerationStage('generating'), 1500);
    
    const formData = new FormData();
    formData.append('intent', 'generateScenarios');
    formData.append('roomCode', roomCode);
    formData.append('character', JSON.stringify(activeCharacter));
    formData.append('duration', selectedDuration);
    formData.append('prompt', customPrompt);
    
    scenarioFetcher.submit(formData, { method: 'post', action: '/api/room/scenarios' });
    
    // Cleanup progress on completion (handled in useEffect)
  }, [roomCode, activeCharacter, selectedDuration, customPrompt, scenarioFetcher]);

  // Handle duration change
  const handleDurationChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setSelectedDuration(e.target.value);
  }, []);

  // Handle custom prompt change
  const handleCustomPromptChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomPrompt(e.target.value);
  }, []);

  // Handle scenarios generated
  useEffect(() => {
    if (scenarioFetcher.data?.scenarios) {
      setDisplayedScenarios(scenarioFetcher.data.scenarios);
      onScenariosGenerated?.(scenarioFetcher.data.scenarios);
      clearVotes();
      
      // Complete progress animation
      setGenerationStage('finalizing');
      setGenerationProgress(100);
      setTimeout(() => {
        setIsGenerating(false);
        setGenerationProgress(0);
        setGenerationStage(null);
      }, 1000);
    }
  }, [scenarioFetcher.data, onScenariosGenerated, clearVotes]);

  // Handle scenario fetcher loading state
  useEffect(() => {
    setIsGenerating(scenarioFetcher.state !== 'idle');
  }, [scenarioFetcher.state]);

  return {
    scenarios: displayedScenarios,
    tiedScenarios,
    userVotes,
    scenarioVotes,
    regenerationVotes,
    votesLoaded,
    votesError,
    generationProgress,
    generationStage,
    userActiveSlots,
    userSlotIndices,
    userVotesCount,
    userRegenerateVotesCount,
    totalVotesCast,
    allSlotsVoted,
    userCanStillVote,
    userHasCompletedVoting,
    winningScenario,
    needsTiebreaker,
    isClearWinner,
    shouldShowStartAdventure,
    regenerateMajority,
    isGenerating,
    selectedDuration,
    customPrompt,
    handleVoteScenario,
    handleVoteRegenerate,
    handleSuggestScenario,
    handleGenerateScenarios,
    handleDurationChange,
    handleCustomPromptChange,
    clearVotes,
  };
}
