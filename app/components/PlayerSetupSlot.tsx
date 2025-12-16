import type { Character, PlayerSlot, SlotSyncState } from "~/types";
import { DND_5E_CHARACTERS } from "~/data/dnd";
import CharacterDisplayCard from "./CharacterDisplayCard";
import { useMemo, useState, useCallback } from "react";
import { logger } from "~/utils/logger";
import { useGlobalToast } from "~/utils/toast";
import { debounce } from "~/utils/debounce";
import { useSlotValidation } from "~/hooks/useSlotValidation"; // Import the new hook

interface PlayerSetupSlotProps {
    slotIndex: number;
    playerSlot: PlayerSlot;
    allCharacters: Character[];
    userOwnCharacters?: Character[]; // Characters owned by the current user (for own slot in lobby)
    allSlots: PlayerSlot[];
    onSlotChange: (slotIndex: number, newPlayerSlot: PlayerSlot) => void;
    onEditCharacter: (character: Character, slotIndex: number) => void;
    onDeleteCharacter: (characterId: string) => void;
    onToggleReady: (slotIndex: number, isReady: boolean) => void;
    showManagementButtons: boolean;
    currentUserId?: string;
    isLobbyView?: boolean;
    maxPlayers?: number; // Maximum players allowed in room (default: 4)
    roomStatus?: string; // Current room status (lobby, scenario_selection, etc.)
    syncStatus?: SlotSyncState; // NEW: Sync status for visual feedback
    onRetrySyncError?: () => void; // NEW: Callback for retrying sync errors
}

