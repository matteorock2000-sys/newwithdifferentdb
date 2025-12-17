// Manual fix for ScenarioSelector.tsx vote loading
// This file contains the corrected vote loading logic

// The key changes needed:
// 1. Remove duplicate vote loading effects
// 2. Ensure votes are loaded when scenarios are loaded
// 3. Add proper error handling for page reloads
// 4. Ensure user's previous votes are restored

// The corrected vote loading logic should look like this:

/*
  // Load scenarios and votes together when room code changes - MAIN EFFECT
  useEffect(() => {
    const loadScenariosAndVotes = async () => {
      if (!initialRoomCode) return;
      
      try {
        console.log(`[SCENARIO SELECTOR] Loading scenarios and votes for room ${initialRoomCode}`);
        
        // First, load scenarios with vote counts
        const scenariosResponse = await fetch(`/api/room/scenarios?roomCode=${encodeURIComponent(initialRoomCode)}`);
        
        if (scenariosResponse.ok) {
          const scenariosData = await scenariosResponse.json();
          const scenarios = scenariosData.scenarios || [];
          
          console.log(`[SCENARIO SELECTOR] Loaded ${scenarios.length} scenarios with vote counts from room ${initialRoomCode}`);
          
          if (scenarios.length > 0) {
            setDisplayedScenarios(scenarios);
            
            // Extract vote counts from scenarios for consistency
            const scenarioVoteCounts: Record<string, number> = {};
            scenarios.forEach(scenario => {
              scenarioVoteCounts[scenario.id] = scenario.votes || 0;
            });
            
            console.log(`[SCENARIO SELECTOR] Scenario vote counts:`, scenarioVoteCounts);
            setVoteCounts(scenarioVoteCounts);
          }
        } else {
          console.error(`[SCENARIO SELECTOR] Failed to load scenarios, status: ${scenariosResponse.status}`);
        }
        
        // Second, load detailed vote information for userVotes and display
        const votesResponse = await fetch(`/api/room/votes?roomCode=${encodeURIComponent(initialRoomCode)}`);
        
        if (votesResponse.ok) {
          const votesData = await votesResponse.json();
          const voteUpdates = votesData.votes || [];
          const votesGrouped = votesData.votesGrouped || {};
          
          console.log(`[SCENARIO SELECTOR] Loaded ${voteUpdates.length} detailed votes from room ${initialRoomCode}`);
          
          // Update vote counts using grouped data for better accuracy
          const updatedVoteCounts: Record<string, number> = {};
          Object.keys(votesGrouped).forEach(scenarioId => {
            updatedVoteCounts[scenarioId] = votesGrouped[scenarioId].length;
          });
          
          // Only update if vote counts have changed
          const voteCountsChanged = Object.keys(updatedVoteCounts).some(
            key => updatedVoteCounts[key] !== voteCounts[key]
          ) || Object.keys(voteCounts).some(
            key => !(key in updatedVoteCounts)
          );
          
          if (voteCountsChanged) {
            console.log(`[VOTES LOADED] Updated voteCounts:`, updatedVoteCounts);
            setVoteCounts(updatedVoteCounts);
          }
          
          // Store all vote objects for display
          setAllVotes(voteUpdates);
          
          // Update userVotes state based on the vote data
          const updatedUserVotes = {};
          voteUpdates.forEach((vote: ScenarioVote) => {
            if (vote.slotIndex !== undefined) {
              updatedUserVotes[vote.slotIndex] = vote.scenarioId;
            }
          });
          console.log(`[SCENARIO SELECTOR] Updated userVotes from votes API:`, updatedUserVotes);
          setUserVotes(updatedUserVotes);
          
        } else {
          console.error(`[SCENARIO SELECTOR] Failed to load votes, status: ${votesResponse.status}`);
        }
        
      } catch (error) {
        console.error('Failed to load scenarios and votes:', error);
      }
    };

    loadScenariosAndVotes();
  }, [initialRoomCode, showToast]);

  // Poll for scenarios every 2 seconds to ensure vote counts are in sync
  useEffect(() => {
    if (!initialRoomCode) return;
    
    console.log(`[SCENARIO SELECTOR] Starting scenario polling to sync vote counts for room ${initialRoomCode}`);
    
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/room/scenarios?roomCode=${encodeURIComponent(initialRoomCode)}`);
        
        if (response.ok) {
          const data = await response.json();
          const newScenarios = data.scenarios || [];
          
          // Update scenarios if they changed
          if (newScenarios.length > 0) {
            setDisplayedScenarios(newScenarios);
            
            // Update vote counts from scenarios to ensure persistence
            const updatedVoteCounts: Record<string, number> = {};
            newScenarios.forEach(scenario => {
              updatedVoteCounts[scenario.id] = scenario.votes || 0;
            });
            
            // Only update if vote counts have changed
            const voteCountsChanged = Object.keys(updatedVoteCounts).some(
              key => updatedVoteCounts[key] !== voteCounts[key]
            ) || Object.keys(voteCounts).some(
              key => !(key in updatedVoteCounts)
            );
            
            if (voteCountsChanged) {
              console.log(`[SCENARIO SELECTOR] Vote counts updated from scenarios:`, updatedVoteCounts);
              setVoteCounts(updatedVoteCounts);
            }
          }
        } else {
          console.error(`[SCENARIO SELECTOR] Failed to fetch scenarios for vote sync, status: ${response.status}`);
        }
      } catch (error) {
        console.error('Failed to fetch scenarios for vote sync:', error);
      }
    }, 2000); // Poll every 2 seconds
    
    return () => {
      console.log(`[SCENARIO SELECTOR] Stopping scenario polling for vote sync`);
      clearInterval(interval);
    };
  }, [initialRoomCode, voteCounts]);
*/

console.log('Manual fix for ScenarioSelector.tsx vote loading created');
console.log('Copy the above code and replace the existing vote loading effects in ScenarioSelector.tsx');
