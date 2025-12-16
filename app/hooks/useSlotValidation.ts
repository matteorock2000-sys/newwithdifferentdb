import { useMemo } from 'react';
import type { PlayerSlot, Character } from '~/types';

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

export interface SlotValidationResult {
  ownershipValidation: OwnershipValidationResult;
  capacityValidation: RoomCapacityValidationResult;
  isOwnSlot: boolean;
  canTakeSlot: boolean;
  isRoomFull: boolean;
  userHasMaxSlots: boolean;
  userSlotCount: number;
  uniquePlayers: number;
  occupiedSlots: number;
}

function validateSlotOwnership(
  slotIndex: number,
  slot: PlayerSlot,
  currentUserId: string,
  character: Character | undefined,
  isLobbyView: boolean
): OwnershipValidationResult {
  const hasOwnershipData = !!currentUserId && !!slot.userId;
  const isOwnSlot = hasOwnershipData 
    ? currentUserId === slot.userId 
    : (isLobbyView ? !slot.userId : true);
  
  const canTakeSlot = !isLobbyView || isOwnSlot || !character || character.userId === currentUserId;
  
  if (character && character.userId !== currentUserId && !isOwnSlot) {
    return {
      isValid: false,
      errorMessage: "Cannot assign a character that doesn't belong to you",
      canTakeSlot: false,
      isOwnSlot
    };
  }
  
  if (slot.userId && slot.userId !== currentUserId && !isOwnSlot) {
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

function validateRoomCapacity(
  allSlots: PlayerSlot[],
  currentUserId: string,
  maxPlayers: number = 4
): RoomCapacityValidationResult {
  const uniquePlayers = new Set(
    allSlots.filter(slot => slot.userId).map(slot => slot.userId)
  ).size;
  
  const userSlotCount = allSlots.filter(
    slot => slot.userId === currentUserId
  ).length;
  
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

export function useSlotValidation(
  slotIndex: number,
  playerSlot: PlayerSlot,
  currentUserId: string | undefined,
  selectedCharacter: Character | undefined,
  allSlots: PlayerSlot[],
  isLobbyView: boolean | undefined,
  maxPlayers: number = 4
): SlotValidationResult {
  const ownershipValidation = useMemo(() => 
    validateSlotOwnership(
      slotIndex, 
      playerSlot, 
      currentUserId || '', 
      selectedCharacter, 
      isLobbyView
    )
  , [slotIndex, playerSlot, currentUserId, selectedCharacter, isLobbyView]);

  const capacityValidation = useMemo(() => 
    validateRoomCapacity(
      allSlots, 
      currentUserId || '', 
      maxPlayers
    )
  , [allSlots, currentUserId, maxPlayers]);

  return {
    ownershipValidation,
    capacityValidation,
    isOwnSlot: ownershipValidation.isOwnSlot,
    canTakeSlot: ownershipValidation.canTakeSlot,
    isRoomFull: capacityValidation.isRoomFull,
    userHasMaxSlots: capacityValidation.userHasMaxSlots,
    userSlotCount: capacityValidation.userSlotCount,
    uniquePlayers: capacityValidation.uniquePlayers,
    occupiedSlots: capacityValidation.occupiedSlots,
  };
}
