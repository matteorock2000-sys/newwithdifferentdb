// FIX FOR ACTIVE SLOTS DETECTION AND VOTE COUNTING
// This ensures the system correctly detects active slots and calculates max votes

// The issue is in how totalActiveSlots and userActiveSlots are calculated

// CURRENT PROBLEM:
// - partySlots: Array(4) exists
// - But only 2 are detected as active
// - maxVotes: 0 instead of actual vote count
// - allHaveVoted: false when it should be based on actual votes

// FIX 1: Ensure totalActiveSlots is calculated correctly

/*
  // In the ScenarioSelector component, find where totalActiveSlots is calculated
  // It should be:
  
  const totalActiveSlots = useMemo(() => 
    partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length,
    [partySlots]
  );
  
  // But it might need to also check if slots have users assigned
  const totalActiveSlots = useMemo(() => 
    partySlots.filter(slot => 
      (slot.type === 'Human' || slot.type === 'AI') && 
      slot.userId !== undefined && 
      slot.userId !== null
    ).length,
    [partySlots]
  );
*/

// FIX 2: Ensure userActiveSlots is calculated correctly

/*
  const userActiveSlots = useMemo(() => 
    partySlots.filter(slot => 
      (slot.type === 'Human' || slot.type === 'AI') && 
      slot.userId === currentUserId
    ).length,
    [partySlots, currentUserId]
  );
*/

// FIX 3: Ensure allHaveVoted is calculated correctly

/*
  const allVotesCast = useMemo(() => {
    const scenarioVotesCount = scenarioVotes.length;
    const regenerateVotesCount = regenerationVotes;
    const totalVotesCast = scenarioVotesCount + regenerateVotesCount;
    return totalVotesCast >= totalActiveSlots;
  }, [scenarioVotes, regenerationVotes, totalActiveSlots]);
*/

// FIX 4: Add debugging to see what's happening

/*
  useEffect(() => {
    console.log('[ACTIVE SLOTS DEBUG]', {
      partySlots: partySlots.map((s, i) => ({ 
        index: i, 
        type: s.type, 
        userId: s.userId,
        username: s.username 
      })),
      totalActiveSlots,
      userActiveSlots,
      userVotesCount: Object.keys(userVotes).length,
      scenarioVotesCount: scenarioVotes.length,
      regenerationVotesCount: regenerationVotes
    });
  }, [partySlots, totalActiveSlots, userActiveSlots, userVotes, scenarioVotes, regenerationVotes]);
*/

// THE CORE ISSUE:
// The system needs to correctly identify:
// 1. Which slots are active (Human/AI with userId)
// 2. Which slots belong to current user
// 3. How many votes have been cast vs max possible

console.log('Apply these fixes to correctly detect active slots and calculate max votes');
