import type { PlayerSlot, Character } from "~/types";

// Re-exporting types that might still be needed elsewhere
export type { OwnershipValidationResult, RoomCapacityValidationResult };

export interface OwnershipValidationResult {
  isValid: boolean;
  errorMessage?: string;
  canTakeSlot: boolean;
  isOwnSlot: boolean;
}

export interface RoomCapacityValidationResult {
  isRoomFull: boolean;
  userSlotCount: number;
  userHasMaxSlots: boolean;
  uniquePlayers: number;
  occupiedSlots: number;
}

export function validateSlotOwnership(
  slotIndex: number,
  slot: PlayerSlot,
  currentUserId: string | undefined,
  character: Character | undefined,
  isLobbyView: boolean
): OwnershipValidationResult {
  const hasOwnershipData = !!currentUserId && !!slot.userId;
  const isOwnSlot = hasOwnershipData 
    ? currentUserId === slot.userId 
    : (isLobbyView ? !slot.userId : true);
  
  // For AI slots, character ownership doesn't matter - anyone can assign any available character
  // For Human slots, character must belong to the user (unless it's their own slot)
  const isAISlot = slot.type === 'AI';
  const canTakeSlot = !isLobbyView || isOwnSlot || !character || !currentUserId || isAISlot || character.userId === currentUserId;
  
  // Only check character ownership for Human slots (not AI slots)
  if (character && currentUserId && character.userId !== currentUserId && !isOwnSlot && slot.type === 'Human') {
    return {
      isValid: false,
      errorMessage: "Cannot assign a character that doesn't belong to you",
      canTakeSlot: false,
      isOwnSlot
    };
  }
  
  if (slot.userId && currentUserId && slot.userId !== currentUserId && !isOwnSlot) {
    return {
      isValid: false,
      errorMessage: "This slot is occupied by another player",
      canTakeSlot: false,
      isOwnSlot
    };
  }
  
  return {
    isValid: true,
    canTakeSlot,
    isOwnSlot
  };
}

export function validateRoomCapacity(
  allSlots: PlayerSlot[],
  currentUserId: string | undefined,
  maxPlayers: number = 4
): RoomCapacityValidationResult {
  const uniquePlayers = new Set(
    allSlots.filter(slot => slot.userId).map(slot => slot.userId)
  ).size;
  
  const userSlotCount = currentUserId ? allSlots.filter(
    slot => slot.userId === currentUserId
  ).length : 0;
  
  const occupiedSlots = allSlots.filter(slot => slot.type !== 'None').length;
  const isRoomFull = uniquePlayers >= maxPlayers || occupiedSlots >= 4;
  const userHasMaxSlots = userSlotCount >= 2;
  
  return {
    isRoomFull,
    userSlotCount,
    userHasMaxSlots,
    uniquePlayers,
    occupiedSlots
  };
}