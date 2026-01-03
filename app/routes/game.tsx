import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useFetcher, useSubmit, useNavigate } from "@remix-run/react";
import { getSession, commitSession } from "~/sessions";
import type { Character, PlayerSlot, ScenarioForDisplay, User } from "~/types";
import { generateScenariosForCharacter } from "~/services/openrouter.server";
import { storeScenarios, getScenarios, clearScenarios } from "~/services/scenarioCache.server";
import { storeCharacters, getCharacters } from "~/services/characterCache.server";
import { 
  castVote, 
  retractVote, 
  getScenarioVoteStats, 
  getUserVotingStatus,
  clearScenarioVotes,
  isVotingOpen 
} from "~/services/scenarioVoteService.server";
import ScenarioSelector from "~/components/ScenarioSelector";
import AdventureLog from "~/components/AdventureLog";
import { DND_5E_CHARACTERS } from "~/data/dnd";
import NewCharacterForm from "~/components/NewCharacterForm";
import PlayerSetupSlot from "~/components/PlayerSetupSlot";
import { useState, useEffect, useMemo, useRef } from "react";
import { getCharactersForUser, getUserById, getCharactersByIds } from "~/services/db.server"; // <-- Import getCharactersByIds
import { 
    getRoomByCode, 
    deleteRoom, 
    updateSlotReadiness, 
    updateRoomStatus,
    insertScenarioSuggestion, 
    getScenarioSuggestions, 
    storeRoomScenarios, 
    setRoomScenarioWinner, 
    clearRoomScenarios, 
    getRoomScenariosForVoting,
    clearRoomDiceRolls
} from "~/services/room.server"; // <-- Import all room server functions

import {
    saveTemporaryPartySetup,
    getAndClearTemporaryPartySetup
} from "~/services/db.server"; // <-- Import temporary party setup functions from db.server

import { subscribeToRoomChanges, unsubscribeFromAllRoomChanges } from "~/services/realtime.client"; // <-- Import realtime subscription
import { useOptimisticSlotUpdate } from "~/hooks/useOptimisticSlotUpdate";
import { createApiErrorResponse, isRetryableError } from "~/utils/errors";
import { retryOperation } from "~/utils/retry";
import { logger } from "~/utils/logger";

export const meta: MetaFunction = () => {
    return [
        { title: "D&D AI Dungeon Master" },
        { name: "description", content: "Your AI-powered Dungeons and Dragons adventure awaits!" },
    ];

};

interface LoaderData {
    party: PlayerSlot[];
    resolvedParty: Character[];
    allRoomCharacters: Character[];
    currentUsername: string;
    currentUserId: string;
    activeCharacter: Character | null;
    scenarios: ScenarioForDisplay[];
    messages: { role: 'user' | 'model'; text: string }[] | null;
    isInGame: boolean;
    roomCode: string | null;
    isHost: boolean;
    roomStatus: string | null;
}

// --- New State for Character Creation Modal ---
interface CharacterCreationState {
    showModal: boolean;
    initialData: Partial<Character> | null;
    slotIndex: number | undefined; // If editing a specific slot
}
// ---------------------------------------------

// REMOVED: MOCK_CHARACTERS definition

export async function loader({ request }: LoaderFunctionArgs) {
    // CRITICAL FIX: Handle null cookie header
    const cookieHeader = request.headers.get("Cookie");
    const session = await getSession(cookieHeader || "");
    const userId = session.get("userId");
    const url = new URL(request.url);
    const roomCode = url.searchParams.get("roomCode");

    if (!userId) {
        return redirect("/login");
    }

    // Fetch user from database to get their username
    const currentUser = await getUserById(userId);
    const username = currentUser?.username || "Unknown";

    const data: LoaderData = {
        party: [],
        resolvedParty: [],
        allRoomCharacters: [],
        currentUsername: username,
        currentUserId: userId,
        activeCharacter: null,
        scenarios: [],
        messages: null,
        isInGame: false,
        roomCode: roomCode,
        isHost: false,
        roomStatus: null,
    };

    // FIX: Fetch actual characters for the user instead of mocks
    // This ALWAYS contains the current user's characters, regardless of room state
    const userResolvedCharacters: Character[] = (await getCharactersForUser(userId)).filter((c): c is Character => c !== null);
    data.resolvedParty = userResolvedCharacters;
    data.allRoomCharacters = userResolvedCharacters; // Initialize with user's own characters

    if (roomCode) {
        // Fetch room data to get the saved slot configuration
        let room = await getRoomByCode(roomCode);

        if (room) {
            // Check if user has a temporary party setup and move it to the room
            const tempPartySetup = await getAndClearTemporaryPartySetup(userId);
            if (tempPartySetup && tempPartySetup.length > 0) {
                console.log(`[GAME LOADER] Found temporary party setup for user ${userId?.substring(0, 8)}, moving to room ${roomCode}`);
                
                // Merge the temporary party setup with the room's setup_slots
                const mergedSlots = room.setup_slots ? room.setup_slots.map((roomSlot, index) => {
                    const tempSlot = tempPartySetup[index];
                    if (tempSlot && tempSlot.characterId) {
                        // User has a character for this slot, use their selection
                        return {
                            ...roomSlot,
                            ...tempSlot,
                            userId: userId,
                            username: username
                        };
                    }
                    return roomSlot;
                }) : tempPartySetup;
                
                // If user has more slots than existing room slots, add them
                if (tempPartySetup.length > mergedSlots.length) {
                    const additionalSlots = tempPartySetup.slice(mergedSlots.length).map(slot => ({
                        ...slot,
                        userId: userId,
                        username: username
                    }));
                    mergedSlots.push(...additionalSlots);
                }
                
                // Update the room with the merged slots
                
                // Create participants array from the updated slots
                const participants = mergedSlots
                    .filter(slot => slot.characterId)
                    .map(slot => ({
                        userId: slot.userId || userId,
                        characterId: slot.characterId,
                        username: slot.username || username
                    }));
                
                await updateRoomStatus(roomCode, {
                    setup_slots: mergedSlots,
                    active_slots: mergedSlots.filter(slot => slot.type === 'Human' || slot.type === 'AI').length,
                    participants: participants
                });
                
                // Re-fetch room data to ensure it includes the updated setup_slots and participants
                room = await getRoomByCode(roomCode);
                if (!room) {
                    // This should ideally not happen if it was found before and just updated
                    return redirect("/rooms", {
                        headers: { "Set-Cookie": await commitSession(session) },
                    });
                }
                console.log(`[GAME LOADER] Updated room ${roomCode} with temporary party setup`);
            }

            // Check room status and redirect accordingly
            if (room.status === 'active_game') {
                // Room is in active game mode - redirect to world-map
                console.log(`[REDIRECT] Room ${roomCode} is in ${room.status} status, redirecting to world-map`);
                return redirect(`/world-map?roomCode=${roomCode}`);
            } else if (room.status === 'scenario-selected') {
                // Room is in scenario selected status - redirect to world-map
                console.log(`[REDIRECT] Room ${roomCode} is in ${room.status} status, redirecting to world-map`);
                return redirect(`/world-map?roomCode=${roomCode}`);
            } else if (room.status === 'map_generation') {
                // Room is in map generation mode - redirect to map/world-map generation
                console.log(`[REDIRECT] Room ${roomCode} is in ${room.status} status, redirecting to world-map`);
                return redirect(`/world-map?roomCode=${roomCode}`);
            } else if (room.status === 'scenario_selection') {
                // Room is in scenario selection mode - stay in game route for voting
                console.log(`[GAME ROUTE] Room ${roomCode} is in scenario_selection status, showing voting interface`);
                // Continue with game route to show scenario selection
            } else if (room.status === 'lobby') {
                // Room is in lobby mode - stay in game route for setup
                console.log(`[GAME ROUTE] Room ${roomCode} is in lobby status, showing setup interface`);
            } else if (room.status === 'active' && room.scenario_winner_id) {
                // Room is active with a scenario winner - redirect to world-map
                console.log(`[REDIRECT] Room ${roomCode} is active with scenario winner, redirecting to world-map`);
                return redirect(`/world-map?roomCode=${roomCode}`);
            } else {
                console.warn(`[GAME LOADER] Room ${roomCode} has an unknown status: ${room.status}. Defaulting to lobby.`);
                // Fallback for unknown status - continue to lobby setup
            }

            // --- START: Username Enrichment Logic & Character Fetching ---
            const participantIds = room.participants.map(p => p.userId);
            const characterIds = room.setup_slots.map(s => s.characterId).filter((id): id is string => !!id);

            // Batch fetch usernames and characters
            const userPromises = participantIds.map(id => getUserById(id));
            const users = await Promise.all(userPromises);

            // Fetch all characters mentioned in the room slots (for display in other players' slots)
            const roomCharacters = await getCharactersByIds(characterIds);
            
            // Get all characters from the room (including all users' characters)
            // First, get all character IDs from all participants
            console.log(`[GAME LOADER] Room participants:`, room.participants);
            const allCharacterIds = room.participants.map(p => p.characterId).filter((id): id is string => !!id);
            console.log(`[GAME LOADER] Character IDs from participants:`, allCharacterIds);
            
            // Then fetch all characters by their IDs
            data.allRoomCharacters = await getCharactersByIds(allCharacterIds);
            console.log(`[GAME LOADER] Fetched ${data.allRoomCharacters.length} characters from room`);
            
            // Also include characters from room.setup_slots that might not be in participants
            const slotCharacterIds = room.setup_slots.map(s => s.characterId).filter((id): id is string => !!id);
            const missingSlotCharacterIds = slotCharacterIds.filter(id => !allCharacterIds.includes(id));
            if (missingSlotCharacterIds.length > 0) {
                console.log(`[GAME LOADER] Found ${missingSlotCharacterIds.length} characters in slots not in participants:`, missingSlotCharacterIds);
                const additionalCharacters = await getCharactersByIds(missingSlotCharacterIds);
                const existingIds = new Set(data.allRoomCharacters.map(c => c.id));
                const newCharacters = additionalCharacters.filter(c => !existingIds.has(c.id));
                data.allRoomCharacters = [...data.allRoomCharacters, ...newCharacters];
                console.log(`[GAME LOADER] Added ${newCharacters.length} additional characters from slots`);
            }
            
            // Also include room.characters if they exist (for backward compatibility)
            if (room.characters && room.characters.length > 0) {
                // Filter out any characters that are already in allRoomCharacters
                const existingIds = new Set(data.allRoomCharacters.map(c => c.id));
                const additionalCharacters = room.characters.filter(c => !existingIds.has(c.id));
                data.allRoomCharacters = [...data.allRoomCharacters, ...additionalCharacters];
            }

            const userMap = new Map(users.filter((u): u is User => !!u).map(u => [u.id, u.username]));
            const participantMap = new Map(room.participants.map(p => [p.characterId, p.userId]));
            const characterMap = new Map(data.allRoomCharacters.map(c => [c.id, c]));

            // Use the saved slots from the room, preserving character selection and readiness, and enriching with user data
            data.party = room.setup_slots.map(slot => {
                const enrichedSlot = { ...slot };
                if (enrichedSlot.characterId) {
                    const character = characterMap.get(enrichedSlot.characterId);
                    if (character) {
                        // ALWAYS update the character name from the definitive character source
                        enrichedSlot.characterName = character.name;
                    }
                    
                    // Also try to find the user
                    const slotUserId = participantMap.get(enrichedSlot.characterId);
                    if (slotUserId) {
                        enrichedSlot.userId = slotUserId;
                        enrichedSlot.username = userMap.get(slotUserId);
                    }
                }
                return enrichedSlot;
            });
            // --- END: Username Enrichment Logic & Character Fetching ---

            // Determine the active character
            let activeCharacter: Character | null = null;
            // First try to find the first Human slot in the party
            const firstHumanSlot = data.party.find(s => s.type === 'Human');
            if (firstHumanSlot?.characterId) {
                activeCharacter = data.resolvedParty.find(c => c.id === firstHumanSlot.characterId) || 
                                 data.allRoomCharacters.find(c => c.id === firstHumanSlot.characterId) || null;
            }
            // If no Human slot found or character not found, try to find any character in the party
            if (!activeCharacter) {
                const firstSlotWithCharacter = data.party.find(s => s.characterId);
                if (firstSlotWithCharacter?.characterId) {
                    activeCharacter = data.resolvedParty.find(c => c.id === firstSlotWithCharacter.characterId) || 
                                     data.allRoomCharacters.find(c => c.id === firstSlotWithCharacter.characterId) || null;
                }
            }
            // Fallback: use the first character in allRoomCharacters
            if (!activeCharacter && data.allRoomCharacters.length > 0) {
                activeCharacter = data.allRoomCharacters[0];
            }
            data.activeCharacter = activeCharacter;

            // Scenarios for display
            if (roomCode) {
                data.scenarios = await getRoomScenariosForVoting(roomCode);
            }
            data.messages = []; // Initialize empty array, will be populated by realtime

            // Check if current user is the host
            data.isHost = room.host_id === userId;
            data.roomStatus = room.status;

        } else {
            // Room code provided but room not found (e.g., expired or invalid code)
            console.warn(`Room with code ${roomCode} not found or missing setup data.`);
            const session = await getSession(cookieHeader || "");
            session.flash("error", `Impossible to join this room: Room with code ${roomCode} not found or missing setup data.`);
            return redirect("/rooms", {
                headers: {
                    "Set-Cookie": await commitSession(session),
                },
            });
        }
    } else {
        // No roomCode (standard setup view) - use default setup if no characters exist,
        // otherwise default to the first character if available.
        const defaultCharId = userResolvedCharacters.length > 0 ? userResolvedCharacters[0].id : null;

        data.party = [
            { type: defaultCharId ? 'Human' : 'None', characterId: defaultCharId, isReady: !!defaultCharId, userId: userId, username: username }, // Host slot gets user info locally
            { type: 'None', characterId: null, isReady: false },
            { type: 'None', characterId: null, isReady: false },
            { type: 'None', characterId: null, isReady: false },
        ];
        data.roomCode = null; // Ensure roomCode is null for non-room views
        data.isHost = false; // Not a host if not in a room
        data.roomStatus = null; // No room status if not in a room
        data.isInGame = false; // Not in game view
    }

    // Set username for all cases
    data.currentUsername = username;
    
    return json(data);
}

