// Quick fix for ScenarioSelector vote loading
// Apply this patch to fix vote loading issues

// Replace the duplicate vote loading effects with this single effect:

/*
  // Load votes when scenarios are loaded - SINGLE EFFECT to avoid duplication
  useEffect(() => {
    const loadVotes = async () => {
      if (!initialRoomCode) return;
      
      try {
        console.log(`[SCENARIO SELECTOR] Loading votes for room ${initialRoomCode}`);
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
  }, [initialRoomCode, showToast]);
*/

console.log('Apply the above single vote loading effect to ScenarioSelector.tsx to replace duplicate effects');
