# Route Split - Code Changes Reference

## Quick Reference: What Changed

### 1. ScenarioSelector.tsx (1 line change)

**Location**: `app/components/ScenarioSelector.tsx`, line ~745

```diff
  // If roomCode is provided, submit to game route
  if (roomCode) {
    const formData = new FormData();
    formData.append('intent', 'startGame');
    formData.append('roomCode', roomCode);
    formData.append('selectedScenarioId', scenario.id);
    setScenarioSelectionInProgress(true);
-   scenarioFetcher.submit(formData, { method: 'post', action: '/world-map' });
+   scenarioFetcher.submit(formData, { method: 'post', action: '/game' });
    return;
  }
```

**Why**: Route POST to `/game` (new handler) instead of `/world-map`

---

### 2. game.tsx (85 lines added)

**Location**: `app/routes/game.tsx`, after the `retractVote` handler (around line 800)

```typescript
if (intent === 'startGame') {
  const roomCode = formData.get('roomCode')?.toString();
  const selectedScenarioId = formData.get('selectedScenarioId')?.toString();

  logger.debug('[GAME ACTION] startGame intent received', {
    roomCode,
    selectedScenarioId
  });

  if (!roomCode || !selectedScenarioId) {
    logger.error('[GAME ACTION] Missing required data for startGame', {
      roomCode,
      selectedScenarioId
    });
    return json(
      { error: "Missing room code or scenario ID" },
      { status: 400 }
    );
  }

  try {
    // Step 1: Persist the winning scenario
    logger.debug('[GAME ACTION] Persisting scenario winner', {
      roomCode,
      selectedScenarioId
    });

    const winnerPersisted = await setRoomScenarioWinner(roomCode, selectedScenarioId);
    if (!winnerPersisted) {
      logger.error('[GAME ACTION] Failed to persist scenario winner');
      return json(
        { error: "Failed to save scenario winner" },
        { status: 500 }
      );
    }

    logger.info('[GAME ACTION] Scenario winner persisted successfully', {
      roomCode,
      selectedScenarioId
    });

    // Step 2: Update room status to map_generation
    logger.debug('[GAME ACTION] Updating room status to map_generation', { roomCode });

    const statusUpdated = await retryOperation(
      () => updateRoomStatus(roomCode, 'map_generation'),
      {
        maxAttempts: 3,
        delayMs: 500,
        maxDelayMs: 2000,
        shouldRetry: (error) => {
          return error?.message?.includes("Failed to update") || 
                 error?.message?.includes("constraint") ||
                 error?.message?.includes("transaction");
        },
        onRetry: (error, attempt) => {
          logger.info('[GAME ACTION] Retrying room status update', {
            roomCode,
            attempt,
            error: error.message
          });
        }
      }
    );

    if (!statusUpdated) {
      logger.error('[GAME ACTION] Failed to update room status after retries');
      return json(
        { error: "Failed to update room status" },
        { status: 500 }
      );
    }

    logger.info('[GAME ACTION] Room status updated to map_generation', { roomCode });

    // Step 3: Verify persistence with fetch
    logger.debug('[GAME ACTION] Verifying DB persistence', { roomCode });
    
    const verifyRoom = await getRoomByCode(roomCode);
    if (verifyRoom?.scenario_winner_id !== selectedScenarioId || 
        verifyRoom?.status !== 'map_generation') {
      logger.error('[GAME ACTION] DB verification failed after status update', {
        roomCode,
        expectedScenarioId: selectedScenarioId,
        actualScenarioId: verifyRoom?.scenario_winner_id,
        expectedStatus: 'map_generation',
        actualStatus: verifyRoom?.status
      });
      return json(
        { error: "Room state mismatch after update" },
        { status: 500 }
      );
    }

    logger.info('[GAME ACTION] DB persistence verified, redirecting to map-generation', {
      roomCode,
      selectedScenarioId
    });

    // Step 4: Redirect to map-generation page
    return redirect(`/map-generation?roomCode=${roomCode}`);
  } catch (error) {
    logger.error('[GAME ACTION] Error in startGame handler', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    return createApiErrorResponse(error, "Failed to start map generation");
  }
}
```

**Why**: New intent handler that:
1. Persists scenario winner to DB
2. Updates room status with retry logic
3. Verifies DB state before redirecting
4. Redirects to `/map-generation` on success

---

### 3. map-generation.tsx (NEW FILE)

**Location**: `app/routes/map-generation.tsx` (518 lines)

**Key Sections**:

