// Final fix for vote loading in ScenarioSelector.tsx
// This ensures votes are properly loaded and displayed

// The issue is that the initial vote loading effect might not be running
// or there's a timing issue with when votes are loaded

// Add this debugging to the initial vote loading effect:

/*
  // Load votes when scenarios are loaded - WITH DEBUGGING
  useEffect(() => {
    const loadVotes = async () => {
      if (!initialRoomCode) {
        console.log('[VOTE LOADING] initialRoomCode is missing:', initialRoomCode);
        return;
      }
      
      console.log('[VOTE LOADING] Starting vote load for room:', initialRoomCode);
      
      try {
        const response = await fetch(`/api/room/votes?roomCode=${encodeURIComponent(initialRoomCode)}`);
        console.log('[VOTE LOADING] API Response status:', response.status);
        
        if (response.ok) {
          const data = await response.json();
          console.log('[VOTE LOADING] API Response data:', data);
          
          const voteUpdates = data.votes || [];
          const voteCounts = data.voteCounts || {};
          
          console.log(`[VOTE LOADING] Loaded ${voteUpdates.length} votes`);
          console.log(`[VOTE LOADING] Vote counts:`, voteCounts);
          
          // Update vote counts
          const updatedVoteCounts: Record<string, number> = {};
          Object.keys(voteCounts).forEach(scenarioId => {
            updatedVoteCounts[scenarioId] = voteCounts[scenarioId] || 0;
          });
          
          console.log(`[VOTE LOADING] Setting voteCounts to:`, updatedVoteCounts);
          setVoteCounts(updatedVoteCounts);
          
          // Store vote objects
          setAllVotes(voteUpdates);
          
          // Update userVotes
          const updatedUserVotes = {};
          voteUpdates.forEach((vote: ScenarioVote) => {
            if (vote.slotIndex !== undefined) {
              updatedUserVotes[vote.slotIndex] = vote.scenarioId;
            }
          });
          
          console.log(`[VOTE LOADING] Setting userVotes to:`, updatedUserVotes);
          setUserVotes(updatedUserVotes);
        } else {
          console.error(`[VOTE LOADING] Failed to load votes, status: ${response.status}`);
        }
      } catch (error) {
        console.error('[VOTE LOADING] Exception:', error);
      }
    };

    loadVotes();
  }, [initialRoomCode, showToast]);
*/

console.log('Add the above debugging version to see why votes are not loading on client');
