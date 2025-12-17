// Script to fix vote loading in ScenarioSelector.tsx
// This script removes duplicate vote loading effects and ensures votes are loaded with scenarios

const fs = require('fs');

const filePath = 'app/components/ScenarioSelector.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// Remove the duplicate vote loading effects and replace with single optimized effect
const oldVoteLoading = `// Load votes when scenarios are loaded
  useEffect(() => {
    const loadVotes = async () => {
      if (!initialRoomCode) return;
      
      try {
        console.log(\`[SCENARIO SELECTOR] Loading votes for room \${initialRoomCode}\`);
        const response = await fetch(\`/api/room/votes?roomCode=\${encodeURIComponent(initialRoomCode)}\`);
        
        if (response.ok) {
          const data = await response.json();
          const voteUpdates = data.votes || [];
          
          console.log(\`[SCENARIO SELECTOR] Loaded \${voteUpdates.length} votes from room \${initialRoomCode}\`);
          console.log(\`[SCENARIO SELECTOR] Vote data:\`, voteUpdates);
          
          // Update vote counts by scenario
          const updatedVoteCounts: Record<string, number> = {};
          voteUpdates.forEach((vote: ScenarioVote) => {
            updatedVoteCounts[vote.scenarioId] = (updatedVoteCounts[vote.scenarioId] || 0) + 1;
          });
          console.log(\`[VOTES LOADED] Updated voteCounts:\`, updatedVoteCounts);
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
          console.log(\`[VOTES LOADED] Updated userVotes:\`, updatedUserVotes);
          setUserVotes(updatedUserVotes);
        } else {
          console.error(\`[SCENARIO SELECTOR] Failed to load votes, status: \${response.status}\`);
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
          console.log(\`[SCENARIO SELECTOR] Loading votes after scenarios loaded for room \${initialRoomCode}\`);
          const response = await fetch(\`/api/room/votes?roomCode=\${encodeURIComponent(initialRoomCode)}\`);
          
          if (response.ok) {
            const data = await response.json();
            const voteUpdates = data.votes || [];
            
            console.log(\`[SCENARIO SELECTOR] Loaded \${voteUpdates.length} votes after scenarios loaded\`);
            console.log(\`[SCENARIO SELECTOR] Vote data after scenarios loaded:\`, voteUpdates);
            
            // Update vote counts by scenario
            const updatedVoteCounts: Record<string, number> = {};
            voteUpdates.forEach((vote: ScenarioVote) => {
              updatedVoteCounts[vote.scenarioId] = (updatedVoteCounts[vote.scenarioId] || 0) + 1;
            });
            console.log(\`[VOTES LOADED] Updated voteCounts after scenarios loaded:\`, updatedVoteCounts);
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
            console.log(\`[VOTES LOADED] Updated userVotes after scenarios loaded:\`, updatedUserVotes);
            setUserVotes(updatedUserVotes);
          } else {
            console.error(\`[SCENARIO SELECTOR] Failed to load votes after scenarios loaded, status: \${response.status}\`);
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
          console.log(\`[SCENARIO SELECTOR] Initial vote load on component mount for room \${initialRoomCode}\`);
          const response = await fetch(\`/api/room/votes?roomCode=\${encodeURIComponent(initialRoomCode)}\`);
          
          if (response.ok) {
            const data = await response.json();
            const voteUpdates = data.votes || [];
            
            console.log(\`[SCENARIO SELECTOR] Initial load: \${voteUpdates.length} votes from room \${initialRoomCode}\`);
            console.log(\`[SCENARIO SELECTOR] Initial vote data:\`, voteUpdates);
            
            // Update vote counts by scenario
            const updatedVoteCounts: Record<string, number> = {};
            voteUpdates.forEach((vote: ScenarioVote) => {
              updatedVoteCounts[vote.scenarioId] = (updatedVoteCounts[vote.scenarioId] || 0) + 1;
            });
            console.log(\`[VOTES LOADED] Initial load - Updated voteCounts:\`, updatedVoteCounts);
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
            console.log(\`[VOTES LOADED] Initial load - Updated userVotes:\`, updatedUserVotes);
            setUserVotes(updatedUserVotes);
          } else {
            console.error(\`[SCENARIO SELECTOR] Failed to load initial votes, status: \${response.status}\`);
          }
        } catch (error) {
          console.error('Failed to load initial votes:', error);
        }
      };

      loadVotes();
    }
  }, [initialRoomCode]);`;

