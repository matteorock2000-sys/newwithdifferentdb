# Slot Synchronization Status System

## Overview

The slot synchronization system provides real-time visual feedback for slot updates in multiplayer D&D rooms.

## Sync States

### 1. **Synced** (default)
- **Visual**: No indicator
- **Meaning**: Slot is synchronized with server
- **Duration**: Persistent until next update

### 2. **Pending**
- **Visual**: Yellow badge with ⏳ icon
- **Meaning**: Update queued, waiting for debounce delay
- **Duration**: Up to 300ms (debounce delay)

### 3. **Syncing**
- **Visual**: Blue badge with spinner
- **Meaning**: Update being sent to server
- **Duration**: Until server responds

### 4. **Error**
- **Visual**: Red badge with ❌ icon
- **Meaning**: Update failed, rolled back to previous state
- **Duration**: 3 seconds, then cleared
- **User Action**: Toast notification shown with error message

## Debouncing

- **Delay**: 300ms
- **Purpose**: Batch rapid slot changes to reduce API calls
- **Behavior**: Only the final state within 300ms window is sent to server

## Rollback Mechanism

When a slot update fails:
1. Error toast notification displayed
2. Local state reverted to previous slot state
3. Error badge shown for 3 seconds
4. Slot history cleared

## Optimistic Updates

All slot changes update the UI immediately before server confirmation:
1. User makes change → UI updates instantly
2. Change queued (pending state)
3. After debounce delay → sent to server (syncing state)
4. Server responds → synced or error state

## Integration Points

- **Component**: `PlayerSetupSlot.tsx` - Displays sync badges
- **Hook**: `useOptimisticSlotUpdate.ts` - Manages sync state
- **Route**: `game.tsx` - Coordinates updates
- **Server**: `roomSlots.server.ts` - Validates and persists
