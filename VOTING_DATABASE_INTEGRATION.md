# Voting Database Integration Fix

## Current Issue
The voting system is currently storing votes in the `scenarios` column of the `rooms` table instead of using the dedicated `room_scenario_votes` table.

## Database Schema
The `room_scenario_votes` table has the following structure:
```sql
create table public.room_scenario_votes (
  id uuid not null default gen_random_uuid (),
  room_code character varying(255) not null,
  user_id uuid not null,
  slot_index integer not null,
  scenario_id character varying(255) null,  -- null for REGENERATE votes
  vote_type character varying(20) null default 'scenario'::character varying,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint room_scenario_votes_pkey primary key (id),
  constraint room_scenario_votes_room_code_user_id_slot_index_key unique (room_code, user_id, slot_index),
  constraint room_scenario_votes_room_code_fkey foreign KEY (room_code) references rooms (code) on delete CASCADE
);
```

## Required Changes

### 1. Update castVote Function
Replace the scenario storage logic with database insertion:

**Current (Incorrect):**
```typescript
// Update the scenario in the room's scenarios array
const updatedScenarios = room.scenarios?.map(scenario => {
  if (scenario.id === scenarioId) {
    const currentUserVotes = scenario.userVotes || [];
    return {
      ...scenario,
      userVotes: [...currentUserVotes, newVote]
    };
  }
  return scenario;
});

const success = await storeRoomScenarios(roomCode, updatedScenarios as AdventureScenario[]);
```

**Fixed (Correct):**
```typescript
// Store vote in database
const { error } = await db.from('room_scenario_votes').insert([
  {
    room_code: roomCode,
    user_id: userId,
    slot_index: slotIndex,
    scenario_id: scenarioId === 'REGENERATE' ? null : scenarioId,
    vote_type: scenarioId === 'REGENERATE' ? 'regenerate' : 'scenario'
  }
]);

if (error) {
  console.error(`${logPrefix} Failed to store vote`, { 
    roomCode, scenarioId, userId, slotIndex, error: error.message 
  });
  return { success: false, message: "Failed to cast vote due to database error.", userVoteCount };
}
```

### 2. Update retractVote Function
Replace scenario storage logic with database deletion:

**Current (Incorrect):**
```typescript
const filteredUserVotes = (scenario.userVotes || []).filter(vote =>
  !(vote.userId === userId && vote.slotIndex === slotIndex)
);

const updatedScenarios = room.scenarios?.map(scenario => ({
  ...scenario,
  userVotes: filteredUserVotes
}));

const success = await storeRoomScenarios(roomCode, updatedScenarios as AdventureScenario[]);
```

**Fixed (Correct):**
```typescript
const { error } = await db
  .from('room_scenario_votes')
  .delete()
  .eq('room_code', roomCode)
  .eq('user_id', userId)
  .eq('slot_index', slotIndex);

if (error) {
  console.error(`${logPrefix} Failed to retract vote`, { 
    roomCode, userId, slotIndex, error: error.message 
  });
  return { success: false, message: "Failed to retract vote due to database error." };
}
```

### 3. Update clearScenarioVotes Function
Replace scenario storage logic with database deletion:

**Current (Incorrect):**
```typescript
const updatedScenarios = room.scenarios.map(scenario => ({
  ...scenario,
  userVotes: [] // Clear all user votes for this scenario
}));

const success = await storeRoomScenarios(roomCode, updatedScenarios as AdventureScenario[]);
```

**Fixed (Correct):**
```typescript
const { error } = await db
  .from('room_scenario_votes')
  .delete()
  .eq('room_code', roomCode);

if (error) {
  console.error(`${logPrefix} Failed to clear scenario votes`, { 
    roomCode, error: error.message 
  });
  return false;
}
```

## Benefits of Using room_scenario_votes Table

1. **Proper Database Design**: Separates vote data from scenario data
2. **Better Performance**: No need to read/write entire scenario arrays
3. **Data Integrity**: Foreign key constraints ensure referential integrity
4. **Scalability**: Easier to query and aggregate vote data
5. **Indexing**: Proper indexes for fast lookups
6. **Audit Trail**: Timestamps for vote creation and updates

## Migration Strategy

1. **Update all voting functions** to use `room_scenario_votes` table
2. **Keep existing API** - no changes needed to frontend
3. **Data migration** - optionally migrate existing votes from scenarios column
4. **Testing** - verify all voting scenarios work correctly

## Expected Outcome

After these changes:
- ✅ Votes stored in `room_scenario_votes` table
- ✅ Proper database relationships maintained
- ✅ Better performance and scalability
- ✅ Easier vote management and querying
- ✅ Full compatibility with existing frontend