export default function PlayerSetupSlot({
    slotIndex,
    playerSlot,
    allCharacters,
    userOwnCharacters,
    allSlots,
    onSlotChange,
    onEditCharacter,
    onDeleteCharacter,
    onToggleReady,
    showManagementButtons,
    currentUserId,
    isLobbyView,
    maxPlayers = 4,
    roomStatus = 'lobby',
    syncStatus, // NEW: Sync status for visual feedback
    onRetrySyncError, // NEW: Callback for retrying sync errors
}: PlayerSetupSlotProps) {
    const { type, characterId, isReady, username, userId } = playerSlot; // <-- Destructure username and userId
    const [showCharacterModal, setShowCharacterModal] = useState(false);
    const { showToast } = useGlobalToast();
        const [imageError, setImageError] = useState(false);
    
        // Debounce onSlotChange and onToggleReady
        const debouncedOnSlotChange = useMemo(() => debounce(onSlotChange, 300), [onSlotChange]);
        const debouncedOnToggleReady = useMemo(() => debounce(onToggleReady, 300), [onToggleReady]);
        
        const selectedCharacter = useMemo(() => 
            allCharacters.find(c => c.id === characterId)
        , [allCharacters, characterId]);
    
        // Use the new custom hook for slot validation
        const {
            ownershipValidation,
            capacityValidation,
            isOwnSlot,
            canTakeSlot,
            isRoomFull,
            userHasMaxSlots,
            userSlotCount,
            uniquePlayers,
            occupiedSlots,
        } = useSlotValidation(
            slotIndex,
            playerSlot,
            currentUserId,
            selectedCharacter,
            allSlots,
            isLobbyView,
            maxPlayers
        );
    
    // Use user's own characters if available and it's their slot, otherwise use allCharacters (for display only)
    const charactersForSelection = isOwnSlot && userOwnCharacters ? userOwnCharacters : allCharacters;

    // For locked slots, get character name from slot data or from the character object
    type PlayerSlotWithCharacterName = PlayerSlot & { characterName?: string };
    const getDisplayCharacterName = useCallback((): string | null => {
        if ((playerSlot as PlayerSlotWithCharacterName).characterName) {
            return (playerSlot as PlayerSlotWithCharacterName).characterName || null;
        }
        return selectedCharacter?.name || null;
    }, [playerSlot, selectedCharacter]);

    // Enhanced slot state detection
    const slotHasCharacter = characterId && type !== 'None';
    const slotIsEmpty = !characterId || type === 'None';

    const availableCharacters = useMemo(() => {
        // Only filter out characters that are occupied by OTHER slots (not this one)
        const occupiedIds = new Set(allSlots
            .map((s, idx) => (idx !== slotIndex && s.characterId) ? s.characterId : null)
            .filter((id): id is string => !!id)
        );
        
        // Filter out characters that are occupied AND check ownership for own slots
        const filtered = charactersForSelection.filter(c => {
            const isOccupied = occupiedIds.has(c.id);
            const isOwnedByCurrentUser = c.userId === currentUserId;
            
            // If this is the current user's slot, only allow characters they own
            if (isOwnSlot && currentUserId) {
                return !isOccupied && isOwnedByCurrentUser;
            }
            
            // For other players' slots, allow viewing but not selecting occupied characters
            return !isOccupied;
        });
        
        logger.debug('Available characters for slot', {
            slotIndex,
            totalCharacters: charactersForSelection.length,
            occupiedIds: Array.from(occupiedIds),
            filteredCount: filtered.length,
            isOwnSlot,
            currentUserId
        });
        
        return filtered;
    }, [charactersForSelection, allSlots, slotIndex, currentUserId, isOwnSlot]);

    // Determine if slot is locked (lobby view + not own slot)
    const isSlotLocked = isLobbyView && !isOwnSlot;

    const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        if (isSlotLocked) return;
        
        const newType = e.target.value as PlayerSlot['type'];
        
        logger.debug('Slot type change', {
            slotIndex,
            newType,
            isRoomFull,
            userHasMaxSlots,
            userSlotCount,
            currentUserId
        });
        
        // Check if room is full and user is trying to join
        if (newType !== 'None' && isRoomFull && !isOwnSlot) {
            logger.warn('Room is full, cannot join', { slotIndex, userSlotCount, uniquePlayers, maxPlayers });
            showToast(`Cannot join room: Room is full (${maxPlayers} players max).`, 'error');
            return;
        }
        
        // Check if user has reached their slot limit
        if (newType !== 'None' && userHasMaxSlots && !isOwnSlot) {
            logger.warn('User has reached slot limit', { slotIndex, userSlotCount });
            showToast('Cannot take more slots: You can only control up to 2 slots per room.', 'error');
            return;
        }
        
        // Check if slot is already occupied by another user's character
        if (newType !== 'None' && playerSlot.characterId && playerSlot.userId && playerSlot.userId !== currentUserId) {
            logger.warn('Slot already occupied by another player', { slotIndex, slotUserId: playerSlot.userId });
            showToast("Cannot take this slot - it's already occupied by another player's character.", 'error');
            return;
        }
        
        let newCharacterId: string | null = null;
        let newIsReady = false;
        let newUserId: string | undefined = playerSlot.userId;
        let newUsername: string | undefined = playerSlot.username ?? undefined;

        if (newType === 'Human' || newType === 'AI') {
            // Check if user already has 2 slots and is trying to take another
            if (userSlotCount >= 2 && !isOwnSlot) {
                logger.warn('User cannot take more slots', { slotIndex, userSlotCount });
                showToast('You can only control up to 2 slots per room.', 'error');
                return;
            }
            
            // 1. Try to keep the existing character if it's still valid/available
            const currentCharacterStillAvailable = charactersForSelection.some(c => c.id === characterId) && 
                                                 !allSlots.some((s, i) => i !== slotIndex && s.characterId === characterId);

            if (characterId && currentCharacterStillAvailable) {
                newCharacterId = characterId;
                logger.debug('Keeping existing character', { slotIndex, characterId });
            } else {
                // 2. Assign the first available character
                newCharacterId = availableCharacters.length > 0 ? availableCharacters[0].id : null;
                logger.debug('Assigning new character', { slotIndex, newCharacterId });
            }
            newIsReady = true;
            
            // Set user info when taking a slot
            if (isOwnSlot && newCharacterId) {
                // Verify the character belongs to the current user before setting user info
                const selectedCharacter = charactersForSelection.find(c => c.id === newCharacterId);
                if (selectedCharacter && selectedCharacter.userId === currentUserId) {
                    newUserId = currentUserId;
                    newUsername = playerSlot.username;
                    logger.debug('Setting user info for own slot', { slotIndex, userId: currentUserId });
                } else {
                    // Character doesn't belong to current user, don't set user info
                    newUserId = undefined;
                    newUsername = undefined;
                    logger.warn('Character does not belong to current user', { slotIndex, characterId: newCharacterId, currentUserId });
                }
            }
        } else if (newType === 'None') {
            newCharacterId = null;
            newIsReady = false;
            newUserId = undefined;
            newUsername = undefined;
            logger.debug('Clearing slot', { slotIndex });
        } else {
            // For 'Join' slot, keep existing data
            newCharacterId = characterId;
            newIsReady = isReady;
            newUserId = userId;
            newUsername = username;
        }

        logger.debug('Dispatching slot change', {
            slotIndex,
            type: newType,
            characterId: newCharacterId,
            isReady: newIsReady,
            userId: newUserId
        });

        debouncedOnSlotChange(slotIndex, {
            type: newType,
            characterId: newCharacterId,
            isReady: newIsReady,
            userId: newUserId,
            username: newUsername === null ? undefined : newUsername
        });
    }, [isSlotLocked, characterId, charactersForSelection, allSlots, slotIndex, availableCharacters, isReady, userId, username, debouncedOnSlotChange, currentUserId, isOwnSlot, isRoomFull, userHasMaxSlots, userSlotCount, maxPlayers]);

    const handleCharacterSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        // Prevent character selection if this is a locked slot (another player's slot in lobby)
        if (isSlotLocked) return;
        
        const newCharacterId = e.target.value || null;
        
        // Check if room is full and user is trying to join
        if (newCharacterId && isRoomFull && !isOwnSlot) {
            logger.warn('Room is full, cannot join with character', { slotIndex, userSlotCount });
            showToast(`Cannot join room: Room is full (${maxPlayers} players max).`, 'error');
            return;
        }
        
        // Check if user has reached their slot limit
        if (newCharacterId && userHasMaxSlots && !isOwnSlot) {
            logger.warn('User has reached slot limit when selecting character', { slotIndex, userSlotCount });
            showToast('Cannot take more slots: You can only control up to 2 slots per room.', 'error');
            return;
        }
        
        // Check if slot is already occupied by another user's character
        if (newCharacterId && playerSlot.characterId && playerSlot.userId && playerSlot.userId !== currentUserId) {
            logger.warn('Cannot change character in occupied slot', { slotIndex, slotUserId: playerSlot.userId });
            showToast("Cannot change character in this slot - it's already occupied by another player's character.", 'error');
            return;
        }
        
        let newIsReady = false;
        let newUserId: string | undefined = playerSlot.userId;
        let newUsername: string | undefined = playerSlot.username ?? undefined;

        if (playerSlot.type === 'AI') {
            newIsReady = !!newCharacterId; // AI is ready if character is selected
        } else if (playerSlot.type === 'Human') {
            newIsReady = newCharacterId ? playerSlot.isReady : false; // Human retains readiness or becomes unready if character is removed
        }

        // Set user info when character is selected (for own slot)
        if (isOwnSlot && newCharacterId) {
            // Verify the character belongs to the current user before setting user info
            const selectedCharacter = charactersForSelection.find(c => c.id === newCharacterId);
            if (selectedCharacter && selectedCharacter.userId === currentUserId) {
                newUserId = currentUserId;
                newUsername = playerSlot.username;
                logger.debug('Setting user info for character selection', { slotIndex, userId: currentUserId });
            } else {
                // Character doesn't belong to current user, don't set user info
                newUserId = undefined;
                newUsername = undefined;
                logger.warn('Character does not belong to current user during selection', { slotIndex, characterId: newCharacterId, currentUserId });
            }
        } else if (!newCharacterId) {
            // Clear user info when character is deselected
            newUserId = undefined;
            newUsername = undefined;
        }
        
        debouncedOnSlotChange(slotIndex, {
            ...playerSlot,
            characterId: newCharacterId,
            isReady: newIsReady,
            userId: newUserId,
            username: newUsername === null ? undefined : newUsername,
        });
    }, [isSlotLocked, playerSlot, slotIndex, debouncedOnSlotChange, currentUserId, isOwnSlot, charactersForSelection, isRoomFull, userHasMaxSlots, userSlotCount, maxPlayers]);

    const handleReadyToggle = useCallback(() => {
        if (isSlotLocked) return;
        // This calls the handler in rooms.tsx which updates local state
        debouncedOnToggleReady(slotIndex, !isReady);
    }, [isSlotLocked, slotIndex, isReady, debouncedOnToggleReady]);

    const handleCreateNew = useCallback(() => {
        if (isSlotLocked) return;
        // This calls the handler in rooms.tsx to open the modal
        onEditCharacter({} as Character, slotIndex);
    }, [isSlotLocked, onEditCharacter, slotIndex]);

    const handleEdit = useCallback(() => {
        if (isSlotLocked) return;
        if (selectedCharacter) {
            onEditCharacter(selectedCharacter, slotIndex);
        }
    }, [isSlotLocked, selectedCharacter, slotIndex, onEditCharacter, selectedCharacter]);

    const handleDelete = useCallback(() => {
        if (isSlotLocked) return;
        if (selectedCharacter) {
            onDeleteCharacter(selectedCharacter.id);
        }
    }, [isSlotLocked, selectedCharacter, onDeleteCharacter, selectedCharacter]);

    
        const handleCharacterModalOpen = useCallback(() => {
        if (isSlotLocked) return;
        setShowCharacterModal(true);
    }, [isSlotLocked, setShowCharacterModal]);

    const handleCharacterModalConfirm = useCallback((character: Character) => {
        if (isSlotLocked) return;
        onEditCharacter(character, slotIndex);
        setShowCharacterModal(false);
    }, [isSlotLocked, onEditCharacter, slotIndex, setShowCharacterModal]);

    const isHostSlot = slotIndex === 0; // Assuming slot 0 is the default host slot
    
    // FIX 1 & 2: Allow both Human and AI slots to be manually toggled if a character is selected.
    const canToggleReady = (type === 'Human' || type === 'AI') && !!characterId && !isSlotLocked;

    return (
        <div className={`w-full min-w-0 p-4 rounded-lg shadow-lg transition duration-300 relative
            ${isReady ? 'bg-green-900 border-2 border-green-500' : 'bg-gray-700 border-2 border-gray-600'}
            ${isHostSlot ? 'border-4 border-red-500' : ''}
            ${isSlotLocked ? 'bg-blue-900 border-blue-500' : ''}
            ${isOwnSlot && !isSlotLocked && isLobbyView ? 'border-3 border-green-500' : ''}
            ${!isOwnSlot && isSlotLocked && isLobbyView ? 'border-3 border-blue-500' : ''}
            ${!isOwnSlot && !isSlotLocked && isLobbyView ? 'border-3 border-gray-500' : ''}
            flex flex-col lg:flex-row lg:items-center gap-4
        `}>
            {/* NEW: Sync Status Indicator */}
            {syncStatus && syncStatus.status !== 'synced' && (
                <div className="absolute top-2 right-2 z-20">
                    {syncStatus.status === 'pending' && (
                        <div className="bg-yellow-600 bg-opacity-90 px-2 py-1 rounded-full text-xs text-white flex items-center space-x-1">
                            <span className="animate-pulse">⏳</span>
                            <span>Pending</span>
                        </div>
                    )}
                    {syncStatus.status === 'syncing' && (
                        <div className="bg-blue-600 bg-opacity-90 px-2 py-1 rounded-full text-xs text-white flex items-center space-x-1">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                            <span>Syncing</span>
                        </div>
                    )}
                    {syncStatus.status === 'error' && (
                        <div className="bg-red-600 bg-opacity-90 px-2 py-1 rounded-full text-xs text-white flex items-center space-x-1">
                            <span>❌</span>
                            <span>Error</span>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Show error details
                                    showToast(syncStatus.errorMessage || "Slot update failed", "error");
                                }}
                                className="ml-2 text-white hover:text-yellow-200"
                                title="View error details"
                            >
                                ℹ️
                            </button>
                            <button 
                                onClick={(e) => {
                                    e.stopPropagation();
                                    // Trigger retry by calling parent handler
                                    if (onRetrySyncError) {
                                        onRetrySyncError();
                                    }
                                }}
                                className="ml-2 text-white hover:text-green-200"
                                title="Retry"
                                disabled={!onRetrySyncError}
                            >
                                🔄
                            </button>
                        </div>
                    )}
                </div>
            )}
            <div className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4">
                <h3 className="text-xl sm:text-2xl font-bold text-center lg:text-left flex-1">
                    Slot {slotIndex + 1} 
                    {isHostSlot && " (Host)"}
                    {isSlotLocked && " (Locked)"}
                    {isRoomFull && !isOwnSlot && " (Full)"}
                    {userHasMaxSlots && !isOwnSlot && " (Limit)"}
                </h3>
                {selectedCharacter && (
                    <button
                        onClick={() => setShowCharacterModal(true)}
                        className="text-yellow-400 hover:text-yellow-300 text-lg transition"
                        title="View character details"
                    >
                        📖
                    </button>
                )}
            </div>
            
            {/* Enhanced Ownership Badge */}
            {username && (type !== 'None' || isSlotLocked) && (
                <div className={`flex items-center justify-center mb-2 p-3 rounded-lg shadow-md ${
                    isOwnSlot && !isSlotLocked && isLobbyView ? 'bg-green-800 bg-opacity-70 border-2 border-green-600' : 
                    !isOwnSlot && isSlotLocked && isLobbyView ? 'bg-blue-800 bg-opacity-70 border-2 border-blue-600' : 
                    'bg-gray-800 bg-opacity-70 border-2 border-gray-600'
                }`}>
                    {/* Avatar/Initials */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold mr-3 ${
                        isOwnSlot && !isSlotLocked && isLobbyView ? 'bg-green-600' : 
                        !isOwnSlot && isSlotLocked && isLobbyView ? 'bg-blue-600' : 
                        'bg-gray-600'
                    }`}>
                        👤
                    </div>
                    <div className="text-center">
                        <p className="text-sm font-bold text-white">
                            {isOwnSlot && !isSlotLocked && isLobbyView ? 'Your Slot' : 
                             !isOwnSlot && isSlotLocked && isLobbyView ? 'Player Slot' : 
                             'Slot'}
                        </p>
                        <p className={`text-xs ${
                            isOwnSlot && !isSlotLocked && isLobbyView ? 'text-green-200' : 
                            !isOwnSlot && isSlotLocked && isLobbyView ? 'text-blue-200' : 
                            'text-gray-300'
                        }`}>
                            {username}
                        </p>
                        {isLobbyView && (
                            <p className="text-xs text-gray-400 mt-1">
                                Room: {uniquePlayers}/{maxPlayers} players • Slots: {occupiedSlots}/4 occupied
                            </p>
                        )}
                    </div>
                </div>
            )}
            
{/* NEW: Display Room Full Message */}
            {isRoomFull && !isOwnSlot && (
                <p className="text-xs text-red-400 text-center mb-2 font-semibold">
                    🚫 Room Full ({uniquePlayers}/{maxPlayers} players)
                </p>
            )}
            
            {/* NEW: Display User Slot Limit Message */}
            {userHasMaxSlots && !isOwnSlot && (
                <p className="text-xs text-orange-400 text-center mb-2 font-semibold">
                    ⚠️ Slot Limit Reached (2/2 slots)
                </p>
            )}
            
            {/* NEW: Display Locked Message */}
            {isSlotLocked && (
                <p className="text-xs text-red-400 text-center mb-2 font-semibold">
                    🔒 Locked by another player
                </p>
            )}
            
            {/* NEW: Display Character Ownership Warning */}
            {!isSlotLocked && isLobbyView && selectedCharacter && !canTakeSlot && (
                <p className="text-xs text-orange-400 text-center mb-2 font-semibold">
                    ⚠️ Character belongs to another player - select a different character
                </p>
            )}
            
            {/* NEW: Display Occupied by Another Player Message */}
            {!isSlotLocked && isLobbyView && selectedCharacter && playerSlot.userId && playerSlot.userId !== currentUserId && (
                <p className="text-xs text-red-400 text-center mb-2 font-semibold">
                    🚫 This slot is occupied by another player's character
                </p>
            )}
            
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-300 mb-1">Slot Type</label>
                <select
                    value={type}
                    onChange={handleTypeChange}
                    disabled={isSlotLocked}
                    className={`w-full p-2 rounded bg-gray-800 border border-gray-600 text-white ${
                        isSlotLocked ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                >
                    <option value="None">None</option>
                    <option value="Human">Player (Human)</option>
                    <option value="AI">AI Companion</option>
                </select>
            </div>

            {(type === 'Human' || type === 'AI') && (
                <div className="mb-4">
                    {isSlotLocked ? (
                        // For locked slots: just display the character name and more stats, no dropdown
                        <div className="p-2 rounded bg-gray-800 border border-gray-600 text-white">
                            <p className="text-sm font-medium text-gray-300 mb-1">Character</p>
                            <p className="text-base font-semibold text-yellow-300">
                                {getDisplayCharacterName() || 'Unknown Character'}
                            </p>
                            {selectedCharacter && (
                                <>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {selectedCharacter.class} - Lvl {selectedCharacter.level || 1}
                                    </p>
                                    <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
                                        <div className="text-gray-400">HP: <span className="text-green-400">{selectedCharacter.hp}/{selectedCharacter.maxHp}</span></div>
                                        <div className="text-gray-400">AC: <span className="text-blue-400">{selectedCharacter.ac}</span></div>
                                        <div className="text-gray-400">Init: <span className="text-purple-400">{selectedCharacter.initiative > 0 ? '+' : ''}{selectedCharacter.initiative}</span></div>
                                        <div className="text-gray-400">PP: <span className="text-yellow-400">{selectedCharacter.passivePerception}</span></div>
                                    </div>
                                </>
                            )}
                        </div>
                    ) : (
                        // For unlocked slots: show character selection dropdown
                        <>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Select Character</label>
                            <select
                                value={characterId || ''}
                                onChange={handleCharacterSelect}
                                disabled={isSlotLocked}
                                className={`w-full p-2 rounded bg-gray-800 border border-gray-600 text-white ${
                                    isSlotLocked ? 'opacity-50 cursor-not-allowed' : ''
                                }`}
                            >
                                <option value="">--- Select ---</option>
                                {availableCharacters.map(char => (
                                    <option key={char.id} value={char.id}>
                                        {char.name} ({char.class})
                                    </option>
                                ))}
                            </select>
                            
                            <button 
                                type="button" // CRITICAL: Prevents accidental form submission
                                onClick={handleCreateNew}
                                className="mt-2 w-full py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition duration-200"
                            >
                                Create New Character
                            </button>
                        </>
                    )}
                </div>
            )}

            {/* Show character card only for own unlocked slots or in dashboard */}
            {selectedCharacter && !isSlotLocked && (
                <div className="mb-4">
                    {/* Enhanced character display with portrait */}
                    {isLobbyView ? (
                        <div className="p-3 rounded bg-gray-800 border border-gray-600 text-white">
                            <div className="flex flex-col items-center">
                                {/* TOP SECTION: Portrait + Name + Level */}
                                <div className="text-center mb-3">
                                    {/* Character Portrait */}
                                    <div className="mx-auto">
                                        {/* NEW: Image error state */}
                                        {/* Make sure this useState is declared at the top level of the component or within the block that always executes */}
                                        {/* For now, we'll assume it's declared higher up. If not, this needs adjustment. */}
                                        {/* Re-reading the file, it's NOT declared at the top. It needs to be inside the component function. */}
                                        {/* Let's put it here for now for the replacement, assuming its scope is fine */}
                                        {/* No, it needs to be declared outside of the conditional render, at the top of the PlayerSetupSlot component function. */}
                                        {/* I will add it after other state declarations. */}

                                        {selectedCharacter.avatarUrl && !imageError ? (
                                            <img 
                                                src={selectedCharacter.avatarUrl} 
                                                alt={`${selectedCharacter.name} portrait`}
                                                className="w-20 h-20 md:w-28 md:h-28 lg:w-32 lg:h-32 aspect-square object-cover border-3 border-gray-500 rounded-lg shadow-lg"
                                                onError={() => setImageError(true)}
                                            />
                                        ) : (
                                            <div className="fallback-avatar w-20 h-20 md:w-28 md:h-28 lg:w-32 lg:h-32 aspect-square border-3 border-gray-500 rounded-lg shadow-lg bg-gradient-to-br from-amber-500 via-orange-600 to-red-600 flex items-center justify-center text-white font-black text-3xl md:text-4xl lg:text-5xl ring-2 ring-amber-400/50 shadow-inner">
                                                {selectedCharacter.name.charAt(0).toUpperCase()}
                                            </div>
                                        )}
                                    </div>

                                    {/* Name and Badges */}
                                    <div className="mt-2 space-y-2">
                                        <p className="font-bold text-xl md:text-2xl text-yellow-300 truncate">{selectedCharacter.name}</p>
                                        <div className="flex items-center justify-center space-x-2">
                                            <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded">
                                                Lvl {selectedCharacter.level}
                                            </span>
                                            {selectedCharacter.alignment && (
                                                <span className="bg-gray-600 text-gray-200 text-xs px-2 py-1 rounded">
                                                    {selectedCharacter.alignment}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                
                                {/* MIDDLE SECTION: Race/Class + HP/AC */}
                                <div className="w-full px-2 py-2 bg-gray-800 bg-opacity-50 rounded mb-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-gray-300 truncate text-sm">
                                            {selectedCharacter.race} {selectedCharacter.class}
                                        </p>
                                        <div className="flex items-center space-x-3 text-sm">
                                            <span className="text-green-400 font-semibold">HP: {selectedCharacter.hp}/{selectedCharacter.maxHp}</span>
                                            <span className="text-blue-400 font-semibold">AC: {selectedCharacter.ac}</span>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* BOTTOM SECTION: Stats Grid */}
                                <div className="w-full">
                                    {/* Additional Stats Row */}
                                    <div className="flex items-center justify-between mb-2 px-1">
                                        <div className="flex items-center space-x-3 text-xs text-gray-400">
                                            <span>Init: {selectedCharacter.initiative > 0 ? '+' : ''}{selectedCharacter.initiative}</span>
                                            <span>PP: {selectedCharacter.passivePerception}</span>
                                            {selectedCharacter.background && (
                                                <span className="text-gray-500">•</span>
                                            )}
                                            {selectedCharacter.background && (
                                                <span className="text-gray-400">{selectedCharacter.background}</span>
                                            )}
                                        </div>
                                        
                                        {/* Primary Attribute */}
                                        {selectedCharacter.primaryAttribute && (
                                            <span className="bg-purple-600 text-white text-xs px-2 py-1 rounded">
                                                {selectedCharacter.primaryAttribute}
                                            </span>
                                        )}
                                    </div>

                                    {/* Quick Stats */}
                                    <div className="grid grid-cols-6 gap-2">
                                        <div className="text-center text-xs">
                                            <div className="text-gray-400">STR</div>
                                            <div className="text-white font-bold">
                                                {selectedCharacter.stats?.strength || 10}
                                            </div>
                                        </div>
                                        <div className="text-center text-xs">
                                            <div className="text-gray-400">DEX</div>
                                            <div className="text-white font-bold">
                                                {selectedCharacter.stats?.dexterity || 10}
                                            </div>
                                        </div>
                                        <div className="text-center text-xs">
                                            <div className="text-gray-400">CON</div>
                                            <div className="text-white font-bold">
                                                {selectedCharacter.stats?.constitution || 10}
                                            </div>
                                        </div>
                                        <div className="text-center text-xs">
                                            <div className="text-gray-400">INT</div>
                                            <div className="text-white font-bold">
                                                {selectedCharacter.stats?.intelligence || 10}
                                            </div>
                                        </div>
                                        <div className="text-center text-xs">
                                            <div className="text-gray-400">WIS</div>
                                            <div className="text-white font-bold">
                                                {selectedCharacter.stats?.wisdom || 10}
                                            </div>
                                        </div>
                                        <div className="text-center text-xs">
                                            <div className="text-gray-400">CHA</div>
                                            <div className="text-white font-bold">
                                                {selectedCharacter.stats?.charisma || 10}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    {/* Equipment Preview */}
                                    {selectedCharacter.equipment && selectedCharacter.equipment.length > 0 && (
                                        <div className="w-full mt-3 pt-3 border-t border-gray-700">
                                            <p className="text-xs text-gray-400 mb-1">Equipment:</p>
                                            <div className="flex flex-wrap gap-1">
                                                {selectedCharacter.equipment.slice(0, 4).map((item, index) => (
                                                    <span key={index} className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
                                                        {item}
                                                    </span>
                                                ))}
                                                {selectedCharacter.equipment.length > 4 && (
                                                    <span className="bg-gray-700 text-gray-300 text-xs px-2 py-1 rounded">
                                                        +{selectedCharacter.equipment.length - 4} more
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : (
                        <CharacterDisplayCard character={selectedCharacter} size="large" />
                    )}
                    {/* Only show edit/delete buttons in dashboard (when not in lobby view) */}
                    {showManagementButtons && !isSlotLocked && !isLobbyView && (
                        <div className="flex space-x-2 mt-2">
                            <button 
                                type="button" // CRITICAL: Prevents accidental form submission
                                onClick={handleEdit}
                                className="flex-1 py-1 bg-yellow-600 hover:bg-yellow-500 text-white text-sm rounded transition duration-200"
                            >
                                Edit
                            </button>
                            <button 
                                type="button" // CRITICAL: Prevents accidental form submission
                                onClick={handleDelete}
                                className="flex-1 py-1 bg-red-600 hover:bg-red-500 text-white text-sm rounded transition duration-200"
                            >
                                Delete
                            </button>
                        </div>
                    )}
                </div>
            )}

            <div className="mt-4 text-center">
                {/* For locked slots (other players in lobby), show their ready status */}
                {isSlotLocked ? (
                    <div className={`w-full py-2 font-bold rounded text-center ${
                        isReady
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-600 text-gray-300'
                    }`}>
                        {isReady ? '✅ Ready' : '⏳ Unready'}
                    </div>
                ) : canToggleReady ? (
                    <button
                        type="button" // CRITICAL: Prevents accidental form submission
                        onClick={(e) => {
                            e.preventDefault(); // Explicitly prevent form submission
                            handleReadyToggle();
                        }}
                        className={`w-full py-2 font-bold rounded transition duration-300 
                            ${isReady 
                                ? 'bg-red-600 hover:bg-red-500 text-white' 
                                : 'bg-green-600 hover:bg-green-500 text-white'
                            }`}
                    >
                        {isReady ? 'Set Unready' : 'Set Ready'}
                    </button>
                ) : (
                    <button
                        type="button"
                        disabled
                        className={`w-full py-2 font-bold rounded cursor-not-allowed bg-gray-500 text-gray-300`}
                    >
                        {type === 'None' ? 'Cannot Set Ready' : 'Select Character to Ready'}
                    </button>
                )}
            </div>

            {/* Character Details Modal */}
            {showCharacterModal && selectedCharacter && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
                    <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full border-2 border-yellow-400 shadow-2xl">
                        <div className="flex justify-between items-center mb-4">
                            <div className="flex items-center space-x-3">
                                <div className="w-12 h-12 bg-yellow-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                                    {selectedCharacter.name.charAt(0)}
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-yellow-300">{selectedCharacter.name}</h2>
                                    <p className="text-gray-400 text-sm">{selectedCharacter.race} {selectedCharacter.class} (Level {selectedCharacter.level})</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowCharacterModal(false)}
                                className="text-gray-400 hover:text-white text-2xl"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Character Status Indicators */}
                        <div className="flex items-center justify-between mb-4 p-3 bg-blue-900 bg-opacity-20 border border-blue-600 rounded-lg">
                            <div className="flex items-center space-x-4 text-sm">
                                <span className="bg-green-600 px-2 py-1 rounded text-white text-xs">Active</span>
                                <span className="text-blue-300">Slot: {slotIndex + 1}</span>
                            </div>
                            <div className="text-right text-sm">
                                <div className="text-gray-400">Character ID</div>
                                <div className="text-white font-mono text-xs">{selectedCharacter.id}</div>
                            </div>
                        </div>

                        <div className="space-y-3 text-sm">
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <p className="text-gray-400">Class</p>
                                    <p className="text-white font-semibold">{selectedCharacter.class}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Race</p>
                                    <p className="text-white font-semibold">{selectedCharacter.race || 'N/A'}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Level</p>
                                    <p className="text-white font-semibold">{selectedCharacter.level}</p>
                                </div>
                                <div>
                                    <p className="text-gray-400">Experience</p>
                                    <p className="text-white font-semibold">{selectedCharacter.experience}</p>
                                </div>
                            </div>

                            <div className="border-t border-gray-700 pt-3">
                                <p className="text-gray-400 mb-2">Core Stats</p>
                                <div className="grid grid-cols-3 gap-2">
                                    <div className="bg-gray-700 p-2 rounded text-center">
                                        <p className="text-xs text-gray-400">HP</p>
                                        <p className="text-green-400 font-bold">{selectedCharacter.hp}/{selectedCharacter.maxHp}</p>
                                    </div>
                                    <div className="bg-gray-700 p-2 rounded text-center">
                                        <p className="text-xs text-gray-400">AC</p>
                                        <p className="text-blue-400 font-bold">{selectedCharacter.ac}</p>
                                    </div>
                                    <div className="bg-gray-700 p-2 rounded text-center">
                                        <p className="text-xs text-gray-400">Init</p>
                                        <p className="text-purple-400 font-bold">{selectedCharacter.initiative > 0 ? '+' : ''}{selectedCharacter.initiative}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-gray-700 pt-3">
                                <p className="text-gray-400 mb-2">Attributes</p>
                                <div className="grid grid-cols-3 gap-2 text-xs">
                                    <div className="text-center">
                                        <p className="text-gray-400">STR</p>
                                        <p className="text-white font-bold">{selectedCharacter.stats?.strength || 10}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-gray-400">DEX</p>
                                        <p className="text-white font-bold">{selectedCharacter.stats?.dexterity || 10}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-gray-400">CON</p>
                                        <p className="text-white font-bold">{selectedCharacter.stats?.constitution || 10}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-gray-400">INT</p>
                                        <p className="text-white font-bold">{selectedCharacter.stats?.intelligence || 10}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-gray-400">WIS</p>
                                        <p className="text-white font-bold">{selectedCharacter.stats?.wisdom || 10}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-gray-400">CHA</p>
                                        <p className="text-white font-bold">{selectedCharacter.stats?.charisma || 10}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-gray-700 pt-3">
                                <p className="text-gray-400 mb-2">Other Stats</p>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div>
                                        <p className="text-gray-400">Passive Perception</p>
                                        <p className="text-yellow-400 font-bold">{selectedCharacter.passivePerception}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-400">Proficiency Bonus</p>
                                        <p className="text-blue-400 font-bold">+{selectedCharacter.proficiencyBonus}</p>
                                    </div>
                                </div>
                            </div>

                            {selectedCharacter.background && (
                                <div className="border-t border-gray-700 pt-3">
                                    <p className="text-gray-400">Background</p>
                                    <p className="text-white">{selectedCharacter.background}</p>
                                </div>
                            )}

                            <button
                                onClick={() => setShowCharacterModal(false)}
                                className="w-full mt-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded transition"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
