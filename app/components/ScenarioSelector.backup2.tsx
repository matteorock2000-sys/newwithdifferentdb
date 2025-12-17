import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useFetcher } from '@remix-run/react';
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
  isHost?: boolean;
}

export default function ScenarioSelector({ 
  scenarios, 
  activeCharacter, 
  showCountdown: initialShowCountdown, 
  partyCharacters = [], 
  partySlots = [], 
  currentUserId = '', 
  roomCode: initialRoomCode = null, 
  isHost = false 
}: ScenarioSelectorProps) {
  const { showToast } = useGlobalToast();
  
  // Fetchers for different operations
  const fetcher = useFetcher();
  const voteFetcher = useFetcher();
  const scenarioFetcher = useFetcher();
  const diceFetcher = useFetcher();

  // Core voting state - simplified and consistent
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>({});
  const [userVotes, setUserVotes] = useState<Record<number, string | null>>({});
  const [regenerationVotes, setRegenerationVotes] = useState<number>(0);
  const [allVotes, setAllVotes] = useState<ScenarioVote[]>([]);
  
  // UI state
  const [displayedScenarios, setDisplayedScenarios] = useState<ScenarioForDisplay[] | null>(scenarios);
  const [showCountdown, setShowCountdown] = useState(initialShowCountdown || false);
  const [countdown, setCountdown] = useState(5);
  const [selectedDuration, setSelectedDuration] = useState<string>('Short');
  const [customPrompt, setCustomPrompt] = useState<string>('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  
  // Dice rolling state
  const [diceState, setDiceState] = useState<DiceRollingState | null>(null);
  const [diceRolls, setDiceRolls] = useState<Record<number, number>>({});
  const [showDiceRoll, setShowDiceRoll] = useState(false);
  const [isInitializingDice, setIsInitializingDice] = useState(false);
  const [diceRollComplete, setDiceRollComplete] = useState(false);
  
  // Room state
  const [roomCode, setRoomCode] = useState<string | null>(initialRoomCode);
  const [adventureStarted, setAdventureStarted] = useState(false);
  const [scenarioSelectionInProgress, setScenarioSelectionInProgress] = useState(false);
  const [diceSelectionApplied, setDiceSelectionApplied] = useState(false);

  // Derived state
  const isGenerating = fetcher.state !== 'idle';
  const totalActiveSlots = useMemo(() => 
    partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length, 
    [partySlots]
  );
  
  const userActiveSlots = useMemo(() => 
    partySlots.filter(slot => 
      (slot.type === 'Human' || slot.type === 'AI') && slot.userId === currentUserId
    ).length,
    [partySlots, currentUserId]
  );
  
  const userSlotIndices = useMemo(() => 
    partySlots
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => (slot.type === 'Human' || slot.type === 'AI') && slot.userId === currentUserId)
      .map(({ index }) => index),
    [partySlots, currentUserId]
  );

  // Vote calculations - FIXED: Proper calculations
  const userVotesCast = useMemo(() => 
    Object.values(userVotes).filter(vote => vote !== null).length,
    [userVotes]
  );

  const totalVotesCast = useMemo(() => {
    // Calculate from voteCounts (which is what we actually display)
    const scenarioVotes = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);
    return scenarioVotes + regenerationVotes;
  }, [voteCounts, regenerationVotes]);

  const regenerateVoteCount = regenerationVotes;
  const allHaveVoted = totalVotesCast >= totalActiveSlots;
  const regenerateMajority = regenerateVoteCount > totalVotesCast / 2;
  const userHasCompletedVoting = userVotesCast >= userActiveSlots;

  // Auto-generate scenarios on first load when in countdown mode
  useEffect(() => {
    if (showCountdown && !displayedScenarios && activeCharacter && !isGenerating) {
      const timer = setTimeout(() => {
        triggerAutoGenerate();
      }, 5500);
      return () => clearTimeout(timer);
    }
  }, [showCountdown, displayedScenarios, activeCharacter, isGenerating]);

  const triggerAutoGenerate = useCallback(() => {
    if (!activeCharacter) return;
    
    const formData = new FormData();
    formData.append('intent', 'generateScenarios');
    formData.append('duration', selectedDuration);
    formData.append('activeCharacter', JSON.stringify(activeCharacter));
    formData.append('partyCharacters', JSON.stringify(partyCharacters));
    formData.append('partySlots', JSON.stringify(partySlots));
    
    fetcher.submit(formData, { method: 'post', action: '/game' });
  }, [activeCharacter, selectedDuration, partyCharacters, partySlots, fetcher]);

  // Poll for scenarios and votes - FIXED: Proper state management
  useEffect(() => {
    if (!initialRoomCode) return;

    const pollData = async () => {
      try {
        // Fetch scenarios
        const scenariosResponse = await fetch(`/api/room/scenarios?roomCode=${encodeURIComponent(initialRoomCode)}`);
        if (scenariosResponse.ok) {
          const scenariosData = await scenariosResponse.json();
          const newScenarios = scenariosData.scenarios || [];
          
          if (newScenarios.length > 0 && (!displayedScenarios || newScenarios.length !== displayedScenarios.length)) {
            setDisplayedScenarios(newScenarios);
            if (!isHost) {
              showToast(`Loaded ${newScenarios.length} scenarios from room`, 'info');
            }
          }
        }

        // Fetch votes - FIXED: Consistent with API response
        const votesResponse = await fetch(`/api/room/votes?roomCode=${encodeURIComponent(initialRoomCode)}`);
        if (votesResponse.ok) {
          const votesData = await votesResponse.json();
          const voteUpdates = votesData.votes || [];
          
          if (voteUpdates.length > 0) {
            // Update vote counts - FIXED: Proper counting
            const newVoteCounts: Record<string, number> = {};
            voteUpdates.forEach((vote: ScenarioVote) => {
              newVoteCounts[vote.scenarioId] = (newVoteCounts[vote.scenarioId] || 0) + 1;
            });
            setVoteCounts(newVoteCounts);
            setAllVotes(voteUpdates);

            // Update user votes
            const newUserVotes: Record<number, string | null> = {};
            voteUpdates.forEach((vote: ScenarioVote) => {
              if (vote.slotIndex !== undefined) {
                newUserVotes[vote.slotIndex] = vote.scenarioId;
              }
            });
            setUserVotes(newUserVotes);
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };

    // Initial poll
    pollData();

    // Poll every 1 second
    const interval = setInterval(pollData, 1000);
    return () => clearInterval(interval);
  }, [initialRoomCode, displayedScenarios, isHost, showToast]);

  // Handle voting - FIXED: Proper state updates
  const handleVoteScenario = useCallback((slotIndex: number, scenarioId: string) => {
    // Only allow voting for slots owned by current user
    if (!userSlotIndices.includes(slotIndex)) {
      showToast('You can only vote with your own slots', 'error');
      return;
    }

    // Check if slot already has a vote
    const currentVote = userVotes[slotIndex];
    if (currentVote) {
      showToast('This slot has already voted', 'error');
      return;
    }

    // Update local state optimistically
    setUserVotes(prev => ({ ...prev, [slotIndex]: scenarioId }));
    setVoteCounts(prev => ({ 
      ...prev, 
      [scenarioId]: (prev[scenarioId] || 0) + 1 
    }));

    // Submit to server
    if (roomCode) {
      const formData = new FormData();
      formData.append('intent', 'castVote');
      formData.append('scenarioId', scenarioId);
      formData.append('slotIndex', slotIndex.toString());
      formData.append('roomCode', roomCode);
      formData.append('userId', currentUserId || 'unknown');

      voteFetcher.submit(formData, { method: 'post', action: '/game' });
    }
  }, [userSlotIndices, userVotes, roomCode, currentUserId, voteFetcher]);

  const handleVoteRegenerate = useCallback((slotIndex: number) => {
    // Only allow voting for slots owned by current user
    if (!userSlotIndices.includes(slotIndex)) {
      showToast('You can only vote with your own slots', 'error');
      return;
    }

    // Check if slot already has a vote
    const currentVote = userVotes[slotIndex];
    if (currentVote) {
      showToast('This slot has already voted', 'error');
      return;
    }

    // Update local state
    setUserVotes(prev => ({ ...prev, [slotIndex]: 'REGENERATE' }));
    setRegenerationVotes(prev => prev + 1);

    // Submit to server
    if (roomCode) {
      const formData = new FormData();
      formData.append('intent', 'castVote');
      formData.append('scenarioId', 'REGENERATE');
      formData.append('slotIndex', slotIndex.toString());
      formData.append('roomCode', roomCode);
      formData.append('userId', currentUserId || 'unknown');

      voteFetcher.submit(formData, { method: 'post', action: '/game' });
    }
  }, [userSlotIndices, userVotes, roomCode, currentUserId, voteFetcher]);

  // Handle regeneration when regenerate majority is reached
  useEffect(() => {
    if (regenerateMajority && isHost && roomCode && !isGenerating) {
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
      
      fetcher.submit(formData, { method: 'post', action: '/game' });
    }
  }, [regenerateMajority, isHost, roomCode, selectedDuration, activeCharacter, partyCharacters, partySlots, customPrompt, isGenerating, fetcher]);

  // Tiebreaker logic - FIXED: Proper calculations
  const winningScenario = useMemo(() => {
    if (!displayedScenarios || displayedScenarios.length === 0) return null;
    
    let maxVotes = 0;
    let winningScenarioId = null;
    
    for (const scenario of displayedScenarios) {
      const voteCount = voteCounts[scenario.id] || 0;
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        winningScenarioId = scenario.id;
      }
    }
    
    if (!winningScenarioId) return null;
    
    // Check for tie
    const tieCount = displayedScenarios.filter(s => (voteCounts[s.id] || 0) === maxVotes).length;
    
    if (tieCount > 1) {
      return null; // Tie detected
    }
    
    return displayedScenarios.find(s => s.id === winningScenarioId) || null;
  }, [displayedScenarios, voteCounts]);

  const needsTiebreaker = useMemo(() => {
    if (!displayedScenarios || displayedScenarios.length === 0) return false;
    
    let maxVotes = 0;
    let winningScenarioId = null;
    
    for (const scenario of displayedScenarios) {
      const voteCount = voteCounts[scenario.id] || 0;
      if (voteCount > maxVotes) {
        maxVotes = voteCount;
        winningScenarioId = scenario.id;
      }
    }
    
    if (!winningScenarioId) return false;
    
    // Check for tie between scenarios with same max votes
    const tieCount = displayedScenarios.filter(s => (voteCounts[s.id] || 0) === maxVotes).length;
    
    // Check if we have 3 or 4 players voting for 3 or 4 different scenarios (each with 1 vote)
    const scenariosWithOneVote = displayedScenarios.filter(s => (voteCounts[s.id] || 0) === 1).length;
    const totalActiveSlots = partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length;
    const totalVotesCast = Object.values(voteCounts).reduce((sum, count) => sum + count, 0);
    
    const multipleScenariosWithOneVote = scenariosWithOneVote >= 3 && 
                                        scenariosWithOneVote === totalActiveSlots && 
                                        totalVotesCast === totalActiveSlots;
    
    // Trigger tiebreaker if:
    // 1. There's a tie between scenarios with same max votes, OR
    // 2. We have 3 or 4 players and they voted for 3 or 4 different scenarios (each with 1 vote)
    return tieCount > 1 || multipleScenariosWithOneVote;
  }, [displayedScenarios, voteCounts, partySlots]);

  const shouldShowStartAdventure = useMemo(() => {
    return allHaveVoted && !regenerateMajority && !!winningScenario;
  }, [allHaveVoted, regenerateMajority, winningScenario]);

  // Dice rolling functions
  const handleTiebreakerDiceRoll = useCallback(async () => {
    if (!roomCode) return;
    
    setIsInitializingDice(true);
    setShowDiceRoll(true);
    
    const formData = new FormData();
    formData.append('intent', 'startTiebreakerDice');
    formData.append('roomCode', roomCode);
    formData.append('scenarios', JSON.stringify(displayedScenarios));
    
    diceFetcher.submit(formData, { method: 'post', action: '/api/room/dice' });
  }, [roomCode, displayedScenarios, diceFetcher]);

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

  // Scenario selection
  const handleSelectScenario = useCallback((scenario: ScenarioForDisplay) => {
    if (!activeCharacter) {
      alert("Active character data is missing. Cannot start game.");
      return;
    }

    if (roomCode) {
      const formData = new FormData();
      formData.append('intent', 'startGame');
      formData.append('roomCode', roomCode);
      formData.append('selectedScenarioId', scenario.id);
      
      scenarioFetcher.submit(formData, { method: 'post', action: '/world-map' });
      return;
    }

    // Fallback for non-room scenarios
    const formData = new FormData();
    formData.append('intent', 'selectScenario');
    formData.append('activeCharacter', JSON.stringify(activeCharacter));
    formData.append('selectedScenario', JSON.stringify(scenario)); 
    
    scenarioFetcher.submit(formData, { method: 'post', action: '/game' });
  }, [activeCharacter, roomCode, scenarioFetcher]);

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

  // Handle fetcher responses
  useEffect(() => {
    if (fetcher.data && fetcher.state === 'idle') {
      if (fetcher.data.scenarios) {
        setDisplayedScenarios(fetcher.data.scenarios);
        setUserVotes({});
        setVoteCounts({});
        setRegenerationVotes(0);
      }
    }
  }, [fetcher.data, fetcher.state]);

  useEffect(() => {
    if (voteFetcher.data && voteFetcher.state === 'idle') {
      if (voteFetcher.data.success) {
        showToast(voteFetcher.data.message || 'Vote cast successfully!', 'success');
      } else if (voteFetcher.data.error) {
        showToast(voteFetcher.data.error, 'error');
      }
    }
  }, [voteFetcher.data, voteFetcher.state, showToast]);

  useEffect(() => {
    if (scenarioFetcher.data && scenarioFetcher.state === 'idle') {
      if (scenarioFetcher.data.redirect) {
        window.location.href = scenarioFetcher.data.redirect;
      } else if (scenarioFetcher.data.error) {
        showToast(scenarioFetcher.data.error, 'error');
      }
    }
  }, [scenarioFetcher.data, scenarioFetcher.state, showToast]);

  // Render function
  return (
    <div className="min-h-screen w-full bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-medieval text-red-500 mb-2">Adventure Scenario Selection</h1>
          <div className="flex items-center justify-between">
            <div className="text-gray-300">
              Cast your votes for the adventure you want to embark on!
            </div>
            <div className="flex items-center space-x-4">
              <input
                type="text"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Enter a custom theme or suggestion for the adventure..."
                className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 mr-4"
              />
              <select
                value={selectedDuration}
                onChange={(e) => setSelectedDuration(e.target.value)}
                className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                <option value="Short">Short (1-2 hours)</option>
                <option value="Medium">Medium (2-4 hours)</option>
                <option value="Long">Long (4+ hours)</option>
              </select>
              <button
                onClick={triggerAutoGenerate}
                disabled={isGenerating || allHaveVoted || regenerateMajority}
                className="bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                {isGenerating ? 'Generating...' : 'Generate Scenarios'}
              </button>
              <button
                onClick={() => setIsChatOpen(true)}
                className="bg-blue-700 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                Open Chat
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        {/* Voting Status */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="text-gray-300">
                <span className="font-semibold">Your Slots:</span> {userActiveSlots}
              </div>
              <div className="text-gray-300">
                <span className="font-semibold">Your Votes:</span> {userVotesCast}/{userActiveSlots}
              </div>
              <div className="text-gray-300">
                <span className="font-semibold">Total Votes:</span> {totalVotesCast}/{totalActiveSlots}
              </div>
              <div className="text-gray-300">
                <span className="font-semibold">Regenerate Votes:</span> {regenerateVoteCount}
              </div>
              <div className={`font-semibold ${
                userHasCompletedVoting ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {userHasCompletedVoting ? 'All votes cast!' : 'Continue voting...'}
              </div>
            </div>
            {regenerateMajority && (
              <div className="bg-yellow-900 border border-yellow-600 text-yellow-300 px-4 py-2 rounded-lg">
                Regenerate majority reached! Generating new scenarios...
              </div>
            )}
          </div>
        </div>

        {/* Scenarios */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {displayedScenarios?.map(scenario => (
            <div key={scenario.id} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <h3 className="text-xl font-semibold text-red-400 mb-2">{scenario.title}</h3>
              <p className="text-gray-300 mb-4">{scenario.surrounding}</p>
              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-400">Objective:</span>
                <span className="text-gray-300">{scenario.objective}</span>
              </div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-gray-400">Votes:</span>
                <span className="text-yellow-400 font-bold">{voteCounts[scenario.id] || 0}</span>
              </div>

              {/* Voting Buttons */}
              <div className="space-y-2">
                {partySlots.map((slot, slotIndex) => {
                  const isOwnedByCurrentUser = userSlotIndices.includes(slotIndex);
                  const hasVoted = userVotes[slotIndex] !== undefined;
                  const votedForThisScenario = userVotes[slotIndex] === scenario.id;
                  const slotOwner = slot.username || `Player ${slotIndex}`;

                  return (
                    <div key={slotIndex} className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-gray-300">
                          {slotOwner} {isOwnedByCurrentUser ? '(You)' : ''}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        {votedForThisScenario ? (
                          <span className="bg-green-900 text-green-300 px-2 py-1 rounded text-sm">
                            Voted ✓
                          </span>
                        ) : (
                          <button
                            onClick={() => handleVoteScenario(slotIndex, scenario.id)}
                            disabled={!isOwnedByCurrentUser || hasVoted || allHaveVoted}
                            className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                              !isOwnedByCurrentUser || hasVoted || allHaveVoted
                                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                : 'bg-green-700 hover:bg-green-600 text-white'
                            }`}
                          >
                            Vote
                          </button>
                        )}
                        <span className="text-xs text-gray-400">
                          {hasVoted ? `Voted: ${userVotes[slotIndex]}` : 'Not voted'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Regenerate Option */}
        <div className="mt-8 bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Regenerate Scenarios</h3>
          <p className="text-gray-300 mb-4">
            If none of these scenarios appeal to you, vote to regenerate new ones!
          </p>
          <div className="space-y-2">
            {partySlots.map((slot, slotIndex) => {
              const isOwnedByCurrentUser = userSlotIndices.includes(slotIndex);
              const hasVoted = userVotes[slotIndex] !== undefined;
              const votedForRegenerate = userVotes[slotIndex] === 'REGENERATE';
              const slotOwner = slot.username || `Player ${slotIndex}`;
              
              return (
                <div key={slotIndex} className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">
                    {slotOwner} {isOwnedByCurrentUser ? '(You)' : ''}
                  </span>
                  <div className="flex items-center space-x-2">
                    {votedForRegenerate ? (
                      <span className="bg-red-900 text-red-300 px-2 py-1 rounded text-sm">
                        Regenerate ✓
                      </span>
                    ) : (
                      <button
                        onClick={() => handleVoteRegenerate(slotIndex)}
                        disabled={!isOwnedByCurrentUser || hasVoted || allHaveVoted}
                        className={`px-3 py-1 rounded text-sm font-semibold transition-colors ${
                          !isOwnedByCurrentUser || hasVoted || allHaveVoted
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-red-700 hover:bg-red-600 text-white'
                        }`}
                      >
                        Regenerate
                      </button>
                    )}
                    <span className="text-xs text-gray-400">
                      {hasVoted ? `Voted: ${userVotes[slotIndex]}` : 'Not voted'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tiebreaker Section */}
        {needsTiebreaker && (
          <div className="mt-8 bg-yellow-900 border border-yellow-600 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-yellow-300 mb-2">Tiebreaker Needed</h3>
            <p className="text-yellow-200 mb-4">
              There's a tie! The winner will be determined by a dice roll.
            </p>
            <button
              onClick={handleTiebreakerDiceRoll}
              disabled={showDiceRoll || isInitializingDice}
              className="bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold py-2 px-6 rounded-lg transition-colors"
            >
              {isInitializingDice ? 'Starting Dice Roll...' : 'Start Tiebreaker Dice Roll'}
            </button>
          </div>
        )}

        {/* Start Adventure Button */}
        {shouldShowStartAdventure && winningScenario && (
          <div className="mt-8 bg-green-900 border border-green-600 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-green-300 mb-2">🎉 Scenario Selected!</h3>
            <p className="text-green-200 mb-4">
              All votes are in! The winning scenario is: <strong>{winningScenario.title}</strong>
            </p>
            {isHost ? (
              <button
                onClick={() => handleSelectScenario(winningScenario)}
                disabled={scenarioSelectionInProgress}
                className="bg-blue-700 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                {scenarioSelectionInProgress ? 'Starting Map Generation...' : 'Next: Map Generation'}
              </button>
            ) : (
              <div className="text-blue-200">
                Waiting for host to start map generation...
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {isGenerating && (
          <div className="mt-8 space-y-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-700 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-700 rounded w-full mb-2"></div>
                <div className="h-3 bg-gray-700 rounded w-5/6 mb-2"></div>
                <div className="h-3 bg-gray-700 rounded w-2/3"></div>
              </div>
            </div>
          </div>
        )}
      </div>

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
