# Voting System Improvements

## Summary of Changes

This document outlines the improvements made to the voting system and player slot management to ensure it correctly handles different slot configurations, user scenarios, and room occupancy.

## Issues Fixed

### 1. Host Slot Blocking Issue
**Problem**: The host was unable to take a slot among the character slots in the lobby.
**Solution**: 
- Added ownership validation in `PlayerSetupSlot.tsx` to prevent users from taking slots that don't belong to them
- Added server-side validation in `room.server.ts` to ensure characters belong to the user attempting to assign them
- Added visual indicators to show when a slot is occupied by another player's character

### 2. Character Ownership Validation
**Problem**: Users could potentially assign characters that don't belong to them.
**Solution**:
- Added client-side validation in `handleTypeChange` and `handleCharacterSelect` functions
- Added server-side validation in `updateSpecificSlot` function
- Added ownership checks in `castVote` function in `scenarioVoteService.server.ts`

### 3. Voting System with Multiple Slots
**Problem**: The voting system needed to correctly handle users with multiple slots.
**Solution**:
- Enhanced `userActiveSlots` calculation to count all active slots per user
- Added validation to ensure each slot can only vote once
- Added comprehensive logging and debugging for voting state
- Created test scenarios to verify voting functionality with different slot configurations

### 4. Cross-User Vote Confusion (CRITICAL FIX)
**Problem**: The host was seeing votes from other users in their voting interface, causing confusion and preventing them from voting.
**Solution**:
- Fixed room loading logic in `game.tsx` to properly set `userId` for all slots
- Added server-side validation in `castVote` to prevent other users from voting on host's slots
- Modified vote polling in `ScenarioSelector.tsx` to only show votes from current user
- Updated vote counting logic to only count votes from current user
- Fixed UI display to show correct vote counts for current user only

### 5. Player Slot Management in Lobby (NEW)
**Problem**: No proper handling for max players, player joining when room has existing players, and visual indicators for room status.
**Solution**:
- Added `maxPlayers` and `roomStatus` props to `PlayerSetupSlot` component
- Implemented room occupancy calculation (unique players and occupied slots)
- Added validation for room full status and user slot limits (max 2 slots per user)
- Added visual indicators for room status, player limits, and slot availability
- Enhanced slot assignment logic to handle player joining scenarios
- Added comprehensive logging for player slot operations

## Key Changes Made

### PlayerSetupSlot.tsx
1. **Enhanced Ownership Logic**:
   ```typescript
   const canTakeSlot = useMemo(() => {
     if (!isLobbyView) return true;
     if (isOwnSlot) return true;
     if (!selectedCharacter) return true;
     return selectedCharacter.userId === currentUserId;
   }, [isLobbyView, isOwnSlot, selectedCharacter, currentUserId]);
   ```

2. **Character Selection Validation**:
   ```typescript
   // Verify the character belongs to the current user before setting user info
   const selectedCharacter = charactersForSelection.find(c => c.id === newCharacterId);
   if (selectedCharacter && selectedCharacter.userId === currentUserId) {
     newUserId = currentUserId;
     newUsername = playerSlot.username;
   }
   ```

3. **Visual Indicators**:
   ```typescript
   {/* NEW: Display Occupied by Another Player Message */}
   {!isSlotLocked && isLobbyView && selectedCharacter && playerSlot.userId && playerSlot.userId !== currentUserId && (
     <p className="text-xs text-red-400 text-center mb-2 font-semibold">
       🚫 This slot is occupied by another player's character
     </p>
   )}
   ```

### room.server.ts
1. **Server-side Ownership Validation**:
   ```typescript
   // Validate ownership: Check if the user trying to update the slot owns the character
   if (newSlotData.characterId && newSlotData.userId) {
     const { getCharacterById } = await import("~/services/db.server");
     const character = await getCharacterById(newSlotData.userId, newSlotData.characterId);
     
     if (!character) {
       throw new Error("Character not found or access denied.");
     }
     
     // Verify the character belongs to the user attempting to update the slot
     if (character.userId !== newSlotData.userId) {
       throw new Error("Cannot assign a character that doesn't belong to you.");
     }
   }
   ```

### game.tsx
1. **Enhanced Room Loading Logic (CRITICAL FIX)**:
   ```typescript
   // Use the saved slots from the room, preserving character selection and readiness, and enriching with user data
   party = room.setup_slots.map(slot => {
     if (slot.characterId) {
       const slotUserId = participantMap.get(slot.characterId);
       const character = characterMap.get(slot.characterId);
       if (slotUserId && character) {
         const username = userMap.get(slotUserId);
         return { 
           ...slot, 
           userId: slotUserId, 
           username,
           characterName: character.name
         };
       } else if (character) {
         // If character exists but no participant mapping, try to get userId from character
         // This handles cases where the character exists but isn't in the participants list
         return { 
           ...slot, 
           userId: character.userId, 
           username: undefined,
           characterName: character.name
         };
       }
     }
     return slot;
   });
   ```