const newVoteLoading = `// Load votes when scenarios are loaded - SINGLE EFFECT to avoid duplication
  useEffect(() => {
    const loadVotes = async () => {
      if (!initialRoomCode) return;
      
      try {
        console.log(\`[SCENARIO SELECTOR] Loading votes for room \${initialRoomCode}\`);
        const response = await fetch(\`/api/room/votes?roomCode=\${encodeURIComponent(initialRoomCode)}\`);
        
        if (response.ok) {
          const data = await response.json();
          const voteUpdates = data.votes || [];
          const votesGrouped = data.votesGrouped || {};
          
          console.log(\`[SCENARIO SELECTOR] Loaded \${voteUpdates.length} votes from room \${initialRoomCode}\`);
          console.log(\`[SCENARIO SELECTOR] Vote data:\`, voteUpdates);
          
          // Update vote counts by scenario using grouped data for better accuracy
          const updatedVoteCounts: Record<string, number> = {};
          Object.keys(votesGrouped).forEach(scenarioId => {
            updatedVoteCounts[scenarioId] = votesGrouped[scenarioId].length;
          });
          console.log(\`[VOTES LOADED] Updated voteCounts:\`, updatedVoteCounts);
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
          console.log(\`[VOTES LOADED] Updated userVotes:\`, updatedUserVotes);
          setUserVotes(updatedUserVotes);
        } else {
          console.error(\`[SCENARIO SELECTOR] Failed to load votes, status: \${response.status}\`);
        }
      } catch (error) {
        console.error('Failed to load votes:', error);
      }
    };

    loadVotes();
  }, [initialRoomCode, showToast]);

  // Load scenarios and votes together when room code changes to ensure persistence on page reload
  useEffect(() => {
    const loadScenariosAndVotes = async () => {
      if (!initialRoomCode) return;
      
      try {
        console.log(\`[SCENARIO SELECTOR] Loading scenarios and votes for room \${initialRoomCode}\`);
        const response = await fetch(\`/api/room/scenarios?roomCode=\${encodeURIComponent(initialRoomCode)}\`);
        
        if (response.ok) {
          const data = await response.json();
          const scenarios = data.scenarios || [];
          
          console.log(\`[SCENARIO SELECTOR] Loaded \${scenarios.length} scenarios with votes from room \${initialRoomCode}\`);
          
          if (scenarios.length > 0) {
            setDisplayedScenarios(scenarios);
            
            // Extract vote counts from scenarios for consistency
            const scenarioVoteCounts: Record<string, number> = {};
            scenarios.forEach(scenario => {
              scenarioVoteCounts[scenario.id] = scenario.votes || 0;
            });
            
            console.log(\`[SCENARIO SELECTOR] Scenario vote counts:\`, scenarioVoteCounts);
            setVoteCounts(scenarioVoteCounts);
            
            // Also load detailed vote information from votes API for userVotes
            const voteResponse = await fetch(\`/api/room/votes?roomCode=\${encodeURIComponent(initialRoomCode)}\`);
            if (voteResponse.ok) {
              const voteData = await voteResponse.json();
              const voteUpdates = voteData.votes || [];
              
              // Update userVotes state based on the vote data
              const updatedUserVotes = {};
              voteUpdates.forEach((vote: ScenarioVote) => {
                if (vote.slotIndex !== undefined) {
                  updatedUserVotes[vote.slotIndex] = vote.scenarioId;
                }
              });
              console.log(\`[SCENARIO SELECTOR] Updated userVotes from scenarios:\`, updatedUserVotes);
              setUserVotes(updatedUserVotes);
              
              // Store all vote objects for display
              setAllVotes(voteUpdates);
            }
          }
        } else {
          console.error(\`[SCENARIO SELECTOR] Failed to load scenarios, status: \${response.status}\`);
        }
      } catch (error) {
        console.error('Failed to load scenarios and votes:', error);
      }
    };

    loadScenariosAndVotes();
  }, [initialRoomCode, showToast]);`;

// Replace the old duplicate effects with the new single effect
content = content.replace(oldVoteLoading, newVoteLoading);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Vote loading effects updated successfully!');