export async function action({ request }: ActionFunctionArgs) {
    // CRITICAL FIX: Handle null cookie header
    const cookieHeader = request.headers.get("Cookie");
    const session = await getSession(cookieHeader || "");

    const userId = session.get("userId");

    if (!userId) {
        return redirect("/login");
    }

    const formData = await request.formData();
    const intent = formData.get("intent");
    const roomCode = formData.get("roomCode")?.toString(); // Get roomCode for deletion/readiness update

    if (intent === 'generateRandomCharacter') {
        // Mocking AI generation response structure
        const race = formData.get('race')?.toString() || 'Human';
        const charClass = formData.get('class')?.toString() || 'Fighter';
        const generateFull = formData.get('generateFull') === 'true';

        if (generateFull) {
            const newChar: Character = {
                id: crypto.randomUUID(),
                userId: userId, // Must include userId
                slotIndex: 0, // Placeholder, will be assigned on save
                name: `AI ${charClass}`,
                race: race,
                class: charClass,
                level: 3,
                experience: 0,
                alignment: 'Neutral',
                background: 'Adventurer',
                speed: 30,
                hitDice: '1d8',
                hp: 25, maxHp: 25, ac: 14,
                proficiencyBonus: 2,
                initiative: 0,
                passivePerception: 10,
                savingThrows: [],
                skills: [],
                equipment: [],
                stats: { str: 14, dex: 13, con: 14, int: 10, wis: 10, cha: 10 },
                inventory: ['Simple Weapon', 'Explorer\'s Pack'],
                features: [],
                personality: {},
                description: `A randomly generated ${race} ${charClass}.`
            };
            // In a real scenario, this character would be saved to the DB/Cache here.
            return json({ type: 'success', data: { characterData: newChar } });
        }

        return json({ type: 'error', error: 'Invalid generation request.' }, { status: 400 });
    }

    if (intent === 'setPartyAndStartGame') {
        // This intent is used for CRUD operations (Add/Edit/Delete Character) which persist data and reload setup screen
        const playerSlotsJson = formData.get('playerSlots')?.toString();
        const allCharactersJson = formData.get('allCharacters')?.toString();

        if (!playerSlotsJson || !allCharactersJson) {
            return json({ error: "Missing party or character data." }, { status: 400 });
        }

        try {
            const playerSlots: PlayerSlot[] = JSON.parse(playerSlotsJson);
            const allCharacters: Character[] = JSON.parse(allCharactersJson);

            // In a real app: Update DB/Cache with new party configuration and character list for this user/room.
            // storeCharacters(userId, allCharacters);
            // storeParty(userId, playerSlots);

            console.log(`[ACTION] Party configuration saved for user ${userId}. Reloading setup.`);

            // Redirect back to /game to reload fresh data from loader
            return redirect("/game");

        } catch (e) {
            console.error("Error parsing party data:", e);
            return json({ error: "Failed to process party setup data." }, { status: 400 });
        }
    }

    if (intent === 'updateReadiness') {
        // DEPRECATED: This intent is deprecated in favor of using updateSlot for both character and readiness changes
        // This is kept for backward compatibility but should be removed in future versions
        // New intent to persist only readiness status without reloading the whole setup
        const slotIndex = parseInt(formData.get('slotIndex')?.toString() || '-1');
        const isReady = formData.get('isReady') === 'true';
        const roomCodeForUpdate = formData.get('roomCode')?.toString();

        if (slotIndex >= 0 && roomCodeForUpdate) {
            try {
                // CRITICAL FIX: Persist the readiness change to the room object in the DB
                await updateSlotReadiness(roomCodeForUpdate, slotIndex, isReady);
                console.log(`[ACTION] Persisting readiness update for slot ${slotIndex} in room ${roomCodeForUpdate}: ${isReady}`);
                return json({ success: true }); // Return success without redirecting
            } catch (e) {
                console.error("Error updating readiness in room:", e);
                return json({ success: false, error: e instanceof Error ? e.message : "Failed to update readiness." }, { status: 500 });
            }
        }
        // If no roomCode is present, we assume this is the pre-room setup, where readiness is purely local state until 'finalizeSetup'
        if (slotIndex >= 0 && !roomCodeForUpdate) {
            console.log(`[ACTION] Local readiness update for slot ${slotIndex}: ${isReady} (No room code, skipping DB persistence)`);
            return json({ success: true });
        }

        return json({ success: false, error: "Invalid slot index or missing room code" }, { status: 400 });
    }

    if (intent === 'updateSlot') {
        // Intent to update a specific slot in a room (character selection, type change, etc.)
        const slotIndexStr = formData.get('slotIndex')?.toString();
        const slotDataStr = formData.get('slotData')?.toString();
        const roomCodeForUpdate = formData.get('roomCode')?.toString();

        if (!slotIndexStr || !slotDataStr || !roomCodeForUpdate) {
            return createApiErrorResponse(new Error("Missing slot data for update."));
        }

        try {
            const slotIndex = parseInt(slotIndexStr, 10);
            let newSlotData: PlayerSlot = JSON.parse(slotDataStr);

            console.log(`[UPDATE SLOT] Updating slot ${slotIndex} in room ${roomCodeForUpdate}:`, newSlotData);

            // Fetch current room and update the specific slot
            const room = await getRoomByCode(roomCodeForUpdate);
            if (!room) {
                return createApiErrorResponse(new Error("Room not found."), "Room not found");
            }

            console.log(`[UPDATE SLOT] Current room slots before update:`, room.setup_slots.map(s => ({ type: s.type, characterId: s.characterId, userId: s.userId })));

            // Verify the user is updating their own slot
            if (newSlotData.userId && newSlotData.userId !== userId) {
                return createApiErrorResponse(new Error("Cannot update another player's slot."), "Unauthorized slot update");
            }

            // If a character is being assigned, fetch its data to get the character name and username
            if (newSlotData.characterId && !newSlotData.characterName) {
                const { getCharacterById } = await import("~/services/db.server");
                const character = await getCharacterById(userId, newSlotData.characterId);
                if (character) {
                    newSlotData = {
                        ...newSlotData,
                        characterName: character.name
                    };
                }
            }

            // If slot has a userId but no username, fetch the username
            if (newSlotData.userId && !newSlotData.username) {
                const user = await getUserById(newSlotData.userId);
                if (user) {
                    newSlotData = {
                        ...newSlotData,
                        username: user.username
                    };
                }
            }

            // Update the setup_slots using the new function with retry logic
            const { updateSpecificSlot } = await import("~/services/room.server");
            const updatedRoom = await retryOperation(
                () => updateSpecificSlot(roomCodeForUpdate, slotIndex, newSlotData),
                {
                    maxAttempts: 2,
                    delayMs: 500,
                    shouldRetry: isRetryableError,
                    onRetry: (error, attempt) => {
                        console.log(`[RETRY] Slot update attempt ${attempt}: ${error.message}`);
                    }
                }
            );

            if (!updatedRoom) {
                console.error(`[UPDATE SLOT] Failed to update slot in database for room ${roomCodeForUpdate}`);
                return createApiErrorResponse(new Error("Failed to update slot in database."), "Database update failed");
            }

            console.log(`[UPDATE SLOT] Successfully updated room slots after change:`, updatedRoom.setup_slots.map(s => ({ type: s.type, characterId: s.characterId, userId: s.userId })));

            // Also log the specific slot that was updated
            console.log(`[UPDATE SLOT] Slot ${slotIndex} updated to:`, {
                type: newSlotData.type,
                characterId: newSlotData.characterId,
                userId: newSlotData.userId,
                isReady: newSlotData.isReady
            });

            return json({ success: true });

        } catch (e) {
            console.error("Error updating slot:", e);
            return createApiErrorResponse(e, "Failed to update slot");
        }
    }

    if (intent === 'finalizeSetup') {
        // Intent triggered by "Proceed to Room Selection" button
        const playerSlotsJson = formData.get('playerSlots')?.toString();
        const allCharactersJson = formData.get('allCharacters')?.toString();

        if (!playerSlotsJson || !allCharactersJson) {
            return json({ error: "Missing party or character data for finalization." }, { status: 400 });
        }

        try {
            const playerSlots: PlayerSlot[] = JSON.parse(playerSlotsJson);
            const allCharacters: Character[] = JSON.parse(allCharactersJson);

            const activeSlots = playerSlots.filter(slot => slot.type === 'Human' || slot.type === 'AI');
            const allReady = activeSlots.length === 0 || activeSlots.every(slot => slot.isReady);

            if (!allReady) {
                console.warn(`[ACTION] Attempted to proceed but not all active slots are ready.`);
                // Redirect back to setup, perhaps with a query param indicating error if needed, but for now, just redirect back.
                return redirect("/game?error=NotReady");
            }

            // 1. Create character map for name lookup
            const characterMap = new Map(allCharacters.map(c => [c.id, c]));

            // 2. Enrich playerSlots with character name before saving
            const enrichedPlayerSlots = playerSlots.map(slot => {
                if (slot.characterId) {
                    const character = characterMap.get(slot.characterId);
                    if (character) {
                        // Add characterName to the slot object for persistence
                        return { ...slot, characterName: character.name };
                    }
                }
                return slot;
            });

            // CRITICAL: Save the temporary party setup before redirecting to rooms
            console.log(`[ACTION] Finalizing setup. Saving ${enrichedPlayerSlots.length} slots. Active Slots: ${enrichedPlayerSlots.filter(s => s.type !== 'None').map(s => s.characterName || s.type).join(', ')}`);
            await saveTemporaryPartySetup(userId, enrichedPlayerSlots);

            // If ready, proceed to room selection
            console.log(`[ACTION] All players ready. Proceeding to room selection.`);
            return redirect("/rooms");

        } catch (e) {
            console.error("Error parsing party data during finalization:", e);
            return json({ error: "Failed to process party setup data for finalization." }, { status: 400 });
        }
    }

    if (intent === 'resetRoomStatus') {
        const roomCode = formData.get('roomCode')?.toString();
        
        if (!roomCode) {
            return json({ error: "Missing room code." }, { status: 400 });
        }

        try {
            const success = await updateRoomStatus(roomCode, 'lobby');
            
            if (success) {
                console.log(`[ACTION] Room ${roomCode} status reset to 'lobby' by host`);
                return json({ success: true, message: "Room status reset to lobby" });
            } else {
                return json({ error: "Failed to reset room status" }, { status: 500 });
            }
        } catch (error) {
            console.error("Error resetting room status:", error);
            return json({ error: "Failed to reset room status" }, { status: 500 });
        }
    }

    if (intent === 'generateScenarios') {
        const durationStr = formData.get('duration')?.toString() || 'Short';
        const activeCharacterStr = formData.get('activeCharacter')?.toString();
        const partyCharactersStr = formData.get('partyCharacters')?.toString();
        const partySlotsStr = formData.get('partySlots')?.toString();
        const regenerationPromptStr = formData.get('regenerationPrompt')?.toString();
        const roomCode = formData.get('roomCode')?.toString();
        const forceNewGeneration = formData.get('forceNewGeneration') === 'true';
        const unique = formData.get('unique') === 'true';

        if (!activeCharacterStr) {
            return createApiErrorResponse(new Error("Missing active character data."), "Missing active character data");
        }

        try {
            const activeCharacter: Character = JSON.parse(activeCharacterStr);
            const partyCharacters: Character[] = partyCharactersStr ? JSON.parse(partyCharactersStr) : [activeCharacter];
            const partySlots = partySlotsStr ? JSON.parse(partySlotsStr) : [];

            console.log(`[ACTION] Checking for existing scenarios for room ${roomCode}, forceNewGeneration: ${forceNewGeneration}`);

            // Check if scenarios already exist in the room and we're not forcing new generation
            if (roomCode && !forceNewGeneration) {
                const existingScenarios = await getRoomScenariosForVoting(roomCode);
                
                if (existingScenarios && existingScenarios.length > 0) {
                    console.log(`[ACTION] Found ${existingScenarios.length} existing scenarios for room ${roomCode}, loading existing`);
                    
                    // Update room status to scenario_selection if not already set
                    await updateRoomStatus(roomCode, 'scenario_selection');
                    
                    // Clear previous votes and dice rolls to start fresh
                    await clearScenarioVotes(roomCode);
                    await clearRoomDiceRolls(roomCode);
                    
                    // Return scenarios AND room data for synchronization
                    const room = await getRoomByCode(roomCode);
                    return json({ 
                        scenarios: existingScenarios,
                        room: {
                            setup_slots: room.setup_slots,
                            participants: room.participants,
                            status: room.status,
                            active_slots: room.active_slots,
                            max_players: room.max_players
                        },
                        message: "Loaded existing scenarios from room"
                    });
                }
            }

            console.log(`[ACTION] Generating new scenarios for party with ${partyCharacters.length} characters`);

            // Wrap scenario generation with retry logic
            const scenarios = await retryOperation(
                () => generateScenariosForCharacter(activeCharacter, durationStr, regenerationPromptStr, partyCharacters, partySlots, roomCode, forceNewGeneration, unique),
                {
                    maxAttempts: 3,
                    delayMs: 2000,
                    shouldRetry: isRetryableError,
                    onRetry: (error, attempt) => {
                        console.log(`[RETRY] Scenario generation attempt ${attempt}: ${error.message}`);
                    }
                }
            );
            
            if (!scenarios || scenarios.length === 0) {
                return createApiErrorResponse(new Error("Failed to generate any scenarios. Please try again."));
            }

            // If this is for a room, update room status to scenario_selection and store scenarios
            if (roomCode) {
                await updateRoomStatus(roomCode, 'scenario_selection');
                
                // Clear previous votes and dice rolls before storing new scenarios
                await clearScenarioVotes(roomCode);
                await clearRoomDiceRolls(roomCode);
                
                const stored = await storeRoomScenarios(roomCode, scenarios);
                if (!stored) {
                    console.warn(`[ACTION] Failed to store scenarios for room ${roomCode}`);
                } else {
                    console.log(`[ACTION] Stored ${scenarios.length} scenarios for room ${roomCode}`);
                }
                
                // Return scenarios AND room data for synchronization
                const room = await getRoomByCode(roomCode);
                return json({ 
                    scenarios,
                    room: {
                        setup_slots: room.setup_slots,
                        participants: room.participants,
                        status: room.status,
                        active_slots: room.active_slots,
                        max_players: room.max_players
                    }
                });
            }

            console.log(`[ACTION] Successfully generated ${scenarios.length} scenarios for party`);
            return json({ scenarios });
        } catch (error) {
            console.error("Error generating scenarios:", error);
            return createApiErrorResponse(error, "Failed to generate scenarios via OpenRouter. Please try again in a few minutes or contact support if the issue persists.");
        }
    }

    if (intent === 'getRoomScenarios') {
        const roomCode = formData.get('roomCode')?.toString();

        if (!roomCode) {
            return json({ error: "Missing room code." }, { status: 400 });
        }

        try {
            const scenarios = await getRoomScenariosForVoting(roomCode);
            
            if (!scenarios || scenarios.length === 0) {
                return json({ error: "No scenarios found for this room." }, { status: 404 });
            }

            console.log(`[ACTION] Retrieved ${scenarios.length} scenarios for room ${roomCode}`);
            return json({ scenarios });
        } catch (error) {
            console.error("Error fetching room scenarios:", error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to fetch scenarios';
            return json({ error: errorMessage }, { status: 500 });
        }
    }

    if (intent === 'getRoomData') {
        const roomCode = formData.get('roomCode')?.toString();

        if (!roomCode) {
            return json({ error: "Missing room code." }, { status: 400 });
        }

        try {
            const room = await getRoomByCode(roomCode);
            
            if (!room) {
                return json({ error: "Room not found." }, { status: 404 });
            }

            console.log(`[ACTION] Retrieved room data for room ${roomCode}`);
            return json({ 
                room: {
                    setup_slots: room.setup_slots,
                    participants: room.participants,
                    status: room.status,
                    active_slots: room.active_slots
                }
            });
        } catch (error) {
            console.error("Error fetching room data:", error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to fetch room data';
            return json({ error: errorMessage }, { status: 500 });
        }
    }

    if (intent === 'castVote') {
        const scenarioId = formData.get('scenarioId')?.toString();
        const slotIndexStr = formData.get('slotIndex')?.toString();
        const roomCode = formData.get('roomCode')?.toString();
        const userIdFromForm = formData.get('userId')?.toString(); // from form
        const characterId = formData.get('characterId')?.toString();

        // Use userId from session as the authoritative source
        // but log both if they differ
        if (userIdFromForm !== userId) {
            console.warn(`[VOTE] User ID mismatch! Session: ${userId}, Form: ${userIdFromForm}. Using session ID.`);
        }

        console.log(`[GAME ROUTE] castVote called with:`, {
            scenarioId, slotIndexStr, roomCode, userId, characterId
        });
        
        // Log the entire form data for debugging
        console.log(`[GAME ROUTE] Full form data:`, Object.fromEntries(formData.entries()));

        if (!scenarioId || !slotIndexStr || !roomCode || !userId) {
            console.log(`[GAME ROUTE] Missing required data for voting`);
            return createApiErrorResponse(new Error("Missing required data for voting."), "Missing voting data");
        }

        try {
            const slotIndex = parseInt(slotIndexStr);

            console.log(`[GAME ROUTE] Calling castVote service with:`, {
                roomCode,
                scenarioId,
                userId,
                slotIndex,
                characterId
            });

            const result = await castVote(roomCode, scenarioId, userId, slotIndex, characterId);
            
            console.log(`[GAME ROUTE] castVote result:`, result);
            
            if (result.success) {
                return json({ 
                    success: true, 
                    message: result.message,
                    userVoteCount: result.userVoteCount
                });
            } else {
                console.log(`[GAME ROUTE] Vote casting failed:`, result.message);
                return createApiErrorResponse(new Error(result.message), "Vote casting failed");
            }
        } catch (error) {
            console.error("[GAME ROUTE] Error casting vote:", error);
            console.error("Error details:", {
                name: error instanceof Error ? error.name : 'Unknown',
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : 'No stack trace'
            });
            
            // Return detailed error for debugging
            return json({ 
                error: error instanceof Error ? error.message : "Failed to cast vote",
                success: false
            }, { status: 500 });
        }
    }

    if (intent === 'retractVote') {
        const scenarioId = formData.get('scenarioId')?.toString();
        const slotIndexStr = formData.get('slotIndex')?.toString();
        const roomCode = formData.get('roomCode')?.toString();

        if (!scenarioId || !slotIndexStr || !roomCode) {
            return json({ error: "Missing required data for vote retraction." }, { status: 400 });
        }

        try {
            const slotIndex = parseInt(slotIndexStr);

            const result = await retractVote(roomCode, scenarioId, userId, slotIndex);
            
            if (result.success) {
                return json({ 
                    success: true, 
                    message: result.message
                });
            } else {
                return json({ error: result.message }, { status: 400 });
            }
        } catch (error) {
            console.error("Error retracting vote:", error);
            return json({ error: "Failed to retract vote." }, { status: 500 });
        }
    }

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

        // Accept either a scenario ID string or a full scenario object (stringified JSON).
        // Resolution to full scenario will happen in the service layer; no strict UUID validation here.

        try {
            // Step 1: Persist the winning scenario
            logger.debug('[GAME ACTION] Persisting scenario winner', {
                roomCode,
                selectedScenarioId,
                userId
            });

            try {
                await setRoomScenarioWinner(roomCode, selectedScenarioId);
                logger.info('[GAME ACTION] Scenario winner persisted successfully', {
                    roomCode,
                    selectedScenarioId
                });
            } catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                logger.error('[GAME ACTION] Failed to persist scenario winner - throwing error back to client', {
                    roomCode,
                    selectedScenarioId,
                    errorMessage: errorMsg,
                    errorStack: err instanceof Error ? err.stack : undefined
                });
                throw err; // Re-throw to outer catch
            }

            // Step 2: Update room status to map_generation
            logger.debug('[GAME ACTION] Updating room status to map_generation', { roomCode });

            const statusUpdated = await retryOperation(
                () => updateRoomStatus(roomCode, 'map_generation'),
                {
                    maxAttempts: 3,
                    delayMs: 500,
                    maxDelayMs: 2000,
                    shouldRetry: (error) => {
                        const msg = error?.message || '';
                        return msg.includes("Failed to update") || 
                               msg.includes("constraint") ||
                               msg.includes("transaction");
                    },
                    onRetry: (error, attempt) => {
                        logger.info('[GAME ACTION] Retrying room status update', {
                            roomCode,
                            attempt,
                            error: error?.message
                        });
                    }
                }
            );

            if (!statusUpdated) {
                logger.error('[GAME ACTION] Failed to update room status after retries - throwing error back to client', {
                    roomCode,
                    selectedScenarioId
                });
                throw new Error('Failed to update room status for map generation');
            }

            logger.info('[GAME ACTION] Room status updated to map_generation successfully', { roomCode });

            // Step 3: Provide redirect target for client (fetcher) to navigate to map-generation
            logger.debug('[GAME ACTION] Returning redirectTo for map-generation', {
                roomCode,
                selectedScenarioId
            });

            return json({ redirectTo: `/map-generation?roomCode=${roomCode}` });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            logger.error('[GAME ACTION] Caught error in startGame handler - returning 500 to client', {
                roomCode,
                selectedScenarioId,
                userId,
                errorMessage: errorMsg,
                errorStack: error instanceof Error ? error.stack : undefined
            });
            // Return the actual error message to the client for debugging (dev only)
            return json(
                { error: errorMsg || "Failed to save scenario winner to database" },
                { status: 500 }
            );
        }
    }

    if (intent === 'getVoteStatus') {
        const roomCode = formData.get('roomCode')?.toString();

        if (!roomCode) {
            return json({ error: "Missing required data for vote status." }, { status: 400 });
        }

        try {
            // Properly await the async functions
            const votingStatus = await getUserVotingStatus(roomCode, userId);
            const scenarioStats = await getScenarioVoteStats(roomCode);

            return json({ 
                votingStatus,
                scenarioStats,
                votingOpen: isVotingOpen(scenarioSetId)
            });
        } catch (error) {
            console.error("Error getting vote status:", error);
            return json({ error: "Failed to get vote status." }, { status: 500 });
        }
    }

    if (intent === 'backToLobby') {
        // Clear any scenario votes and redirect to rooms
        const scenarioSetId = formData.get('scenarioSetId')?.toString();
        
        if (scenarioSetId) {
            clearScenarioVotes(scenarioSetId);
            console.log(`[ACTION] Cleared scenario votes for set: ${scenarioSetId}`);
        }
        
        // Redirect to rooms page
        return redirect('/rooms');
    }

    if (intent === 'startScenarioSelection') {
        if (!roomCode) {
            return json({ error: "Missing room code for scenario selection." }, { status: 400 });
        }

        try {
            // Update room status to scenario_selection
            const success = await updateRoomStatus(roomCode, 'scenario_selection');
            
            if (success) {
                console.log(`[ACTION] Room ${roomCode} status updated to scenario_selection`);
                return json({ success: true, message: "Scenario selection started" });
            } else {
                return json({ error: "Failed to update room status." }, { status: 500 });
            }
        } catch (e) {
            console.error("Error starting scenario selection:", e);
            return json({ error: e instanceof Error ? e.message : "Failed to start scenario selection." }, { status: 500 });
        }
    }

    if (intent === 'deleteRoom') {
        if (!roomCode) {
            return json({ error: "Missing room code for deletion." }, { status: 400 });
        }

        try {
            // Check if user is the owner (handled inside deleteRoom)
            await deleteRoom(roomCode, userId);
            console.log(`[ACTION] Room ${roomCode} successfully deleted by owner ${userId}.`);
            // Redirect back to room selection after deletion
            return redirect("/rooms");
        } catch (e) {
            console.error("Error deleting room:", e);
            return json({ error: e instanceof Error ? e.message : "Failed to delete room." }, { status: 500 });
        }
    }

    if (intent === 'broadcastSuggestion') {
        const roomCode = formData.get('roomCode')?.toString();
        const suggestion = formData.get('suggestion')?.toString();
        const username = formData.get('username')?.toString();
        const userId = formData.get('userId')?.toString();

        console.log(`[BROADCAST SUGGESTION] Received broadcast request for room: ${roomCode}, user: ${username}, suggestion: ${suggestion}`);

        if (!roomCode || !suggestion || !username || !userId) {
            console.log(`[BROADCAST SUGGESTION] Missing required fields`);
            return json({ error: "Missing room code, suggestion, username, or user ID." }, { status: 400 });
        }

        try {
            // Store the suggestion in the database
            const suggestionStored = await insertScenarioSuggestion(roomCode, userId, username, suggestion);
            
            console.log(`[BROADCAST SUGGESTION] Suggestion stored: ${suggestionStored}`);
            
            if (!suggestionStored) {
                return json({ error: "Failed to store suggestion." }, { status: 500 });
            }
            
            // Get all recent suggestions for the room
            const suggestions = await getScenarioSuggestions(roomCode);
            
            console.log(`[BROADCAST SUGGESTION] Room ${roomCode}: ${username} suggests "${suggestion}" - Found ${suggestions.length} total suggestions`);
            
            // Return success with only the last suggestion - this will trigger toast notifications for all clients
            const lastSuggestion = suggestions.length > 0 ? [suggestions[0]] : [];
            
            return json({ 
                success: true, 
                message: "Suggestion broadcasted to room",
                suggestions: lastSuggestion
            });
        } catch (error) {
            console.error("Error broadcasting suggestion:", error);
            return json({ error: "Failed to broadcast suggestion." }, { status: 500 });
        }
    }

    if (intent === 'selectScenario') {
        const roomCode = formData.get('roomCode')?.toString();
        const selectedScenarioStr = formData.get('selectedScenario')?.toString();
        const activeCharacterStr = formData.get('activeCharacter')?.toString();

        if (!roomCode || !selectedScenarioStr || !activeCharacterStr) {
            return json({ error: "Missing room code, selected scenario, or active character data." }, { status: 400 });
        }

        try {
            const selectedScenario: ScenarioForDisplay = JSON.parse(selectedScenarioStr);
            const activeCharacter: Character = JSON.parse(activeCharacterStr);
            const characterId = activeCharacter.id;

            console.log(`[SELECT SCENARIO] Room ${roomCode}: Selecting scenario "${selectedScenario.title}" for character ${characterId}`);

            // Set the scenario as the winner in the room
            const winnerSet = await setRoomScenarioWinner(roomCode, selectedScenario.id);
            if (winnerSet) {
                console.log(`[SELECT SCENARIO] Set scenario winner for room ${roomCode}: ${selectedScenario.id}`);
            } else {
                console.warn(`[SELECT SCENARIO] Failed to set scenario winner for room ${roomCode}`);
            }

            // Update room status to scenario-selected (NOT active_game)
            const statusUpdated = await updateRoomStatus(roomCode, 'scenario-selected');
            if (statusUpdated) {
                console.log(`[SELECT SCENARIO] Room ${roomCode} status updated to 'scenario-selected'`);
            } else {
                console.warn(`[SELECT SCENARIO] Failed to update room ${roomCode} status`);
            }

            // Clear scenario votes since we're done with voting
            clearScenarioVotes(roomCode);

            // Keep the generated scenarios for map generation
            // Do NOT clear scenarios - they will be used for map generation

            console.log(`[SELECT SCENARIO] Successfully selected scenario for room ${roomCode} - waiting for host to start map generation`);
            return json({ 
                success: true, 
                message: "Scenario selected successfully",
                selectedScenario 
            });
        } catch (error) {
            console.error("Error selecting scenario:", error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to select scenario';
            return json({ error: errorMessage }, { status: 500 });
        }
    }

    if (intent === 'startMapGeneration') {
        const roomCode = formData.get('roomCode')?.toString();
        const selectedScenarioStr = formData.get('selectedScenario')?.toString();

        if (!roomCode || !selectedScenarioStr) {
            return json({ error: "Missing room code or selected scenario data." }, { status: 400 });
        }

        try {
            const selectedScenario: ScenarioForDisplay = JSON.parse(selectedScenarioStr);

            console.log(`[START MAP GENERATION] Room ${roomCode}: Starting map generation for scenario "${selectedScenario.title}"`);

            // Update room status to active_game
            const statusUpdated = await updateRoomStatus(roomCode, 'active_game');
            if (statusUpdated) {
                console.log(`[START MAP GENERATION] Room ${roomCode} status updated to 'active_game'`);
            } else {
                console.warn(`[START MAP GENERATION] Failed to update room ${roomCode} status`);
            }

            // Store the selected scenario in cache for the game session
            const stored = await storeScenarios([selectedScenario]);
            if (!stored) {
                console.warn(`[START MAP GENERATION] Failed to store selected scenario in cache`);
            }

            console.log(`[START MAP GENERATION] Successfully started map generation for room ${roomCode}`);
            return json({ 
                success: true, 
                message: "Map generation started successfully",
                selectedScenario 
            });
        } catch (error) {
            console.error("Error starting map generation:", error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to start map generation';
            return json({ error: errorMessage }, { status: 500 });
        }
    }

    if (intent === 'recordDiceRoll') {
        const roomCode = formData.get('roomCode')?.toString();
        const userId = formData.get('userId')?.toString();
        const slotIndexStr = formData.get('slotIndex')?.toString();
        const diceResultStr = formData.get('diceResult')?.toString();

        if (!roomCode || !userId || !slotIndexStr || !diceResultStr) {
            return json({ error: "Missing required data for dice roll." }, { status: 400 });
        }

        try {
            const slotIndex = parseInt(slotIndexStr);
            const diceResult = parseInt(diceResultStr);

            // Import the function from roomDice.server
            const { recordDiceRoll } = await import("~/services/roomDice.server");
            
            const success = await recordDiceRoll(roomCode, userId, 'Human', slotIndex, diceResult, 'd20', 'tiebreaker');
            
            if (success) {
                console.log(`[DICE ROLL] Recorded dice roll for room ${roomCode}, user ${userId}, slot ${slotIndex}, result ${diceResult}`);
                return json({ success: true, message: "Dice roll recorded successfully" });
            } else {
                return json({ error: "Failed to record dice roll" }, { status: 500 });
            }
        } catch (error) {
            console.error("Error recording dice roll:", error);
            return json({ error: "Failed to record dice roll" }, { status: 500 });
        }
    }

    if (intent === 'getDiceRollingState') {
        const roomCode = formData.get('roomCode')?.toString();

        if (!roomCode) {
            return json({ error: "Missing room code." }, { status: 400 });
        }

        try {
            // Import the function from roomDice.server
            const { getDiceRollingState } = await import("~/services/roomDice.server");
            
            const diceState = await getDiceRollingState(roomCode);
            
            if (diceState) {
                console.log(`[DICE STATE] Retrieved dice rolling state for room ${roomCode}`);
                return json({ success: true, diceState });
            } else {
                return json({ error: "No active dice rolling state found" }, { status: 404 });
            }
        } catch (error) {
            console.error("Error getting dice rolling state:", error);
            return json({ error: "Failed to get dice rolling state" }, { status: 500 });
        }
    }

    if (intent === 'sendMessage') {
        const roomCode = formData.get('roomCode')?.toString();
        const message = formData.get('message')?.toString();
        const userId = formData.get('userId')?.toString();
        const username = formData.get('username')?.toString();

        console.log(`[SEND MESSAGE] Received message for room: ${roomCode}, user: ${username}`);

        if (!roomCode || !message || !userId || !username) {
            console.log(`[SEND MESSAGE] Missing required fields`);
            return json({ error: "Missing room code, message, user ID, or username." }, { status: 400 });
        }

        try {
            // Import the function from room.server
            const { insertChatMessage } = await import("~/services/room.server");
            
            const success = await insertChatMessage(roomCode, userId, username, message);
            
            if (success) {
                console.log(`[SEND MESSAGE] Message sent successfully for room: ${roomCode}`);
                return json({ success: true, message: "Message sent successfully" });
            } else {
                return json({ error: "Failed to send message" }, { status: 500 });
            }
        } catch (error) {
            console.error("Error sending chat message:", error);
            return json({ error: "Failed to send message" }, { status: 500 });
        }
    }

    return json({ error: "Invalid intent" }, { status: 400 });
}

export default function GameRoute() {
    const { party: initialParty, resolvedParty: initialResolvedParty, allRoomCharacters: initialAllRoomCharacters, currentUserId, currentUsername, activeCharacter, scenarios, messages, isInGame, roomCode: initialRoomCode, isHost, roomStatus: initialRoomStatus } = useLoaderData<LoaderData>();
    const navigation = useNavigation();
    const [fetcherKey, setFetcherKey] = useState(0);
    const navigate = useNavigate();
    const fetcher = useFetcher<{ data: { characterData: Character } | { error: string }, type: 'success' | 'error' }>({ key: `character-generation-${fetcherKey}` });
    const readinessFetcher = useFetcher<{ success: boolean, error?: string }>(); // New fetcher for readiness updates (deprecated - kept for compatibility)
    const leaveRoomFetcher = useFetcher<{ success: boolean, redirectUrl?: string }>(); // New fetcher for leaveRoom action
    const diceFetcher = useFetcher<{ success: boolean, error?: string }>(); // New fetcher for dice roll recording
    const submit = useSubmit(); // Hook for submitting forms outside of standard navigation

    const [showCreationModal, setShowCreationModal] = useState(false);
    const [creationInitialData, setCreationInitialData] = useState<Partial<Character> | null>(null);
    const [creationSlotIndex, setCreationSlotIndex] = useState<number | undefined>(undefined);
    const [showScenarioSelector, setShowScenarioSelector] = useState(initialRoomStatus === 'scenario_selection');

    // --- Optimistic Slot Update Hook ---
    const [currentParty, setCurrentParty] = useState<PlayerSlot[]>(initialParty);
    const { 
        updateSlot, 
        getSlotSyncState
    } = useOptimisticSlotUpdate({
        roomCode: initialRoomCode,
        currentParty: currentParty,
        onPartyUpdate: setCurrentParty
    });
    
    // --- Local State Management for Setup ---
    const [currentResolvedParty, setCurrentResolvedParty] = useState<Character[]>(initialResolvedParty);
    const [currentAllRoomCharacters, setCurrentAllRoomCharacters] = useState<Character[]>(initialAllRoomCharacters);
    const [currentRoomCode, setCurrentRoomCode] = useState<string | null>(initialRoomCode); // <-- NEW STATE
    const currentPartyRef = useRef<PlayerSlot[]>(currentParty); // Ref to hold current party state
    // ----------------------------------------

    // CRITICAL FIX: Use initialRoomCode for structural rendering to ensure SSR consistency
    const isLobbyView = !!initialRoomCode; // <-- FIX: Use this derived value for structural rendering
    
    const isLoading = navigation.state !== 'idle';
    const isGenerating = fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'generateRandomCharacter';

    // Calculate readiness status based on local state
    const activeSlots = useMemo(() => currentParty.filter(slot => slot.type === 'Human' || slot.type === 'AI'), [currentParty]);
    const allActiveSlotsReady = activeSlots.length > 0 && activeSlots.every(slot => slot.isReady);
    const showProceedButton = !isInGame && !isLobbyView && !isGenerating; // <-- Use isLobbyView and isGenerating

    // --- Heartbeat Effect (Pinging the server every 5 seconds if in a room) ---
    const heartbeatFetcher = useFetcher();

    useEffect(() => {
        // Use currentRoomCode for dynamic state/action submission
        if (currentRoomCode) {
            const intervalId = setInterval(() => {
                // Only ping if the fetcher is idle to avoid queueing requests
                if (heartbeatFetcher.state === 'idle') {
                    heartbeatFetcher.submit(
                        { roomCode: currentRoomCode },
                        { method: 'post', action: '/api/room/heartbeat' }
                    );
                }
            }, 5000); // Ping every 5 seconds

            return () => clearInterval(intervalId);
        }
    }, [currentRoomCode, heartbeatFetcher]);
    // --------------------------------------------------------------------------

    // --- Realtime Subscription Effect to synchronize slot data with other users in the room ---
    useEffect(() => {
        if (!currentRoomCode) return;
        
        console.log(`[REALTIME SUBSCRIPTION] Starting realtime subscription for room ${currentRoomCode} for user ${currentUserId}`);
        
        // Subscribe to room changes
        const unsubscribe = subscribeToRoomChanges(currentRoomCode, (payload) => {
            console.log(`[REALTIME SUBSCRIPTION] Received room update for room ${currentRoomCode}:`, payload);
            
            const newSlots = payload.new.setup_slots;
            
            // Update local state with server state
            console.log(`[REALTIME SUBSCRIPTION] Updating local party state with server slots:`, newSlots.map((s: PlayerSlot) => ({ 
                type: s.type, 
                characterId: s.characterId?.substring(0, 8), 
                userId: s.userId?.substring(0, 8) 
            })));
            
            // Stabilize the party slots by ensuring consistent structure
            const stabilizedSlots = newSlots.map(slot => ({
                ...slot,
                userId: slot.userId || null,
                username: slot.username || null,
                characterId: slot.characterId || null
            }));
            setCurrentParty(stabilizedSlots);
        });
        
        // Cleanup function
        return () => {
            console.log(`[REALTIME SUBSCRIPTION] Unsubscribing from room ${currentRoomCode}`);
            unsubscribe();
        };
    }, [currentRoomCode, currentUserId]);

    // --- Effect to handle leaveRoom redirect response ---
    useEffect(() => {
        if (leaveRoomFetcher.data && leaveRoomFetcher.state === 'idle') {
            if (leaveRoomFetcher.data.success && leaveRoomFetcher.data.redirectUrl) {
                navigate(leaveRoomFetcher.data.redirectUrl);
            }
        }
    }, [leaveRoomFetcher.data, leaveRoomFetcher.state, navigate]);
    // --------------------------------------------------------------------------

    // --- Effect to synchronize local state with loader data on mount/redirect ---
    // This is crucial for ensuring local state reflects persistent changes after CRUD actions redirect back.
    useEffect(() => {
        setCurrentParty(initialParty);
        setCurrentResolvedParty(initialResolvedParty);
        setCurrentAllRoomCharacters(initialAllRoomCharacters);
        setCurrentRoomCode(initialRoomCode); // Ensure room code is synced
    }, [initialParty, initialResolvedParty, initialAllRoomCharacters, initialRoomCode]);
    // --------------------------------------------------------------------------

    // --- Effect to update currentPartyRef when currentParty changes ---
    useEffect(() => {
        currentPartyRef.current = currentParty;
    }, [currentParty]);
    
    // --- Effect to ensure stable keys for React rendering ---
    useEffect(() => {
        // Validate that party slots have stable keys for React rendering
        currentParty.forEach((slot, index) => {
            if (!slot || typeof slot !== 'object') {
                console.warn('[RENDER VALIDATION] Invalid slot structure:', slot, index);
            }
        });
    }, [currentParty]);
    
    // --- Effect to ensure party slots have proper keys for React rendering ---
    useEffect(() => {
        // Ensure each slot has a stable key for React rendering
        // This effect just validates that we have consistent keys, doesn't change state
        currentParty.forEach((slot, index) => {
            // Validate slot structure for React rendering
            if (!slot || typeof slot !== 'object') {
                console.warn('[RENDER VALIDATION] Invalid slot structure:', slot, index);
            }
        });
    }, [currentParty]);
    // --------------------------------------------------------------------------

    // --- Effect to synchronize slots when room code changes ---
    useEffect(() => {
        if (currentRoomCode && currentParty.length > 0) {
            // With realtime subscription in place, this effect is no longer needed
            // Keeping it as a low-frequency fallback (every 300 seconds) in case realtime fails
            const interval = setInterval(async () => {
                try {
                    console.log(`[FALLBACK SYNCHRONIZATION] Performing fallback sync for room ${currentRoomCode}`);
                    
                    const formData = new FormData();
                    formData.append('intent', 'getRoomData');
                    formData.append('roomCode', currentRoomCode);
                    
                    const response = await fetch('/game', {
                        method: 'POST',
                        body: formData,
                        credentials: 'same-origin',
                        headers: {
                            'Accept': 'application/json'
                        }
                    });
                    
                    if (response.ok) {
                        const data = await response.json();
                        const roomData = data.room;
                        
                        if (roomData && roomData.setup_slots) {
                            const newSlots = roomData.setup_slots;
                            
                            // Use the ref to get the most recent party state
                            const localParty = currentPartyRef.current;
                            
                            // Check if any slots have changed
                            const hasChanges = localParty.some((slot, index) => {
                                const newSlot = newSlots[index];
                                return slot.type !== newSlot.type || 
                                       slot.characterId !== newSlot.characterId ||
                                       slot.userId !== newSlot.userId;
                            });
                            
                            if (hasChanges) {
                                console.log(`[FALLBACK SYNCHRONIZATION] Detected slot mismatches, updating to synchronized state`);
                                console.log(`[FALLBACK SYNCHRONIZATION] Current slots:`, localParty.map(s => ({ type: s.type, characterId: s.characterId?.substring(0, 8), userId: s.userId?.substring(0, 8) })));
                                console.log(`[FALLBACK SYNCHRONIZATION] Synchronized slots:`, newSlots.map((s: PlayerSlot) => ({ type: s.type, characterId: s.characterId?.substring(0, 8), userId: s.userId?.substring(0, 8) })));
                                // Stabilize the party slots by ensuring consistent structure
                                const stabilizedSlots = newSlots.map(slot => ({
                                    ...slot,
                                    userId: slot.userId || null,
                                    username: slot.username || null,
                                    characterId: slot.characterId || null
                                }));
                                setCurrentParty(stabilizedSlots);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Failed to synchronize slots:', error);
                    
                    // Check if this is a network error or invalid JSON
                    if (error instanceof Error) {
                        if (error.message.includes('<!DOCTYPE')) {
                            console.warn('[FALLBACK SYNCHRONIZATION] API returned HTML instead of JSON - possible 404 or server error');
                        } else if (error.message.includes('Unexpected token')) {
                            console.warn('[FALLBACK SYNCHRONIZATION] API returned invalid JSON - possible server error');
                        }
                    }
                    
                    // Don't throw error, just log and continue - local state should be preserved
                }
            }, 300000); // Fallback sync every 5 minutes (300 seconds)
            
            return () => clearInterval(interval);
        }
    }, [currentRoomCode, currentParty.length]); // Depend on currentRoomCode and currentParty.length

    // --- New Effect to handle readiness persistence response ---
    // Removed: Rollback logic now handled by useOptimisticSlotUpdate hook
    // ----------------------------------------------------------

    // --- Effect to handle room status changes ---
    useEffect(() => {
        if (initialRoomStatus === 'scenario_selection') {
            setShowScenarioSelector(true);
            console.log('[ROOM STATUS] Room status changed to scenario_selection, showing scenario selector');
        } else if (initialRoomStatus !== 'scenario_selection') {
            setShowScenarioSelector(false);
        }
    }, [initialRoomStatus]);

    // --- Effect to handle scenario updates from generateScenarios action ---
    useEffect(() => {
        if (fetcher.state === 'idle' && fetcher.data) {
            if (fetcher.data.scenarios) {
                console.log(`[SCENARIO UPDATE] Received ${fetcher.data.scenarios.length} scenarios from generateScenarios action`);
                // This will trigger a re-render with the new scenarios
                // The loader data should be updated via the action's response
            }
        }
    }, [fetcher.state, fetcher.data]);

    // --- Effect to prevent React DOM placement errors ---
    useEffect(() => {
        // Ensure party slots are properly initialized before rendering
        if (currentParty.length === 0 && initialParty.length > 0) {
            console.log('[RENDER PROTECTION] Initializing party slots to prevent DOM errors');
            setCurrentParty(initialParty);
        }
    }, [currentParty.length, initialParty]);
    
    // --- Effect to ensure consistent slot structure ---
    useEffect(() => {
        // Validate and stabilize slot structure to prevent React hydration issues
        const stabilizedParty = currentParty.map((slot, index) => {
            if (!slot || typeof slot !== 'object') {
                console.warn('[RENDER STABILIZATION] Invalid slot detected, creating default slot:', slot, index);
                return {
                    type: 'None',
                    characterId: null,
                    isReady: false,
                    userId: null,
                    username: null
                };
            }
            return {
                ...slot,
                userId: slot.userId || null,
                username: slot.username || null,
                characterId: slot.characterId || null
            };
        });
        
        // Only update if there's a structural change, not just a reference change
        const hasStructuralChange = stabilizedParty.some((newSlot, index) => {
            const oldSlot = currentParty[index];
            return (
                newSlot.type !== oldSlot.type ||
                newSlot.characterId !== oldSlot.characterId ||
                newSlot.userId !== oldSlot.userId ||
                newSlot.username !== oldSlot.username ||
                newSlot.isReady !== oldSlot.isReady
            );
        });
        
        if (hasStructuralChange) {
            console.log('[RENDER STABILIZATION] Stabilizing party slots structure');
            setCurrentParty(stabilizedParty);
        }
    }, [currentParty]);
    
    // --- Effect to ensure React keys are stable for PlayerSetupSlot components ---
    useEffect(() => {
        // Ensure each slot has a stable key for React rendering
        currentParty.forEach((slot, index) => {
            if (!slot) {
                console.warn('[RENDER VALIDATION] Missing slot at index:', index);
            }
        });
    }, [currentParty]);

    // --- Handlers for Local State Updates ---
    const handleSlotChange = (slotIndex: number, newPlayerSlot: PlayerSlot) => {
        console.log(`[SLOT CHANGE] Slot ${slotIndex} changed to:`, newPlayerSlot);
        
        // Use optimistic update hook instead of direct state mutation
        updateSlot(slotIndex, newPlayerSlot);
    };

    const handleEditCharacter = (character: Character, slotIndex: number) => {
        setCreationInitialData(character);
        setCreationSlotIndex(slotIndex);
        setShowCreationModal(true);
    };

    const handleDeleteCharacter = (characterId: string) => {
        // 1. Remove character from resolved list
        setCurrentResolvedParty(prevChars => prevChars.filter(c => c.id !== characterId));

        // 2. Clear character reference from all slots
        const updatedPartyAfterDelete = currentParty.map(slot =>
            slot.characterId === characterId
                ? { ...slot, characterId: null, isReady: false, userId: undefined, username: undefined } // Clear user info too
                : slot
        );
        setCurrentParty(updatedPartyAfterDelete);

        // 3. Trigger save action to persist character list removal
        fetcher.submit(
            {
                intent: 'setPartyAndStartGame',
                playerSlots: JSON.stringify(updatedPartyAfterDelete),
                allCharacters: JSON.stringify(currentResolvedParty.filter(c => c.id !== characterId)),
            },
            { method: 'post', action: '/game' }
        );
    };

    const handleToggleReady = (slotIndex: number, isReady: boolean) => {
        // Get current slot and clone it with updated readiness
        const currentSlot = currentParty[slotIndex];
        const updatedSlot = {
            ...currentSlot,
            isReady
        };
        
        console.log(`[TOGGLE READY] Slot ${slotIndex} changing to ${isReady}`);
        
        // Use optimistic update hook instead of direct state mutation
        updateSlot(slotIndex, updatedSlot);
    };
    // ----------------------------------------


    // --- Handle AI Generation Response ---
    useEffect(() => {
        console.log(`[GAME ROUTE] AI Fetcher State: ${fetcher.state}, Data: ${JSON.stringify(fetcher.data)}`);
        if (fetcher.state === 'idle' && fetcher.data) {
            if (fetcher.data.type === 'success' && 'characterData' in fetcher.data.data) {
                console.log("[GAME ROUTE] AI Character successfully generated. Opening form.");
                setCreationInitialData(fetcher.data.data.characterData);
                setCreationSlotIndex(undefined);
                setShowCreationModal(true);
            } else if (fetcher.data.type === 'error') {
                alert(`Character Generation Failed: ${fetcher.data.data && 'error' in fetcher.data.data ? fetcher.data.data.error : 'Unknown error'}`);
            }
            // Clear fetcher data by setting a new key to force a fresh fetcher instance
            setFetcherKey(prev => prev + 1);
        }
    }, [fetcher.state, fetcher.data]);

    // Character generation handler (currently not used in this implementation)
    // const handleGenerateRandomCharacter = (e: React.FormEvent) => {
    //     e.preventDefault();
    //     console.log('[GAME ROUTE] Generating random character...');
    //     const defaultClass = DND_5E_CHARACTERS[0]?.class || 'Fighter';
    //     const defaultRace = DND_5E_CHARACTERS[0]?.race || 'Human';
    //     const defaultBackground = 'Adventurer';

    //     fetcher.submit(
    //         {
    //             intent: 'generateRandomCharacter',
    //             class: defaultClass,
    //             race: defaultRace,
    //             background: defaultBackground,
    //             generateFull: 'true'
    //         },
    //         { method: 'post', action: '/game' }
    //     );
    // };

    const handleStartManualCreation = () => {
        console.log("[GAME ROUTE] 'Start Manual Creation' clicked.");
        setCreationInitialData(null);
        setCreationSlotIndex(undefined);
        setShowCreationModal(true);
    };

    // Use the function to ensure it's not unused
    const manualCreationHandler = handleStartManualCreation;
    console.log('[GAME ROUTE] Manual creation handler ready:', typeof manualCreationHandler);

    const handleFormSave = (character: Character, slotIndex?: number, saveAsNewName?: string, originalIdToDelete?: string) => {
        // This handler triggers persistence via 'setPartyAndStartGame' which reloads the page, resetting local state to loader data.

        let characterDataToSubmit: Character[];
        let playerSlotsToSubmit: PlayerSlot[];

        const currentPartyState = currentParty; // Use current local state for context
        const currentCharacters = currentResolvedParty;

        if (saveAsNewName && originalIdToDelete) {
            // Case: User edited an existing character and chose 'Save as New'
            const newCharacter = { ...character, name: saveAsNewName, id: crypto.randomUUID() };
            characterDataToSubmit = [...currentCharacters.filter(c => c.id !== originalIdToDelete), newCharacter];

            playerSlotsToSubmit = currentPartyState.map(slot => {
                if (slot.characterId === originalIdToDelete) {
                    return { ...slot, characterId: newCharacter.id };
                }
                return slot;
            });

        } else if (originalIdToDelete) {
            // Case: User edited an existing character and chose 'Overwrite'
            characterDataToSubmit = [...currentCharacters.filter(c => c.id !== originalIdToDelete), character];
            playerSlotsToSubmit = currentPartyState;
        } else {
            // Case: New character creation (either manual or AI generated)
            characterDataToSubmit = [...currentCharacters, character];
            playerSlotsToSubmit = [...currentPartyState];

            if (slotIndex !== undefined && slotIndex >= 0 && slotIndex < playerSlotsToSubmit.length) {
                playerSlotsToSubmit[slotIndex] = {
                    type: playerSlotsToSubmit[slotIndex]?.type || 'Human',
                    characterId: character.id,
                    isReady: true // New characters start ready if assigned to a slot
                };
            }
        }

        // Submit the updated configuration for persistence and reload
        fetcher.submit(
            {
                intent: 'setPartyAndStartGame',
                playerSlots: JSON.stringify(playerSlotsToSubmit),
                allCharacters: JSON.stringify(characterDataToSubmit),
            },
            { method: 'post', action: '/game' }
        );

        setShowCreationModal(false);
        setCreationInitialData(null);
    };

    const handleFormClose = () => {
        setShowCreationModal(false);
        setCreationInitialData(null);
        if (fetcher.state !== 'idle') {
            // Clear fetcher data by setting a new key to force a fresh fetcher instance
            setFetcherKey(prev => prev + 1);
        }
    };

    // Dice roll recording handler
    const handleDiceRoll = async (slotIndex: number, result: number, userIdForSlot: string) => {
        if (!currentRoomCode) {
            console.warn('[DICE ROLL] No room code available for dice roll recording');
            return false;
        }

        console.log(`[DICE ROLL] Recording roll for slot ${slotIndex}, result ${result}, userId ${userIdForSlot}`);

        // Submit dice roll data
        diceFetcher.submit(
            {
                intent: 'recordDiceRoll',
                roomCode: currentRoomCode,
                userId: userIdForSlot,
                slotIndex: slotIndex.toString(),
                diceResult: result.toString(),
                diceType: 'd20',
                rollReason: 'tiebreaker'
            },
            { method: 'post', action: '/game' }
        );

        return true;
    };

    const handleProceed = () => {
        if (!allActiveSlotsReady) {
            console.warn("Cannot proceed: Not all active slots are ready.");
            return;
        }
        // Submit current local state for final validation and transition
        submit(
            {
                intent: 'finalizeSetup',
                playerSlots: JSON.stringify(currentParty),
                allCharacters: JSON.stringify(currentResolvedParty),
            },
            { method: 'post', action: '/game' }
        );
    };


    // --- UI Rendering for Party Setup ---
    if (!isInGame) {

        let setupContent;
        let rootClasses = "flex flex-col items-center min-h-screen bg-gray-950 text-white";

        if (isLobbyView) { // <-- FIX: Use isLobbyView for structural split
            // --- POST-CREATION VIEW (Lobby Setup) ---
            if (showScenarioSelector) {
                // Show ScenarioSelector with countdown
                console.log(`[GAME ROUTE] Rendering ScenarioSelector with ${scenarios.length} scenarios`);
                return (
                    <>
                        <ScenarioSelector
                            scenarios={scenarios}
                            isLoading={isLoading}
                            activeCharacter={activeCharacter}
                            showCountdown={true}
                            partyCharacters={currentAllRoomCharacters}
                            partySlots={currentParty}
                            currentUserId={currentUserId}
                            roomCode={initialRoomCode}
                            isHost={isHost}
                        />
                    </>
                );
            }

            rootClasses += " justify-center p-8";
            setupContent = (
                <div className="w-full flex flex-col items-center"> {/* WRAPPER ADDED: Stabilize structure */}
                    <h1 className="text-5xl font-medieval text-green-500 mb-6">Room Created Successfully!</h1>
                    <p className="text-xl text-gray-300 mb-4">Share this code with your players:</p>

                    <div className="bg-gray-800 p-8 rounded-xl border-4 border-red-500 shadow-2xl text-center">
                        <p className="text-lg mb-2 text-gray-400">Room Code:</p>
                        <code className="text-6xl font-mono tracking-widest text-yellow-400 bg-gray-900 p-3 rounded-lg inline-block select-all">
                            {initialRoomCode}
                        </code>
                        <p className="text-sm mt-2 text-gray-500">(This is your unique token)</p>
                    </div>

                    <p className="text-lg mt-8 text-gray-300">Waiting for players to join...</p>

                    {/* Buttons for Host vs Non-Host */}
                    <div className="mt-4 flex gap-4 justify-center">
                        {isHost ? (
                            <fetcher.Form method="post" action="/game">
                                <input type="hidden" name="intent" value="deleteRoom" />
                                <input type="hidden" name="roomCode" value={initialRoomCode} />
                                <button
                                    type="submit"
                                    disabled={fetcher.state !== 'idle'}
                                    className="py-2 px-4 bg-red-700 hover:bg-red-600 text-white font-bold rounded transition duration-300"
                                >
                                    {fetcher.state === 'submitting' && fetcher.formData?.get('intent') === 'deleteRoom' ? 'Deleting...' : 'Delete Room & Exit'}
                                </button>
                            </fetcher.Form>
                        ) : (
                            <leaveRoomFetcher.Form method="post" action="/game">
                                <input type="hidden" name="intent" value="leaveRoom" />
                                <input type="hidden" name="roomCode" value={initialRoomCode} />
                                <button
                                    type="submit"
                                    disabled={leaveRoomFetcher.state !== 'idle'}
                                    className="py-2 px-4 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded transition duration-300"
                                >
                                    {leaveRoomFetcher.state === 'submitting' ? 'Exiting...' : 'Exit to Room Selection'}
                                </button>
                            </leaveRoomFetcher.Form>
                        )}
                    </div>

                    <div className="mt-10 w-full max-w-6xl">
                        <h2 className="text-3xl font-bold text-red-400 mb-4 text-center">Party Setup</h2>
                        
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            {currentParty.map((slot, index) => (
                                <PlayerSetupSlot
                                    key={index}
                                    slotIndex={index}
                                    playerSlot={slot}
                                    allCharacters={currentAllRoomCharacters}
                                    userOwnCharacters={currentResolvedParty}
                                    allSlots={currentParty} // Pass current local state for availability checks
                                    onSlotChange={handleSlotChange}
                                    onEditCharacter={handleEditCharacter}
                                    onDeleteCharacter={handleDeleteCharacter}
                                    onToggleReady={handleToggleReady} // Pass readiness handler
                                    showManagementButtons={true} // <-- ENABLED FOR PARTY SETUP
                                    currentUserId={currentUserId}
                                    onPlayerRollComplete={handleDiceRoll} // Pass dice roll handler
                                    currentUsername={currentUsername} // Corrected: Use destructured currentUsername
                                    isLobbyView={isLobbyView}
                                    syncStatus={getSlotSyncState(index)}
                                />
                            ))}
                        </div>

                        {allActiveSlotsReady && (
                            <div className="mt-8 text-center">
                                {isHost ? (
                                    <fetcher.Form method="post">
                                        <input type="hidden" name="intent" value="generateScenarios" />
                                        <input type="hidden" name="roomCode" value={initialRoomCode || ''} />
                                        <input type="hidden" name="duration" value="Short" />
                                        <input type="hidden" name="activeCharacter" value={JSON.stringify(activeCharacter)} />
                                        <input type="hidden" name="partyCharacters" value={JSON.stringify(currentResolvedParty)} />
                                        <input type="hidden" name="partySlots" value={JSON.stringify(currentParty)} />
                                        <button
                                            type="submit"
                                            disabled={fetcher.state !== 'idle'}
                                            className={`py-3 px-8 text-xl font-bold rounded-lg shadow-lg transition duration-300 ${
                                                (fetcher.state !== 'idle')
                                                ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                                : 'bg-green-600 hover:bg-green-500 text-white'
                                            }`}
                                        >
                                            Next: Scenario Selection
                                        </button>
                                    </fetcher.Form>
                                ) : (
                                    <>
                                        <button
                                            type="button"
                                            disabled
                                            className="py-3 px-8 text-xl font-bold rounded-lg shadow-lg transition duration-300 bg-gray-600 text-gray-400 cursor-not-allowed"
                                        >
                                            Next: Scenario Selection
                                        </button>
                                        <p className="text-sm text-gray-400 mt-2">Waiting for the host to start the scenario selection.</p>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            );
            // --- END POST-CREATION VIEW ---
        } else {
            // --- STANDARD SETUP VIEW (No room code yet) ---
            rootClasses += " p-4";
            setupContent = (
                <div className="w-full flex flex-col items-center"> {/* WRAPPER ADDED: Stabilize structure */}
                    <h1 className="text-5xl font-medieval text-red-500 mb-8 mt-4">The Gathering</h1>

                    {/* Party Setup / Player Status Display */}
                    <div className="w-full max-w-6xl bg-gray-800 p-6 rounded-xl border border-gray-600 shadow-xl mb-8">
                        <h2 className="text-3xl font-bold text-red-400 mb-4 text-center">Party Setup (Active Slots)</h2>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            {currentParty.map((slot, index) => (
                                <PlayerSetupSlot
                                    key={index}
                                    slotIndex={index}
                                    playerSlot={slot}
                                    allCharacters={currentAllRoomCharacters}
                                    userOwnCharacters={currentResolvedParty}
                                    allSlots={currentParty} // Pass current local state for availability checks
                                    onSlotChange={handleSlotChange}
                                    onEditCharacter={handleEditCharacter}
                                    onDeleteCharacter={handleDeleteCharacter}
                                    onToggleReady={handleToggleReady} // Pass readiness handler
                                    showManagementButtons={true} // <-- ENABLED FOR PARTY SETUP
                                    currentUserId={currentUserId}
                                    onPlayerRollComplete={handleDiceRoll} // Pass dice roll handler
                                    currentUsername={currentUsername} // NEW PROP
                                    isLobbyView={isLobbyView}
                                    syncStatus={getSlotSyncState(index)}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Scenario Selector */}
                    <ScenarioSelector
                        scenarios={scenarios}
                        isLoading={isLoading}
                        activeCharacter={activeCharacter}
                        partyCharacters={currentAllRoomCharacters}
                        partySlots={currentParty}
                        currentUserId={currentUserId}
                        currentUsername={currentUsername} // NEW PROP
                        roomCode={initialRoomCode}
                        isHost={isHost}
                    />
                    
                    {/* DEBUG: Show host status in component */}
                    <div className="mt-4 p-3 bg-gray-700 rounded-md border border-gray-600">
                      <div className="text-sm font-semibold text-gray-300 mb-2">Component Debug:</div>
                      <div className="text-xs text-gray-400 space-y-1">
                        <div>isHost: <span className={isHost ? "text-green-400 font-bold" : "text-red-400 font-bold"}>{isHost.toString()}</span></div>
                        <div>roomCode: <span className="text-yellow-400">{initialRoomCode || 'null'}</span></div>
                        <div>currentUserId: <span className="text-yellow-400">{currentUserId || 'null'}</span></div>
                      </div>
                    </div>
                </div>
            );
            // --- END STANDARD SETUP VIEW ---
        }

        // Proceed Button (Only shown in STANDARD SETUP VIEW, i.e., when isLobbyView is false)
        const proceedButton = showProceedButton && (
            <div className="mt-8 w-full max-w-6xl flex justify-end">
                <button
                    onClick={handleProceed}
                    disabled={!allActiveSlotsReady || navigation.state !== 'idle' || readinessFetcher.state !== 'idle'}
                    className={`py-3 px-8 text-xl font-bold rounded-lg shadow-lg transition duration-300
                        ${allActiveSlotsReady && navigation.state === 'idle' && readinessFetcher.state === 'idle'
                            ? 'bg-blue-600 hover:bg-blue-500 text-white'
                            : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        }`}
                >
                    Proceed to Room Selection
                </button>
            </div>
        );

        // Return the unified setup view structure
        return (
            <>
                <div className={rootClasses}>
                    {setupContent}
                    {proceedButton}
                </div>

                {/* New Character Creation Modal (Rendered outside the main content div for consistent DOM structure) */}
                {showCreationModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
                        <NewCharacterForm
                            initialData={creationInitialData}
                            onSave={handleFormSave}
                            onClose={handleFormClose}
                            slotIndex={creationSlotIndex}
                        />
                    </div>
                )}
            </>
        );
    } // Closing brace for if (!isInGame)

    // --- In Game View (If isInGame is true AND roomCode is present, or if we transition later) ---
    return (
        <div className="flex flex-col items-center p-4 min-h-screen bg-gray-950 text-white">
            <h1 className="text-5xl font-medieval text-red-500 mb-8 mt-4">Adventure in Progress</h1>
            <AdventureLog messages={messages || []} isLoading={false} />
            {/* ... other in-game components */}
        </div>
    );
}