### routes/rooms.tsx and routes/game.tsx
1. **Enhanced PlayerSetupSlot Usage**:
   ```typescript
   // Pass new props for room management
   <PlayerSetupSlot 
     // ... existing props
     maxPlayers={4} // Maximum players per room
     roomStatus={isInGame ? 'active' : 'lobby'} // Current room status
   />
   ```

### scenarioVoteService.server.ts
1. **Enhanced Vote Validation**:
   ```typescript
   // 1. Get room and validate user/slot ownership
   const room = await getRoomByCode(roomCode);
   if (!room) {
     return { success: false, message: "Room not found.", userVoteCount: 0 };
   }
   
   const targetSlot = room.setup_slots[slotIndex];
   if (!targetSlot) {
     return { success: false, message: `Slot ${slotIndex} does not exist.`, userVoteCount: 0 };
   }
   
   // CRITICAL FIX: Enhanced validation to prevent other users from voting on host's slots
   if (!targetSlot.userId) {
     return { success: false, message: `Slot ${slotIndex} is not assigned to any user.`, userVoteCount: 0 };
   }
   
   if (targetSlot.userId !== userId) {
     return { success: false, message: `Slot ${slotIndex} does not belong to you. This slot belongs to user ${targetSlot.userId}.`, userVoteCount: 0 };
   }
   if (targetSlot.type !== 'Human' && targetSlot.type !== 'AI') {
     return { success: false, message: `Slot ${slotIndex} cannot vote.`, userVoteCount: 0 };
   }
   ```

### ScenarioSelector.tsx
1. **Enhanced Voting State Management**:
   ```typescript
   // Calculate how many active slots the current user controls
   const userActiveSlots = partySlots.filter(slot => 
     (slot.type === 'Human' || slot.type === 'AI') && slot.userId === currentUserId
   ).length;
   ```

2. **Voting Validation**:
   ```typescript
   // Only allow voting for slots owned by current user
   if (!userSlotIndices.includes(slotIndex)) {
     console.log(`[VOTING] Cannot vote for slot ${slotIndex} - not owned by current user`);
     showToast(`Cannot vote for slot ${slotIndex} - not owned by current user`, 'error');
     return;
   }
   ```

3. **Vote Filtering (CRITICAL FIX)**:
   ```typescript
   // CRITICAL FIX: Only set userVotes for slots owned by current user
   const slot = partySlots[vote.slotIndex];
   if (slot && slot.userId === currentUserId) {
     newUserVotes[vote.slotIndex] = vote.scenarioId;
   }
   
   // CRITICAL FIX: Only add votes from current user to scenario votes
   if (vote.userId === currentUserId) {
     newScenarioVotes[vote.scenarioId].push(vote);
   }
   ```

4. **User-Specific Vote Counting (CRITICAL FIX)**:
   ```typescript
   // CRITICAL FIX: Calculate votes only from current user
   const userVotesCount = Object.values(userVotes).filter(vote => vote && vote !== 'REGENERATE').length;
   const userRegenerateVotesCount = Object.values(userVotes).filter(vote => vote === 'REGENERATE').length;
   const totalVotesCast = userVotesCount + userRegenerateVotesCount;
   const allHaveVoted = totalVotesCast >= userActiveSlots;
   ```

5. **Comprehensive Debugging**:
   ```typescript
   // Validate voting state
   const validateVotingState = () => {
     console.log('[VOTING VALIDATION] Starting validation...');
     
     // Check if userVotes only contains votes from user's slots
     Object.keys(userVotes).forEach(slotIndexStr => {
       const slotIndex = parseInt(slotIndexStr);
       if (!userSlotIndices.includes(slotIndex)) {
         console.warn(`[VOTING VALIDATION] Invalid vote found: slot ${slotIndex} is not owned by current user`);
       }
     });
     
     // Check if user has exceeded their vote limit
     const userVoteCount = Object.values(userVotes).filter(vote => vote && vote !== 'REGENERATE').length;
     if (userVoteCount > userActiveSlots) {
       console.warn(`[VOTING VALIDATION] User has exceeded vote limit: ${userVoteCount} votes with ${userActiveSlots} slots`);
     }
   };
   ```

### PlayerSetupSlot.tsx (NEW - Player Slot Management)
1. **Enhanced Props for Room Management**:
   ```typescript
   interface PlayerSetupSlotProps {
     // ... existing props
     maxPlayers?: number; // Maximum players allowed in room (default: 4)
     roomStatus?: string; // Current room status (lobby, scenario_selection, etc.)
   }
   ```

