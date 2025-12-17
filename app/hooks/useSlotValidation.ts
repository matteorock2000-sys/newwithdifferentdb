import { useMemo } from 'react';
import type { PlayerSlot, Character } from '~/types';
import { validateSlotOwnership, validateRoomCapacity, OwnershipValidationResult, RoomCapacityValidationResult } from '~/utils/slotValidation'; // Import from utils

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
      currentUserId, 
      selectedCharacter, 
      isLobbyView
    )
  , [slotIndex, playerSlot, currentUserId, selectedCharacter, isLobbyView]);

  const capacityValidation = useMemo(() => 
    validateRoomCapacity(
      allSlots, 
      currentUserId, 
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
