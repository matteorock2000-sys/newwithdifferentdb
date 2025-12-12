import type { Character, PlayerSlot } from "~/types";
import { DND_5E_CHARACTERS } from "~/data/dnd";
import CharacterDisplayCard from "./CharacterDisplayCard";
import { useMemo, useState, useCallback } from "react";

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
    isUpdating?: boolean; // New prop to indicate if slot is being updated
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
    isUpdating = false, // Default to false if not provided
}: PlayerSetupSlotProps) {
    const { type, characterId, isReady, username, userId } = playerSlot; // <-- Destructure username and userId
    const [showCharacterModal, setShowCharacterModal] = useState(false);
    
    // Enhanced slot ownership logic
    const hasOwnershipData = !!currentUserId && !!userId;
    const isOwnSlot = hasOwnershipData ? currentUserId === userId : (isLobbyView ? !userId : true);
    const isSlotLocked = isLobbyView && !isOwnSlot;

    // Use user's own characters if available and it's their slot, otherwise use allCharacters (for display only)
    const charactersForSelection = isOwnSlot && userOwnCharacters ? userOwnCharacters : allCharacters;

    const selectedCharacter = useMemo(() => 
        allCharacters.find(c => c.id === characterId)
    , [allCharacters, characterId]);

    // For locked slots, get character name from slot data or from the character object
    const getDisplayCharacterName = (): string | null => {
        if ((playerSlot as any).characterName) {
            return (playerSlot as any).characterName;
        }
        return selectedCharacter?.name || null;
    };

    // Enhanced slot state detection
    const slotHasCharacter = characterId && type !== 'None';
    const slotIsEmpty = !characterId || type === 'None';

    // Locked slot indicator component
    const LockedSlotIndicator = () => (
        <div className="mb-3 p-2 bg-blue-800 bg-opacity-50 rounded border border-blue-500">
            <p className="text-blue-300 text-sm text-center">
                {slotHasCharacter ? `Locked: ${getDisplayCharacterName() || 'Character'}` : 'Locked: Empty Slot'}
            </p>
        </div>
    );

    const availableCharacters = useMemo(() => {
        // Only filter out characters that are occupied by OTHER slots (not this one)
        const occupiedIds = new Set(allSlots
            .map((s, idx) => (idx !== slotIndex && s.characterId) ? s.characterId : null)
            .filter((id): id is string => !!id)
        );
        return charactersForSelection.filter(c => !occupiedIds.has(c.id));
    }, [charactersForSelection, allSlots, slotIndex]);

    const handleTypeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        if (isSlotLocked) return;
        const newType = e.target.value as PlayerSlot['type'];
        
        let newCharacterId: string | null = null;
        let newIsReady = false;
        let newUserId: string | undefined = playerSlot.userId;
        let newUsername: string | undefined = playerSlot.username;

        if (newType === 'Human' || newType === 'AI') {
            // 1. Try to keep the existing character if it's still valid/available
            const currentCharacterStillAvailable = charactersForSelection.some(c => c.id === characterId) && 
                                                 !allSlots.some((s, i) => i !== slotIndex && s.characterId === characterId);

            if (characterId && currentCharacterStillAvailable) {
                newCharacterId = characterId;
            } else {
                // 2. Assign the first available character
                newCharacterId = availableCharacters.length > 0 ? availableCharacters[0].id : null;
            }
            newIsReady = true;
        } else if (newType === 'None') {
            newCharacterId = null;
            newIsReady = false;
            newUserId = undefined;
            newUsername = undefined;
        } else {
            // For 'Join' slot, keep existing data
            newCharacterId = characterId;
            newIsReady = isReady;
            newUserId = userId;
            newUsername = username;
        }

        onSlotChange(slotIndex, {
            type: newType,
            characterId: newCharacterId,
            isReady: newIsReady,
            userId: newUserId,
            username: newUsername
        });
    }, [isSlotLocked, characterId, charactersForSelection, allSlots, slotIndex, availableCharacters, isReady, userId, username, onSlotChange]);

    const handleTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        if (isSlotLocked) return;
        const newType = e.target.value as PlayerSlot['type'];
        
        let newCharacterId: string | null = null;
        let newIsReady = false;
        let newUserId: string | undefined = playerSlot.userId;
        let newUsername: string | undefined = playerSlot.username;

        if (newType === 'Human' || newType === 'AI') {
            // 1. Try to keep the existing character if it's still valid/available
            const currentCharacterStillAvailable = charactersForSelection.some(c => c.id === characterId) && 
                                                 !allSlots.some((s, i) => i !== slotIndex && s.characterId === characterId);

            if (characterId && currentCharacterStillAvailable) {
                newCharacterId = characterId;
            } else {
                // 2. Assign the first available character
                newCharacterId = availableCharacters.length > 0 ? availableCharacters[0].id : null;
            }
            
            // 3. Set readiness based on type and character presence
            if (newType === 'AI') {
                // AI slots are automatically ready if a character is assigned.
                newIsReady = !!newCharacterId;
            } else if (newType === 'Human') {
                // Human slots retain previous readiness status if character is assigned, otherwise default to not ready.
                newIsReady = !!newCharacterId ? playerSlot.isReady : false;
            }
            
            // 4. Set user info for owned slots
            if (isOwnSlot) {
                newUserId = currentUserId;
                newUsername = playerSlot.username;
            }
        } else {
            // When switching to 'None', clear user info to unlock the slot
            newUserId = undefined;
            newUsername = undefined;
        }

        onSlotChange(slotIndex, {
            type: newType,
            characterId: newCharacterId,
            isReady: newIsReady,
            userId: newUserId,
            username: newUsername,
        });
    };

    const handleCharacterSelect = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        // Prevent character selection if this is a locked slot (another player's slot in lobby)
        if (isSlotLocked) return;
        const newCharacterId = e.target.value || null;
        
        let newIsReady = false;
        let newUserId: string | undefined = playerSlot.userId;
        let newUsername: string | undefined = playerSlot.username;

        if (playerSlot.type === 'AI') {
            newIsReady = !!newCharacterId; // AI is ready if character is selected
        } else if (playerSlot.type === 'Human') {
            newIsReady = !!newCharacterId ? playerSlot.isReady : false; // Human retains readiness or becomes unready if character is removed
        }

        // Set user info when character is selected (for own slot)
        if (isOwnSlot && newCharacterId) {
            newUserId = currentUserId;
            newUsername = playerSlot.username;
        } else if (!newCharacterId) {
            // Clear user info when character is deselected
            newUserId = undefined;
            newUsername = undefined;
        }
        
        onSlotChange(slotIndex, {
            ...playerSlot,
            characterId: newCharacterId,
            isReady: newIsReady,
            userId: newUserId,
            username: newUsername,
        });
    }, [isSlotLocked, playerSlot, slotIndex, onSlotChange]);

    const handleReadyToggle = useCallback(() => {
        if (isSlotLocked) return;
        // This calls the handler in rooms.tsx which updates local state
        onToggleReady(slotIndex, !isReady);
    }, [isSlotLocked, slotIndex, isReady, onToggleReady]);

    const handleCreateNew = useCallback(() => {
        if (isSlotLocked) return;
        // This calls the handler in rooms.tsx to open the modal
        onEditCharacter({} as Character, slotIndex);
    }, [isSlotLocked, onEditCharacter]);

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

    const handleCharacterImport = useCallback(() => {
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
        <div className={`p-4 rounded-lg shadow-lg transition duration-300 relative
            ${isReady ? 'bg-green-900 border-2 border-green-500' : 'bg-gray-700 border-2 border-gray-600'}
            ${isHostSlot ? 'border-4 border-red-500' : ''}
            ${isSlotLocked ? 'bg-blue-900 border-blue-500' : ''}
            ${isOwnSlot && !isSlotLocked && isLobbyView ? 'border-3 border-green-500' : ''}
            ${!isOwnSlot && isSlotLocked && isLobbyView ? 'border-3 border-blue-500' : ''}
            ${!isOwnSlot && !isSlotLocked && isLobbyView ? 'border-3 border-gray-500' : ''}
        `}>
            {/* Updating Overlay */}
            {isUpdating && (
                <div className="absolute inset-0 bg-black bg-opacity-30 rounded-lg flex items-center justify-center z-10">
                    <div className="bg-gray-800 bg-opacity-90 p-3 rounded-lg border border-gray-600">
                        <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                            <span className="text-xs text-gray-300">Updating...</span>
                        </div>
                    </div>
                </div>
            )}
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-xl font-bold text-center flex-1">
                    Slot {slotIndex + 1} 
                    {isHostSlot && "(Host)"}
                    {isSlotLocked && " (Locked)"}
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
                    </div>
                </div>
            )}
            
            {/* NEW: Display Locked Message */}
            {isSlotLocked && (
                <p className="text-xs text-red-400 text-center mb-2 font-semibold">
                    🔒 Locked by another player
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
                    {/* In lobby view, show minimal character info; in dashboard, show full card */}
                    {isLobbyView ? (
                        <div className="p-2 rounded bg-gray-800 border border-gray-600 text-white text-sm">
                            <p className="font-semibold text-yellow-300">{selectedCharacter.name}</p>
                            <p className="text-xs text-gray-400">
                                {selectedCharacter.class} - Lvl {selectedCharacter.level || 1}
                            </p>
                            {selectedCharacter.race && (
                                <p className="text-xs text-gray-400">{selectedCharacter.race}</p>
                            )}
                        </div>
                    ) : (
                        <CharacterDisplayCard character={selectedCharacter} />
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
                                        <p className="text-white font-bold">{selectedCharacter.stats?.str || 10}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-gray-400">DEX</p>
                                        <p className="text-white font-bold">{selectedCharacter.stats?.dex || 10}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-gray-400">CON</p>
                                        <p className="text-white font-bold">{selectedCharacter.stats?.con || 10}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-gray-400">INT</p>
                                        <p className="text-white font-bold">{selectedCharacter.stats?.int || 10}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-gray-400">WIS</p>
                                        <p className="text-white font-bold">{selectedCharacter.stats?.wis || 10}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-gray-400">CHA</p>
                                        <p className="text-white font-bold">{selectedCharacter.stats?.cha || 10}</p>
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
