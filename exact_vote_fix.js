// EXACT FIX FOR SCENARIOSELECTOR VOTE LOADING
// This ensures votes are loaded when the component mounts with scenarios

// The problem is that the initial vote loading effect only depends on [initialRoomCode, showToast]
// but it should also run when scenarios are first loaded

// CHANGE THE DEPENDENCY ARRAY FROM:
// }, [initialRoomCode, showToast]);

// TO:
// }, [initialRoomCode, showToast, displayedScenarios]);

// This ensures the vote loading runs when:
// 1. Room code is available
// 2. Scenarios are loaded (displayedScenarios changes)

// ALSO, ADD A CHECK TO ENSURE SCENARIOS ARE LOADED BEFORE LOADING VOTES:

/*
  // Load votes when scenarios are loaded - FIXED VERSION
  useEffect(() => {
    const loadVotes = async () => {
      if (!initialRoomCode) return;
      
      // Only load votes if scenarios are available
      if (!displayedScenarios || displayedScenarios.length === 0) {
        console.log('[VOTE LOADING] Scenarios not loaded yet, skipping vote load');
        return;
      }
      
      console.log(`[SCENARIO SELECTOR] Loading votes for room ${initialRoomCode} with ${displayedScenarios.length} scenarios`);
      
      try {
        const response = await fetch(`/api/room/votes?roomCode=${encodeURIComponent(initialRoomCode)}`);
        
        if (response.ok) {
          const data = await response.json();
          const voteUpdates = data.votes || [];
          const voteCounts = data.voteCounts || {};
          
          console.log(`[SCENARIO SELECTOR] Loaded ${voteUpdates.length} votes from room ${initialRoomCode}`);
          console.log(`[SCENARIO SELECTOR] Vote counts:`, voteCounts);
          
          // Use vote counts directly from API response
          const updatedVoteCounts: Record<string, number> = {};
          Object.keys(voteCounts).forEach(scenarioId => {
            updatedVoteCounts[scenarioId] = voteCounts[scenarioId] || 0;
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
  }, [initialRoomCode, showToast, displayedScenarios]); // ADDED displayedScenarios dependency
*/

console.log('Apply this exact fix to ensure votes load when scenarios are available');
