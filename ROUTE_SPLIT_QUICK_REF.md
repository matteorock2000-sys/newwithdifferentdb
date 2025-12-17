# Route Split Quick Reference

## TL;DR - What Changed?

**Old**: Single route `/world-map` handled POST (scenario selection) + GET (page display)  
**New**: Split into `/game` (POST) + `/map-generation` (GET)

---

## Quick Facts

| What | Where |
|------|-------|
| **Scenario selection POSTs** | ✅ `/game` (startGame intent) |
| **Map generation page** | ✅ `/map-generation?roomCode=...` |
| **User sees these routes** | `ScenarioSelector.tsx` → POST → `/map-generation` → page |
| **Route change** | `ScenarioSelector.tsx` line ~745: action → `/game` |
| **Files changed** | 2 modified + 1 new (+ 4 docs) |
| **Lines of code** | 86 lines new core logic |
| **Breaking changes** | None - fully backward compatible |

---

## User Flow

```
1. Vote/Dice Selection
   ↓
2. handleSelectScenario() triggered
   ↓
3. POST to /game with startGame intent
   ↓
4. /game action:
   - Saves winner to DB
   - Updates room status to 'map_generation'
   - Verifies DB state
   ↓
5. Redirect to /map-generation?roomCode=MCE944
   ↓
6. /map-generation displays scenario & party
```

---

## Key Endpoints

### POST `/game` (startGame intent)
**Purpose**: Persist scenario winner and update room status  
**Expects**:
- `roomCode` (string, required)
- `selectedScenarioId` (UUID, required)

**Returns**:
- ✅ 302 redirect to `/map-generation?roomCode=...` on success
- ❌ 400 if missing roomCode/scenarioId
- ❌ 500 if DB persistence fails

**Logs**: `[GAME ACTION]` prefix

---

### GET `/map-generation` (with query params)
**Purpose**: Display map generation page  
**Expects**:
- `?roomCode=...` (required query param)
- Room must have `scenario_winner_id` set
- Scenario must exist in `scenarios` array

**Returns**:
- ✅ 200 with map generation UI
- ❌ 302 redirect to `/rooms` if room not found
- ❌ 302 redirect to `/game?roomCode=...` if no winner scenario

**Logs**: `[MAP-GENERATION]` prefix

---

## Testing Quickly

### Test 1: Manual POST
```bash
curl -X POST http://localhost:5173/game \
  -F "intent=startGame" \
  -F "roomCode=MCE944" \
  -F "selectedScenarioId=540338fe-6c26-4674-a123-e96b4da65bd2"
# Expected: 302 redirect
```

### Test 2: Page Load
```bash
curl http://localhost:5173/map-generation?roomCode=MCE944
# Expected: 200 OK with HTML
```

### Test 3: UI Flow
1. Create room → Setup characters
2. Vote on scenarios OR complete dice rolls
3. Check Network tab: POST to `/game`?
4. Redirected to `/map-generation?roomCode=...`?
5. Page displays scenario + party info?

---

## Logs to Look For

### Success Sequence (Vote Majority)
```
[SCENARIO SELECTOR] handleSelectScenario called
[SCENARIO SELECTOR] Submitting scenario selection to /game
[GAME ACTION] startGame intent received
[GAME ACTION] Persisting scenario winner
[GAME ACTION] Updating room status to map_generation
[GAME ACTION] DB persistence verified, redirecting to map-generation
[MAP-GENERATION] LOADER STARTED
[MAP-GENERATION] Room fetched
[MAP-GENERATION] Loader completed successfully
```

### Success Sequence (Dice Tiebreaker)
```
[SCENARIO SELECTOR] Auto-submit useEffect triggered
[SCENARIO SELECTOR] handleSelectScenario called with dice winner
[SCENARIO SELECTOR] Submitting scenario selection to /game
... (same as above from [GAME ACTION] onward)
```

### Error Indicators
- ❌ Missing `[GAME ACTION]` logs → POST didn't reach handler
- ❌ "DB persistence verified" missing → Update failed or verification failed
- ❌ Missing `[MAP-GENERATION]` logs → Redirect didn't happen
- ❌ Redirect loop → Loader validation failing

---

## Common Issues & Fixes

| Issue | Check | Fix |
|-------|-------|-----|
| POST doesn't go to `/game` | Network tab | ScenarioSelector action still `/world-map`? |
| 500 on POST | Logs `[GAME ACTION]` | DB down? setRoomScenarioWinner failing? |
| Redirect loop | Both route logs | scenario_winner_id not in DB? |
| Page shows blank | Room data | Room code in URL? Winner scenario exists? |
| Toast not shown | Navigation | Check fetcher/navigation state handling |

---

## Files to Know

| File | Purpose | Key Function |
|------|---------|--------------|
| `/app/routes/game.tsx` | POST handler | startGame intent handler (~85 lines) |
| `/app/routes/map-generation.tsx` | Display page | GET loader + action + component |
| `/app/components/ScenarioSelector.tsx` | Client form | Submits to /game (1 line changed) |
| `~/services/room.server.ts` | DB facade | Exports setRoomScenarioWinner, getRoomByCode |

---

## Documentation

- **`ROUTE_SPLIT_FINAL_SUMMARY.md`** - Complete overview & next steps
- **`ROUTE_SPLIT_IMPLEMENTATION.md`** - Technical deep dive
- **`ROUTE_SPLIT_CODE_CHANGES.md`** - Code reference guide
- **`ROUTE_SPLIT_TEST_GUIDE.md`** - Manual test procedures

---

## One-Liner Summary

> Changed scenario selection from monolithic `/world-map` to clean split: `/game` handles POST (persist winner), `/map-generation` displays page (get-only).

---

**Created**: Dec 17, 2025  
**Status**: ✅ Implementation Complete - Ready for Testing