#### Loader: Validate and fetch room/scenario
```typescript
export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const session = await getSession(request.headers.get("Cookie"));
  const url = new URL(request.url);
  const roomCode = url.searchParams.get("roomCode");

  if (!roomCode) {
    return redirect("/rooms");
  }

  const room = await getRoomByCode(roomCode);

  if (!room) {
    return redirect("/rooms");
  }

  // Ensure room has a winning scenario
  if (!room.scenario_winner_id || !room.scenarios) {
    return redirect(`/game?roomCode=${roomCode}`);
  }

  // Find the winning scenario
  const scenario = room.scenarios.find(s => s.id === room.scenario_winner_id) || null;

  if (!scenario) {
    return redirect(`/game?roomCode=${roomCode}`);
  }

  // ... character resolution, party filtering, map cache loading ...

  return json({
    roomCode,
    roomName: room.name,
    participantsCount: room.participants.length,
    maxPlayers: room.maxPlayers,
    currentUserId: userId,
    isHost,
    party,
    scenario,
    mapImageBase64
  });
}
```

#### Action: Handle map generation and game progression
```typescript
export async function action({ request }: LoaderFunctionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const formData = await request.formData();
  const intent = formData.get("intent");
  const roomCode = formData.get("roomCode")?.toString();

  if (intent === "generateMap") {
    // Generate and cache map image via Gemini API with retry logic
    // Returns success/mapGenerated status
  }

  if (intent === "nextToGame") {
    // Proceed to actual game route
    return redirect(`/game?roomCode=${roomCode}`);
  }

  if (intent === "resetMapAndReturn") {
    // Clear cache and return to room
    deleteMapImage(session.get("mapCacheId"));
    return redirect(`/game?roomCode=${roomCode}`);
  }
}
```

#### Component: Rich UI rendering
```typescript
export default function MapGeneration() {
  const { roomCode, roomName, scenario, party, mapImageBase64 } = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900...">
      {/* Header */}
      {/* Connection Status */}
      {/* Room Info */}
      {/* Main Content: Scenario Details + Map */}
      {/* Right Column: Party Info + Navigation */}
    </div>
  );
}
```

**Why**: 
- GET-only route for map generation display
- Validates scenario winner exists
- Renders rich scenario UI with party info
- Handles map generation as bonus feature

---

## Import Changes

### map-generation.tsx
**Before** (if copying from world-map):
```typescript
import { getRoomByCode, updateRoomStatus } from "~/services/roomCore.server";
import LoadingOverlay from "~/components/LoadingOverlay";
import ProgressBar from "~/components/ProgressBar";
import SkeletonLoader from "~/components/SkeletonLoader";
```

**After** (optimized):
```typescript
import { getRoomByCode, updateRoomStatus } from "~/services/room.server";
import ConnectionStatus from "~/components/ConnectionStatus";
```

**Why**: 
- Use `room.server` facade for consistency
- Remove unused components
- Cleaner, minimal dependencies

---

## Testing the Changes

### Test 1: POST Handler Works
```bash
curl -X POST http://localhost:5173/game \
  -F "intent=startGame" \
  -F "roomCode=MCE944" \
  -F "selectedScenarioId=540338fe-6c26-4674-a123-e96b4da65bd2"

# Expected: 302 redirect to /map-generation?roomCode=MCE944
```

### Test 2: Page Loads
```bash
curl http://localhost:5173/map-generation?roomCode=MCE944

# Expected: 200 OK with HTML page containing scenario details
```

### Test 3: Manual UI Flow
1. Open app, create room
2. Vote on scenarios or complete dice rolls
3. Verify POST goes to `/game` (check Network tab)
4. Verify redirect to `/map-generation?roomCode=...`
5. Verify scenario and party display correctly

---

## Verification Checklist

- [ ] ScenarioSelector POSTs to `/game` (not `/world-map`)
- [ ] `/game` action handles `startGame` intent
- [ ] `setRoomScenarioWinner()` called before redirect
- [ ] `updateRoomStatus('map_generation')` called with retry
- [ ] DB state verified before redirect
- [ ] `/map-generation` loader validates winner scenario exists
- [ ] `/map-generation` renders scenario + party + map UI
- [ ] No TypeScript errors in new code
- [ ] Logs show proper sequence for both paths

---

## Rollback Instructions

If needed to revert changes:

1. **Revert ScenarioSelector.tsx**:
   - Change form action back to `/world-map`

2. **Remove game.tsx startGame handler**:
   - Delete the 85-line handler (lines ~808-892)

3. **Remove map-generation.tsx**:
   - Delete the new file

4. **Restore /world-map.tsx**:
   - If it was modified, reset to previous version with startGame handler

This will restore the old monolithic route architecture.

---

**Note**: All changes maintain backward compatibility with existing code paths.