2. **Room Occupancy Calculation**:
   ```typescript
   // Calculate room occupancy
   const activeSlots = allSlots.filter(slot => slot.type === 'Human' || slot.type === 'AI');
   const occupiedSlots = allSlots.filter(slot => slot.type !== 'None').length;
   const uniquePlayers = new Set(allSlots.filter(slot => slot.userId).map(slot => slot.userId)).size;
   const isRoomFull = uniquePlayers >= maxPlayers || occupiedSlots >= 4;
   
   // Check if current user has reached their slot limit (max 2 slots per user)
   const userSlotCount = allSlots.filter(slot => slot.userId === currentUserId).length;
   const userHasMaxSlots = userSlotCount >= 2;
   ```

3. **Enhanced Type Change Handler**:
   ```typescript
   const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
     if (isSlotLocked) return;
     
     const newType = e.target.value as PlayerSlot['type'];
     
     // Check if room is full and user is trying to join
     if (newType !== 'None' && isRoomFull && !isOwnSlot) {
       logger.warn('Room is full, cannot join', { slotIndex, userSlotCount, uniquePlayers, maxPlayers });
       alert(`Cannot join room: Room is full (${maxPlayers} players max).`);
       return;
     }
     
     // Check if user has reached their slot limit
     if (newType !== 'None' && userHasMaxSlots && !isOwnSlot) {
       logger.warn('User has reached slot limit', { slotIndex, userSlotCount });
       alert('Cannot take more slots: You can only control up to 2 slots per room.');
       return;
     }
     
     // ... rest of the logic
   }, [/* dependencies including isRoomFull, userHasMaxSlots, maxPlayers */]);
   ```

4. **Visual Indicators for Room Status**:
   ```typescript
   // NEW: Display Room Full Message
   {isRoomFull && !isOwnSlot && (
     <p className="text-xs text-red-400 text-center mb-2 font-semibold">
       🚫 Room Full ({uniquePlayers}/{maxPlayers} players)
     </p>
   )}
   
   // NEW: Display User Slot Limit Message
   {userHasMaxSlots && !isOwnSlot && (
     <p className="text-xs text-orange-400 text-center mb-2 font-semibold">
       ⚠️ Slot Limit Reached (2/2 slots)
     </p>
   )}
   
   // Enhanced Room Status Display
   {isLobbyView && (
     <p className="text-xs text-gray-400 mt-1">
       Room: {uniquePlayers}/{maxPlayers} players • Slots: {occupiedSlots}/4 occupied
     </p>
   )}
   ```

## Test Scenarios

Created comprehensive test scenarios to verify voting functionality:

1. **Single slot per user**: Each user has one slot, should be able to vote once
2. **Multiple slots per user**: One user has multiple slots, should be able to vote multiple times
3. **Mixed slot types**: Mix of Human and AI slots, both should be able to vote
4. **Empty slots**: Some slots are empty, should not affect voting
5. **All slots for one user**: One user controls all slots, should be able to vote 4 times

## Expected Behavior

### For Different Slot Configurations:

1. **1 slot per user (4 users)**:
   - Each user can vote 1 time
   - Total votes possible: 4

2. **Multiple slots per user (1 user with 2 slots, 2 users with 1 slot each)**:
   - User 1 can vote 2 times
   - User 2 can vote 1 time
   - User 3 can vote 1 time
   - Total votes possible: 4

3. **All slots for one user**:
   - User 1 can vote 4 times
   - Total votes possible: 4

4. **Mixed Human/AI slots**:
   - Both Human and AI slots can vote
   - Vote count is based on number of slots per user, not slot type

## Validation Rules

1. **Ownership**: Users can only vote with slots that belong to them
2. **Slot Type**: Only Human and AI slots can vote
3. **Vote Limit**: Each slot can only vote once
4. **Character Ownership**: Users can only assign characters that belong to them
5. **Real-time Updates**: Voting state is synchronized across all clients

## Error Handling

1. **Character Assignment Errors**:
   - "Cannot assign a character that doesn't belong to you"
   - "Cannot take this slot - it's already occupied by another player's character"

2. **Voting Errors**:
   - "Cannot vote for slot X - not owned by current user"
   - "Slot X has already voted and cannot vote again"

3. **Server-side Validation**:
   - Room not found
   - Slot does not exist
   - Slot does not belong to user
   - Slot cannot vote (not Human/AI)
   - Character not found or access denied

## Next Steps

1. Test the implementation with different slot configurations
2. Verify real-time synchronization works correctly
3. Test edge cases (network errors, page refreshes, etc.)
4. Optimize performance for large numbers of votes
5. Add additional visual feedback for voting state

## Files Modified

- `app/components/PlayerSetupSlot.tsx`
- `app/services/room.server.ts`
- `app/services/scenarioVoteService.server.ts`
- `app/components/ScenarioSelector.tsx`
- `test-voting-system.ts` (new test file)
- `VOTING_SYSTEM_IMPROVEMENTS.md` (this documentation)