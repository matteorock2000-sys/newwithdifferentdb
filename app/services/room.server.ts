/**
 * @deprecated This file is a compatibility layer. Import directly from specific modules:
 * - roomCore.server.ts for CRUD operations (includes optimized cleanup logic)
 * - roomSlots.server.ts for slot management (includes debouncing support)
 * - roomScenarios.server.ts for scenario operations
 * - roomDice.server.ts for dice rolling
 * - roomChat.server.ts for chat messages
 * - roomGameplay.server.ts for character movement
 * 
 * OPTIMIZATION NOTES:
 * - getAllActiveRooms() no longer runs cleanup on every fetch (moved to background job)
 * - updateParticipantActivity() throttles cleanup to every 30 seconds per room
 * - Database indexes added for performance (see migrations/add_room_performance_indexes.sql)
 * - Background cleanup job available in roomCleanupJob.server.ts
 */

// Re-export all functions from refactored modules for backward compatibility
// This file serves as a facade to minimize breaking changes during migration

// Core room operations
export {
  getRoomByCode,
  getAllActiveRooms,
  handleRoomAction,
  deleteRoom,
  updateRoomStatus,
  updateParticipantActivity,
  generateUniqueCodeSync,
  withOptimisticLock,
  ACTIVE_THRESHOLD_MS,
  INACTIVITY_DELETION_MS
} from './roomCore.server';

// Slot management
export {
  updateSlotReadiness,
  updateRoomSlots,
  updateSpecificSlot,
  synchronizeUserSlots
} from './roomSlots.server';

// Scenario operations
export {
  type ScenarioForDisplay,
  insertScenarioSuggestion,
  getScenarioSuggestions,
  storeRoomScenarios,
  getRoomScenarios,
  setRoomScenarioWinner,
  getRoomScenarioWinner,
  clearRoomScenarios,
  getRoomScenariosForVoting,
  hasRoomScenarios
} from './roomScenarios.server';

// Dice rolling
export {
  type DiceRollResult,
  type TiebreakerStatus,
  startDiceRolling,
  recordDiceRoll,
  getDiceRollingState,
  getRoomDiceResults,
  checkTiebreakerCompletion,
  clearRoomDiceRolls,
  getPlayerSlotInfo
} from './roomDice.server';

// Chat operations
export {
  type ChatMessage,
  getRoomChatMessages,
  insertChatMessage
} from './roomChat.server';

// Gameplay operations
export {
  updateCharacterCoordinates
} from './roomGameplay.server';

// Cleanup operations (internal use only, not re-exported)
// Import directly from roomCleanup.server if needed
