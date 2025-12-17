# Scenario Voting System - Database Integration & Map Generation Fixes

## Summary
This commit implements the complete scenario voting system with database persistence and fixes the map generation flow to use the same image generation process as character portraits.

## Key Changes

### 1. Database Integration for Scenario Winners
- **Modified**: `app/services/roomScenarios.server.ts`
  - Updated `setRoomScenarioWinner()` to accept either scenario ID string or full scenario object
  - Now stores the complete scenario object in the `scenario_winner_id` JSONB column
  - Added robust error handling and logging for database operations
  - Enhanced validation to prevent malformed UUID errors

- **Modified**: `app/services/roomScenarios.server.ts`
  - Updated `getRoomScenarioWinner()` to handle both string and object formats in JSONB column
  - Added normalization logic to extract scenario ID from stored objects

### 2. Route Architecture Optimization
- **Modified**: `app/routes/game.tsx`
  - Split POST submission (`/game`) from display page (`/map-generation`)
  - Added `startGame` intent handler with proper database persistence
  - Implemented JSON redirect response for client-side navigation
  - Removed strict UUID validation to support JSONB storage

- **Modified**: `app/routes/map-generation.tsx`
  - Created dedicated GET loader for map generation page
  - Added normalization for `scenario_winner_id` (JSONB vs string)
  - Implemented proper scenario lookup from room data

### 3. Map Generation Process Alignment
- **Modified**: `app/services/gemini.server.ts`
  - Updated `generateMapImage()` to use same Freepik orchestration as character portraits
  - Changed from direct base64 generation to URL-based flow with download
  - Added retry logic with 10 attempts and 2-second intervals
  - Enhanced error logging and debugging information

### 4. Client-Side Navigation & Error Handling
- **Modified**: `app/components/ScenarioSelector.tsx`
  - Added handling for `redirectTo` response from server
  - Implemented client-side navigation to map generation page
  - Enhanced error message extraction for both string and object errors
  - Added toast notifications for successful scenario selection

### 5. Real-time Updates & Type Safety
- **Modified**: `app/services/realtime.client.ts`
  - Updated to handle JSONB-stored scenario winners in real-time payloads
  - Added normalization logic for winner inference

- **Modified**: `app/types.ts`
  - Updated `scenario_winner_id` type to support `string | ScenarioForDisplay | null`
  - Enhanced type safety across all components

### 6. Development & Debugging Tools
- **Added**: `app/routes/api/room-inspect.ts`
  - New dev-only API endpoint to inspect room data without session
  - Supports both GET and POST methods
  - Returns full room row for debugging scenario selection flow

## Technical Details

### Database Schema
- `scenario_winner_id` column in `rooms` table now stores JSONB objects
- Supports backward compatibility with string IDs
- Proper normalization in all read/write operations

### Error Handling
- Comprehensive logging throughout the scenario selection flow
- Graceful handling of malformed data
- Clear error messages for debugging

### Image Generation
- Map generation now uses same Freepik API flow as character portraits
- Proper retry logic and timeout handling
- Base64 conversion for consistent client-side rendering

## Testing Notes
- Scenario selection now persists complete scenario object to database
- Map generation page loads correctly after scenario selection
- Real-time updates work with JSONB-stored winners
- Error messages are descriptive and actionable

## Next Steps
- Verify database column is properly migrated to JSONB
- Test end-to-end flow from scenario selection to map generation
- Monitor Freepik API usage and adjust retry parameters if needed