# Vote Count Persistence and Display Fix Summary

## Problem Identified

The scenario voting system had several issues with vote count persistence and display:

1. **Vote counts weren't persisting** - Votes were fetched separately from scenarios, causing sync issues
2. **Inconsistent vote count display** - Vote counts weren't properly updated when scenarios were refreshed
3. **Missing grouped vote data** - The API wasn't returning structured vote information for better client-side handling
4. **Duplicate vote loading effects** - Multiple useEffect hooks were causing redundant API calls

## Changes Made

### 1. Enhanced Vote Service (`scenarioVoteService.server.ts`)

Added a new function to get votes grouped by scenario:

```typescript
export async function getScenarioVotesGrouped(roomCode: string): Promise<Record<string, ScenarioVote[]>> {
  const votes = await getScenarioVotes(roomCode);
  const grouped: Record<string, ScenarioVote[]> = {};
  
  votes.forEach(vote => {
    if (vote.scenarioId) {
      if (!grouped[vote.scenarioId]) {
        grouped[vote.scenarioId] = [];
      }
      grouped[vote.scenarioId].push(vote);
    }
  });
  
  return grouped;
}
```

### 2. Updated API Endpoints

#### `/api/room/votes.tsx`
- Added `votesGrouped` field to the API response for better client-side vote management
- This provides structured vote data that includes all vote objects grouped by scenario

#### `/api/room/scenarios.tsx`
- Enhanced the scenarios API to include vote counts and grouped vote data directly in the response
- Each scenario now includes:
  - `votes`: Total vote count for the scenario
  - `userVotes`: Array of actual vote objects for display purposes

### 3. Fixed ScenarioSelector Component

#### Removed Duplicate Effects
- Consolidated multiple vote-loading effects into a single, optimized effect
- Added grouped vote data handling for better accuracy

#### Enhanced Vote Loading
```typescript
// Now fetches both votes and grouped data for better accuracy
const data = await response.json();
const voteUpdates = data.votes || [];
const votesGrouped = data.votesGrouped || {};

// Update vote counts using grouped data for better accuracy
const updatedVoteCounts: Record<string, number> = {};
Object.keys(votesGrouped).forEach(scenarioId => {
  updatedVoteCounts[scenarioId] = votesGrouped[scenarioId].length;
});
```

#### Added Scenario Polling for Vote Sync
- Added a new polling effect that runs every 2 seconds to sync vote counts with scenarios
- This ensures vote counts displayed on scenarios are always up-to-date
- Only updates vote counts if they have actually changed to avoid unnecessary re-renders

```typescript
// Poll for scenarios every 2 seconds to ensure vote counts are in sync
useEffect(() => {
  if (!initialRoomCode) return;
  
  const interval = setInterval(async () => {
    try {
      const response = await fetch(`/api/room/scenarios?roomCode=${encodeURIComponent(initialRoomCode)}`);
      
      if (response.ok) {
        const data = await response.json();
        const newScenarios = data.scenarios || [];
        
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
      }
    } catch (error) {
      console.error('Failed to fetch scenarios for vote sync:', error);
    }
  }, 2000);
  
  return () => clearInterval(interval);
}, [initialRoomCode, voteCounts]);
```

### 4. Improved Vote Count Persistence

The changes ensure that:

1. **Vote counts are always consistent** - Both the votes API and scenarios API return the same vote count data
2. **Real-time updates work correctly** - Vote counts update immediately when votes are cast
3. **Page refreshes maintain vote state** - Vote counts are properly loaded when the page is refreshed
4. **Tiebreaker logic works reliably** - Vote counts are accurate for determining tie scenarios

## Key Benefits

1. **Consistent Data**: Vote counts are now fetched and stored consistently across all API endpoints
2. **Better Performance**: Removed duplicate API calls and unnecessary re-renders
3. **Real-time Sync**: Vote counts update in real-time across all clients
4. **Reliable Persistence**: Vote counts persist correctly through page refreshes and scenario regenerations
5. **Enhanced Debugging**: Better logging and error handling for troubleshooting vote issues

## Testing Recommendations

1. **Multi-user voting**: Test with multiple users voting simultaneously
2. **Page refresh**: Verify vote counts persist after page refresh
3. **Scenario regeneration**: Ensure vote counts reset when new scenarios are generated
4. **Tie scenarios**: Test tiebreaker logic with scenarios that have equal votes
5. **Network issues**: Test behavior when network connectivity is lost and restored

## Files Modified

1. `app/services/scenarioVoteService.server.ts` - Added grouped vote function
2. `app/routes/api.room.votes.tsx` - Added votesGrouped to API response
3. `app/routes/api.room.scenarios.tsx` - Enhanced API response with vote data
4. `app/components/ScenarioSelector.tsx` - Fixed vote loading and added sync polling

These changes ensure that vote count persistence works reliably and vote counts are displayed correctly for all users in the scenario selection system.
