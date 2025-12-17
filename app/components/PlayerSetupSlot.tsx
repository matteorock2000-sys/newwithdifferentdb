import type { Character, PlayerSlot, SlotSyncState } from "~/types";
import { DND_5E_CHARACTERS } from "~/data/dnd";
import CharacterDisplayCard from "./CharacterDisplayCard";
import { useMemo, useState, useCallback, useEffect } from "react";
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
    currentUsername?: string; // NEW PROP
    isLobbyView?: boolean;
    viewMode?: "dashboard" | "rooms" | "lobby"; // NEW: Explicit view mode for layout variants
    maxPlayers?: number; // Maximum players allowed in room (default: 4)
    roomStatus?: string; // Current room status (lobby, scenario_selection, etc.)
    syncStatus?: SlotSyncState; // NEW: Callback for retrying sync errors
    onRetrySyncError?: () => void; // NEW: Callback for retrying sync errors
    demoRolls?: Record<number, number>; // NEW: Demo rolls for immediate dice display
    diceRolls?: Record<number, number>; // NEW: Server-side dice rolls
    onPlayerRollComplete?: (slotIndex: number, result: number, userId: string) => void; // NEW: Callback for dice rolls
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
    currentUsername, // ADDED THIS LINE
    isLobbyView,
    viewMode, // NEW: View mode for layout variants
    maxPlayers = 4,
    roomStatus = 'lobby',
    syncStatus, // NEW: Sync status for visual feedback
    onRetrySyncError, // NEW: Callback for retrying sync errors
    demoRolls, // NEW: Demo rolls for immediate dice display
    diceRolls, // NEW: Server-side dice rolls
    onPlayerRollComplete, // NEW: Callback for dice rolls
}: PlayerSetupSlotProps) {
    // Destructure props first
    const { type, characterId, isReady, username, userId } = playerSlot;

    // Determine view mode for layout variants
    const resolvedViewMode = viewMode || (
        !isLobbyView && showManagementButtons ? 'dashboard' :
        isLobbyView && !showManagementButtons ? 'rooms' :
        isLobbyView && showManagementButtons ? 'lobby' :
        'rooms' // default
    );

    // View-specific layout classes
    const getLayoutClasses = () => {
        switch (resolvedViewMode) {
            case 'dashboard':
                return {
                    container: 'flex flex-col gap-6 p-6 bg-gray-800 border-2 border-gray-700 shadow-xl',
                    cardSize: 'large',
                    portraitSize: 'lg:w-40 lg:h-40',
                    statsLayout: 'grid-cols-3',
                    attributesLayout: 'grid-cols-6',
                    equipmentCols: 'grid-cols-2',
                    buttonLayout: 'flex gap-3 mt-4'
                };
            case 'rooms':
                return {
                    container: 'flex flex-col md:flex-row md:items-center gap-4 p-4 bg-gray-700 border-2 border-gray-600 shadow-lg',
                    cardSize: 'medium',
                    portraitSize: 'md:w-32 md:h-32',
                    statsLayout: 'grid-cols-3',
                    attributesLayout: 'grid-cols-6',
                    equipmentCols: 'grid-cols-2',
                    buttonLayout: 'hidden' // No edit/delete buttons in rooms view
                };
            case 'lobby':
                return {
                    container: 'flex flex-col gap-3 p-3 bg-gray-750 border-2 border-gray-600 shadow-md',
                    cardSize: 'medium',
                    portraitSize: 'w-28 h-28 md:w-32 md:h-32',
                    statsLayout: 'grid-cols-2',
                    attributesLayout: 'grid-cols-6',
                    equipmentCols: 'grid-cols-2',
                    buttonLayout: 'hidden' // No edit/delete buttons in lobby view
                };
            default:
                return {
                    container: 'flex flex-col lg:flex-row lg:items-center gap-4 p-4',
                    cardSize: 'medium',
                    portraitSize: 'md:w-32 md:h-32',
                    statsLayout: 'grid-cols-3',
                    attributesLayout: 'grid-cols-6',
                    equipmentCols: 'grid-cols-2',
                    buttonLayout: 'flex gap-2 mt-2'
                };
        }
    };

    const layoutClasses = getLayoutClasses();
    
    const { showToast } = useGlobalToast();
    const [imageError, setImageError] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [isImageLoading, setIsImageLoading] = useState(true);
    const [showSkeleton, setShowSkeleton] = useState(false);
    // const [showEquipment, setShowEquipment] = useState(false); // Removed: Collapsible equipment state

    // Debounce onSlotChange and onToggleReady
    const debouncedOnSlotChange = useMemo(() => debounce(onSlotChange, 300), [onSlotChange]);
    const debouncedOnToggleReady = useMemo(() => debounce(onToggleReady, 300), [onToggleReady]);
    
    // Debounce for hover/expand state to prevent rapid toggling
    const debouncedSetIsExpandedFalse = useMemo(() => debounce(() => setIsExpanded(false), 200), []);

    // Effect to handle delayed display of skeleton loader
    useEffect(() => {
        if (isImageLoading) {
            const timer = setTimeout(() => {
                setShowSkeleton(true);
            }, 500); // Show skeleton after 500ms
            return () => clearTimeout(timer);
        } else {
            setShowSkeleton(false); // Hide skeleton immediately if image loads
        }
    }, [isImageLoading]);
    
    // selectedCharacter must be defined BEFORE the useEffect that depends on it
    const selectedCharacter = useMemo(() => 
        allCharacters.find(c => c.id === characterId)
    , [allCharacters, characterId]);

    // Handle image loading and error state
    useEffect(() => {
        // Always start as loading when avatarUrl (or character) changes
        setIsImageLoading(true);
        setImageError(false);

        if (selectedCharacter?.avatarUrl) {
            const img = new Image();
            img.src = selectedCharacter.avatarUrl;

            const handleLoad = () => {
                setIsImageLoading(false);
                logger.debug(`Image loaded for character ${selectedCharacter.name}: ${selectedCharacter.avatarUrl}`);
            };
            const handleError = () => {
                setImageError(true);
                setIsImageLoading(false);
                logger.warn(`Image failed to load for character ${selectedCharacter.name}: ${selectedCharacter.avatarUrl}`);
            };

            // Attach event listeners
            img.onload = handleLoad;
            img.onerror = handleError;

            // Clean up event listeners if the component unmounts or dependencies change
            return () => {
                img.onload = null;
                img.onerror = null;
            };
        } else {
            // No avatarUrl, so nothing to load, image is effectively not loading
            setIsImageLoading(false);
        }
    }, [selectedCharacter?.avatarUrl, selectedCharacter?.name]); // Depend on avatarUrl and name for logging

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

    // Fallback logic for isOwnSlot when currentUserId is undefined (for backward compatibility)
    // const effectiveIsOwnSlot = currentUserId ? isOwnSlot : (playerSlot.userId ? playerSlot.userId === currentUserId : !playerSlot.userId);

    // Determine if slot is locked (lobby view + not own slot)
    const isSlotLocked = isLobbyView && playerSlot.userId && playerSlot.userId !== currentUserId;

    // Callbacks that depend on isSlotLocked (and other states/props defined above)
    const handleMouseEnter = useCallback(() => {
        if (isSlotLocked) return;
        setIsExpanded(true);
        debouncedSetIsExpandedFalse.cancel(); // Cancel any pending mouse leave debounces
    }, [isSlotLocked, debouncedSetIsExpandedFalse]);

    const handleMouseLeave = useCallback(() => {
        if (isSlotLocked) return;
        debouncedSetIsExpandedFalse(); // Trigger debounced collapse
    }, [isSlotLocked, debouncedSetIsExpandedFalse]);

    const handleCardClick = useCallback(() => {
        if (isSlotLocked) return;
        setIsExpanded(prev => !prev);
        debouncedSetIsExpandedFalse.cancel(); // Cancel any pending mouse leave debounces
    }, [isSlotLocked, debouncedSetIsExpandedFalse]);
    
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
    // const slotHasCharacter = characterId && type !== 'None';
    // const slotIsEmpty = !characterId || type === 'None';

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
            if (newCharacterId) { // Check if a character is being assigned
                const selectedCharacter = charactersForSelection.find(c => c.id === newCharacterId);
                
                if (newType === 'Human') { // If it's a Human slot, ensure character ownership
                    if (selectedCharacter && selectedCharacter.userId === currentUserId) {
                        newUserId = currentUserId;
                        newUsername = currentUsername || playerSlot.username;
                        logger.debug('Setting user info for own human slot', { slotIndex, userId: currentUserId });
                    } else {
                        // Character doesn't belong to current user, don't set user info for human slot
                        newUserId = undefined;
                        newUsername = undefined;
                        logger.warn('Character for human slot does not belong to current user', { slotIndex, characterId: newCharacterId, currentUserId });
                    }
                } else if (newType === 'AI') { // If it's an AI slot, ownership by current user is not required
                    // An AI character can be assigned by anyone (e.g., GM)
                    // The slot itself is still 'owned' by the user who assigns the AI, if it was a free slot they took.
                    // For now, let's assume the user who is interacting with the slot "owns" the AI assignment
                    newUserId = currentUserId; // The user making the change "owns" the AI slot control
                    newUsername = currentUsername || playerSlot.username; // Use currentUsername or fallback to existing
                    logger.debug('Setting user info for AI slot (assigned by current user)', { slotIndex, userId: currentUserId, newUsername: newUsername });
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
            ...playerSlot,
            type: newType, // Add this line to update the type
            characterId: newCharacterId,
            isReady: newIsReady,
            userId: newUserId,
            username: newUsername === null ? undefined : newUsername
        });
    }, [isSlotLocked, characterId, charactersForSelection, allSlots, slotIndex, availableCharacters, isReady, userId, username, debouncedOnSlotChange, currentUserId, isOwnSlot, isRoomFull, userHasMaxSlots, userSlotCount, maxPlayers, showToast, uniquePlayers, playerSlot]);

    const handleCharacterSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        if (isSlotLocked) return;
        
        const newCharacterId = e.target.value || null;
        
        if (newCharacterId && isRoomFull && !isOwnSlot) {
            logger.warn('Room is full, cannot join with character', { slotIndex, userSlotCount });
            showToast(`Cannot join room: Room is full (${maxPlayers} players max).`, 'error');
            return;
        }
        
        if (newCharacterId && userHasMaxSlots && !isOwnSlot) {
            logger.warn('User has reached slot limit when selecting character', { slotIndex, userSlotCount });
            showToast('Cannot take more slots: You can only control up to 2 slots per room.', 'error');
            return;
        }
        
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

        if (isOwnSlot && newCharacterId) {
            const selectedCharacter = charactersForSelection.find(c => c.id === newCharacterId);
            if (selectedCharacter && selectedCharacter.userId === currentUserId) {
                newUserId = currentUserId;
                newUsername = currentUsername || playerSlot.username;
                logger.debug('Setting user info for character selection', { slotIndex, userId: currentUserId });
            } else {
                newUserId = undefined;
                newUsername = undefined;
                logger.warn('Character does not belong to current user during selection', { slotIndex, characterId: newCharacterId, currentUserId });
            }
        } else if (!newCharacterId) {
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
    }, [isSlotLocked, playerSlot, slotIndex, debouncedOnSlotChange, currentUserId, isOwnSlot, charactersForSelection, isRoomFull, userHasMaxSlots, userSlotCount, maxPlayers, showToast]);

    const handleReadyToggle = useCallback(() => {
        if (isSlotLocked) return;
        debouncedOnToggleReady(slotIndex, !isReady);
    }, [isSlotLocked, slotIndex, isReady, debouncedOnToggleReady]);

    const handleCreateNew = useCallback(() => {
        if (isSlotLocked) return;
        onEditCharacter({} as Character, slotIndex);
    }, [isSlotLocked, onEditCharacter, slotIndex]);

    const handleEdit = useCallback(() => {
        if (isSlotLocked) return;
        if (selectedCharacter) {
            onEditCharacter(selectedCharacter, slotIndex);
        }
    }, [isSlotLocked, selectedCharacter, slotIndex, onEditCharacter]);

    const handleDelete = useCallback(() => {
        if (isSlotLocked) return;
        if (selectedCharacter) {
            onDeleteCharacter(selectedCharacter.id);
        }
    }, [isSlotLocked, selectedCharacter, onDeleteCharacter]);

    
    



    const isHostSlot = slotIndex === 0; // Assuming slot 0 is the default host slot
    
    const canToggleReady = (type === 'Human' || type === 'AI') && !!characterId && !isSlotLocked;

    logger.debug(`PlayerSetupSlot [${slotIndex}] Props & State:`, {
        isLobbyView,
        isOwnSlot,
        isSlotLocked,
        playerSlotCharacterId: playerSlot.characterId,
        selectedCharacter: selectedCharacter ? { id: selectedCharacter.id, name: selectedCharacter.name, avatarUrl: selectedCharacter.avatarUrl } : null,
        availableCharactersCount: availableCharacters.length,
        selectDisabled: isSlotLocked,
    });
    return (
        <div className={`w-full min-w-0 p-4 rounded-lg shadow-lg transition duration-300 relative
            ${isReady ? 'bg-green-900 border-2 border-green-500' : 'bg-gray-700 border-2 border-gray-600'}
            ${isHostSlot ? 'border-4 border-red-500' : ''}
            ${isSlotLocked ? 'bg-blue-900 border-blue-500' : ''}
            ${isOwnSlot && !isSlotLocked && isLobbyView ? 'border-3 border-green-500' : ''}
            ${!isOwnSlot && isSlotLocked && isLobbyView ? 'border-3 border-blue-500' : ''}
            ${!isOwnSlot && !isSlotLocked && isLobbyView ? 'border-3 border-gray-500' : ''}
            flex flex-col gap-4
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
            <div className="flex flex-col gap-3">
                <h3 className="text-base sm:text-lg font-bold text-center flex-1">
                    Slot {slotIndex + 1} 
                    {isHostSlot && " (Host)"}
                    {isSlotLocked && " (Locked)"}
                    {isRoomFull && !isOwnSlot && " (Full)"}
                    {userHasMaxSlots && !isOwnSlot && " (Limit)"}
                </h3>
            </div>
            
            {/* Enhanced Ownership Badge */}
            {username && (type !== 'None' || isSlotLocked) && (
                <div className={`flex items-center justify-center mb-4 p-3 rounded-lg shadow-md ${
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
            
            <div className="mb-4 space-y-3">
                {/* Slot Type Selection */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-300">Slot Type</label>
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

                {/* Character Selection (only for Human/AI types) */}
                {(type === 'Human' || type === 'AI') && (
                    <div className="space-y-2">
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
                                <label htmlFor={`character-select-${slotIndex}`} className="block text-sm font-medium text-gray-300">Select Character</label>
                                <select
                                    id={`character-select-${slotIndex}`}
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
                                    className="w-full py-1 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded transition duration-200"
                                >
                                    Create New Character
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Show character card only for own unlocked slots or in dashboard */}
            {selectedCharacter && !isSlotLocked && (
                <div className="mb-4">
                    {/* Enhanced character display with hover/expand system */}
                    {isLobbyView ? (
                        <div 
                            className={`p-4 rounded-xl shadow-xl backdrop-blur-md text-white transition-all duration-300 ease-in-out cursor-pointer focus:outline-none focus:ring-2 focus:ring-yellow-400
                                ${isExpanded 
                                    ? 'bg-gradient-to-br from-gray-800/90 to-gray-900/90 ring-2 ring-yellow-400/60' 
                                    : 'bg-gradient-to-br from-gray-800/95 to-gray-900/95 border-2 border-gray-600 hover:border-yellow-500/50 ring-2 ring-yellow-400/30 hover:ring-yellow-400/60'}
                                ${isExpanded ? 'min-h-[450px]' : 'min-h-[200px] max-h-[200px] overflow-hidden'}
                            `}
                            onMouseEnter={handleMouseEnter}
                            onMouseLeave={handleMouseLeave}
                            onClick={handleCardClick}
                            role="button"
                            tabIndex={0}
                            aria-expanded={isExpanded}
                            aria-label={`Character details for ${selectedCharacter?.name || 'Unknown Character'}, ${isExpanded ? 'expanded' : 'collapsed'}. Click to toggle.`}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleCardClick();
                                }
                            }}
                        >
                            <div className="flex flex-col items-center gap-4">
                                {/* Portrait */}
                                <div className="relative group flex-shrink-0">
                                    {selectedCharacter?.avatarUrl && !imageError ? (
                                                                                <img
                                                                                    src={selectedCharacter.avatarUrl}
                                                                                    alt={`${selectedCharacter.name} portrait`}
                                                                                    className={`w-32 h-32 object-cover rounded-lg border-2 border-gray-500 shadow-xl transition-transform duration-200 group-hover:scale-105 ${isImageLoading ? 'opacity-0' : 'opacity-100'}`}
                                                                                />                                    ) : (
                                        <div className="fallback-avatar w-32 h-32 aspect-square border-2 border-gray-500 rounded-lg shadow-xl bg-gradient-to-br from-amber-600 via-orange-700 to-red-700 flex items-center justify-center text-white font-black text-4xl md:text-5xl ring-4 ring-amber-400/50 hover:ring-amber-400/80 transition-all duration-300">
                                            {selectedCharacter?.name?.charAt(0).toUpperCase() || '?'}
                                        </div>
                                    )}
                                    {/* Loading Skeleton */}
                                    {isImageLoading && showSkeleton && (
                                        <div className="absolute inset-0 w-32 h-32 rounded-lg bg-gray-700 animate-pulse"></div>
                                    )}
                                </div>

                                {/* Main Info (Name, Class/Race, Stats) */}
                                <div className="w-full space-y-2 text-center">
                                    {/* Name and Level */}
                                    <div className="flex flex-col items-center gap-2">
                                        <p className="font-bold text-lg md:text-xl text-yellow-300 truncate" title={selectedCharacter?.name}>{selectedCharacter?.name || 'Unknown Character'}</p>
                                        <span className="bg-blue-600 text-white text-sm px-2 py-1 rounded hover:bg-blue-500 transition-colors">
                                            Lvl {selectedCharacter?.level || 1}
                                        </span>
                                    </div>

                                    {/* Race/Class & Primary Attribute */}
                                    <div className="flex flex-col items-center gap-2 text-sm text-gray-300">
                                        <p className="truncate">
                                            {selectedCharacter?.race || 'Unknown'} {selectedCharacter?.class || 'Unknown'}
                                        </p>
                                        {selectedCharacter?.primaryAttribute && (
                                            <span className="bg-purple-600 text-white text-[10px] px-2 py-1 rounded">
                                                {selectedCharacter.primaryAttribute}
                                            </span>
                                        )}
                                    </div>

                                    {/* Key Stats (HP, AC, Init) */}
                                    <div className={`grid ${layoutClasses.statsLayout} gap-2 text-center text-sm font-bold mt-2`}>
                                        <div className="bg-gray-800/50 rounded-md p-1 shadow-inner">
                                            ❤️ HP: <span className="text-green-400">{selectedCharacter?.hp || 0}/{selectedCharacter?.maxHp || 0}</span>
                                        </div>
                                        <div className="bg-gray-800/50 rounded-md p-1 shadow-inner">
                                            🛡️ AC: <span className="text-blue-400">{selectedCharacter?.ac || 0}</span>
                                        </div>
                                        <div className="bg-gray-800/50 rounded-md p-1 shadow-inner">
                                            🎯 Init: <span className="text-purple-400">{selectedCharacter?.initiative > 0 ? '+' : ''}{selectedCharacter?.initiative || 0}</span>
                                        </div>
                                    </div>

                                    {/* Dice Roll Result (if available) */}
                                    {(demoRolls?.[slotIndex] !== undefined || diceRolls?.[slotIndex] !== undefined) && (
                                        <div className="bg-gradient-to-r from-yellow-600 to-orange-600 text-white p-3 rounded-md shadow-lg text-center font-bold text-lg animate-pulse">
                                            🎲 Roll: {demoRolls?.[slotIndex] ?? diceRolls?.[slotIndex]}
                                        </div>
                                    )}
                                </div>

                                {/* Expand Indicator Chevron */}
                                <div className={`absolute top-2 right-2 p-1 w-6 h-6 bg-yellow-500/80 rounded-full flex items-center justify-center text-white text-xs font-bold transition-transform duration-300 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}>
                                    ▼
                                </div>
                            </div>
                            
                            {/* EXPANDED SECTION: Full Details (conditionally rendered) */}
                            <div className={`w-full overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-[600px] opacity-100 mt-4' : 'max-h-0 opacity-0 mt-0'}`}>
                                {/* Attributes Grid - Enhanced */}
                                <div className="w-full text-xs mb-4">
                                    <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Attributes</div>
                                    <div className={`grid ${layoutClasses.attributesLayout} gap-4`}> {/* Increased gap */}
                                        {[
                                            { key: 'strength', label: 'STR', icon: '⚔️' },
                                            { key: 'dexterity', label: 'DEX', icon: '🏃' },
                                            { key: 'constitution', label: 'CON', icon: '💪' },
                                            { key: 'intelligence', label: 'INT', icon: '🧠' },
                                            { key: 'wisdom', label: 'WIS', icon: '🦉' },
                                            { key: 'charisma', label: 'CHA', icon: '💬' }
                                        ].map(({ key, label, icon }, index) => {
                                            const statValue = selectedCharacter?.stats?.[key as keyof typeof selectedCharacter.stats] || 10;
                                            const modifier = Math.floor((statValue - 10) / 2);
                                            const modifierStr = modifier >= 0 ? `+${modifier}` : `${modifier}`;
                                            const modifierColor = modifier > 0 ? 'text-green-400 font-bold' : modifier < 0 ? 'text-red-400 font-bold' : 'text-gray-500';
                                            
                                            return (
                                                <div key={key} className="text-center bg-gradient-to-br from-gray-700/40 to-gray-800/40 border border-gray-600/30 rounded-lg p-3 hover:shadow-lg hover:border-yellow-500/30 transition-all hover:scale-105" style={{ animationDelay: `${index * 50}ms` }}>
                                                        <div className="text-gray-400 text-[10px] uppercase tracking-wider flex items-center justify-center space-x-1">
                                                            <span>{icon}</span>
                                                            <span>{label}</span>
                                                        </div>
                                                        <div className="text-white font-bold text-lg">{statValue}</div>
                                                        <div className={`text-base ${modifierColor}`}>{modifierStr}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Background */}
                                    {selectedCharacter?.background && (
                                        <div className="w-full mt-4 border-t border-gray-700/50 pt-4">
                                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Background</div>
                                            <p className="text-sm text-gray-300">{selectedCharacter.background}</p>
                                        </div>
                                    )}

                                    {/* Equipment Section - Grid Layout */}
                                    {selectedCharacter?.equipment && selectedCharacter.equipment.length > 0 && (
                                        <div className="w-full mt-2 border-t border-gray-700/50 pt-4">
                                            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Equipment</div>
                                            <div className={`grid ${layoutClasses.equipmentCols} gap-3`}>
                                                {selectedCharacter.equipment.slice(0, isExpanded ? selectedCharacter.equipment.length : 2).map((item, index) => (
                                                    <div key={index} className="bg-gradient-to-r from-gray-700 to-gray-600 text-gray-200 px-3 py-2 rounded-lg shadow-sm hover:shadow-md transition-all text-sm" style={{ animationDelay: `${index * 30}ms` }}>
                                                        {item}
                                                    </div>
                                                ))}
                                                {!isExpanded && selectedCharacter.equipment.length > 2 && (
                                                    <div className="bg-yellow-600/20 text-yellow-300 px-3 py-2 rounded-lg shadow-sm text-sm flex items-center justify-center">
                                                        +{selectedCharacter.equipment.length - 2} more
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                    ) : (
                        <CharacterDisplayCard character={selectedCharacter} size={layoutClasses.cardSize} />
                    )}
                    {/* Only show edit/delete buttons in dashboard (when not in lobby view) */}
                    {showManagementButtons && !isSlotLocked && !isLobbyView && (
                        <div className={layoutClasses.buttonLayout}>
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
        </div>
    );
}