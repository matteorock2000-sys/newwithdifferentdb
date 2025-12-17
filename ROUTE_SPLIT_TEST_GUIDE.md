# Route Architecture Split Test Guide

## Overview
This guide verifies the new route split where scenario selection POSTs to `/game` and map generation displays on `/map-generation`.

## Architecture
- **POST Handler**: `/game.tsx` → `startGame` intent
  - Persists scenario winner via `setRoomScenarioWinner()`
  - Updates room status to `'map_generation'`
  - Redirects to `/map-generation?roomCode=...`
  
- **Display Page**: `/map-generation.tsx` → GET-only route
  - Accepts `?roomCode=...` query param
  - Validates scenario winner exists in room
  - Renders map generation UI

## Manual Test Procedure

### Prerequisites
1. Start dev server: `npm run dev`
2. Create a room with multiple players
3. Each player selects a character

### Test Case 1: Vote Majority Path
**Objective**: Verify vote majority auto-persists winner and redirects to map generation

#### Steps:
1. Players vote on scenarios
2. One scenario receives strict majority (>50%)
3. **Expected**: 
   - Toast shows "Scenario winner saved! Proceeding to map generation..."
   - Auto-redirect to `/map-generation?roomCode=MCE944`
   - Map generation UI displays with scenario details and party info
   - DB verification: `rooms.scenario_winner_id` set to winner scenario ID
   - DB verification: `rooms.status` set to `'map_generation'`

#### Verification:
```bash
# Check DB state after vote majority
curl -X POST http://localhost:5173/game \
  -F "intent=getRoomData" \
  -F "roomCode=MCE944"
```

Expected response should show:
- `scenario_winner_id`: Winner scenario UUID
- `status`: "map_generation"

---

### Test Case 2: Dice Tiebreaker Path
**Objective**: Verify dice tiebreaker POST to `/game` persists winner and redirects

#### Steps:
1. Roll dice for tiebreaker (equal votes on multiple scenarios)
2. All players complete their dice rolls
3. Auto-submit with winning scenario
4. **Expected**:
   - POST sent to `/game` with `intent=startGame`
   - Toast shows "Scenario winner saved! Proceeding to map generation..."
   - Redirect to `/map-generation?roomCode=MCE944`
   - Map generation UI displays correctly

#### Verification:
```bash
# Manually trigger startGame to test POST handling
curl -X POST http://localhost:5173/game \
  -F "intent=startGame" \
  -F "roomCode=MCE944" \
  -F "selectedScenarioId=540338fe-6c26-4674-a123-e96b4da65bd2"
```

Expected: 302 redirect to `/map-generation?roomCode=MCE944`

---

### Test Case 3: Map Generation Page Load
**Objective**: Verify `/map-generation` route loads correct scenario and party

#### Steps:
1. Navigate directly to `/map-generation?roomCode=MCE944`
2. **Expected**:
   - Page loads successfully (status 200)
   - Scenario title displays from `rooms.scenarios[]` matching `scenario_winner_id`
   - Party list shows all active characters from `setup_slots`
   - Room info displays: room name, player count, room code
   - "Generate Map" button is clickable
   - "Begin Adventure" button leads to game start

#### Verification:
```bash
# Direct page load
curl -v http://localhost:5173/map-generation?roomCode=MCE944
```

Expected: 200 OK with full HTML page containing scenario details

---

### Test Case 4: Missing/Invalid Scenario
**Objective**: Verify proper error handling for missing winner scenario

#### Steps:
1. Manually update DB: Set `rooms.scenario_winner_id` to non-existent UUID
2. Navigate to `/map-generation?roomCode=MCE944`
3. **Expected**: Redirect back to `/game?roomCode=MCE944` (no winner scenario)

---

### Test Case 5: Missing Room
**Objective**: Verify proper error handling for missing room

#### Steps:
1. Navigate to `/map-generation?roomCode=INVALID`
2. **Expected**: Redirect to `/rooms` (room not found)

---

## Log Analysis

### For Vote Majority Flow:
Look for these log lines in browser console/server logs:
```
[SCENARIO SELECTOR] handleSelectScenario called
[SCENARIO SELECTOR] Submitting scenario selection to /game for room: MCE944
[GAME ACTION] startGame intent received
[GAME ACTION] Persisting scenario winner
[GAME ACTION] Updating room status to map_generation
[GAME ACTION] DB persistence verified, redirecting to map-generation
[MAP-GENERATION] LOADER STARTED - roomCode: MCE944
[MAP-GENERATION] Room fetched
[MAP-GENERATION] Loader completed successfully
```

### For Dice Tiebreaker Flow:
Look for same sequence but triggered by dice roll completion:
```
[SCENARIO SELECTOR] Auto-submit useEffect triggered after dice completion
[SCENARIO SELECTOR] handleSelectScenario called with dice winner
[SCENARIO SELECTOR] Submitting scenario selection to /game for room: MCE944
[GAME ACTION] startGame intent received
...
```

---

## Debugging Checklist

### If redirect loop occurs:
- [ ] Check `/game` route has `startGame` intent handler
- [ ] Check `/game` calls `setRoomScenarioWinner()` before redirect
- [ ] Check `/game` calls `updateRoomStatus('map_generation')`
- [ ] Check `/map-generation` loader validates `scenario_winner_id` exists
- [ ] Check logs for "DB persistence verified"

### If `/map-generation` shows blank:
- [ ] Check room code in URL matches created room
- [ ] Check room has `scenario_winner_id` set in DB
- [ ] Check room has `scenarios` array with winning scenario
- [ ] Check `setup_slots` contains valid characters

### If map generation button doesn't work:
- [ ] Check POST to `/map-generation` with `intent=generateMap`
- [ ] Check `generateMapImage()` service is accessible
- [ ] Check Gemini API quota hasn't been exceeded
- [ ] Check map cache is being stored/retrieved

---

## Test Results Template

**Date**: _______________
**Tester**: _______________

| Test Case | Status | Notes |
|-----------|--------|-------|
| Vote Majority | ☐ Pass ☐ Fail | |
| Dice Tiebreaker | ☐ Pass ☐ Fail | |
| Map Gen Page Load | ☐ Pass ☐ Fail | |
| Missing Scenario | ☐ Pass ☐ Fail | |
| Missing Room | ☐ Pass ☐ Fail | |

### Summary:
_______________________________________________

### Issues Found:
_______________________________________________
