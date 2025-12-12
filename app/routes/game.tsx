import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, useNavigation, useFetcher, useSubmit } from "@remix-run/react";
import { getSession, commitSession } from "~/sessions";
import type { Character, PlayerSlot, ScenarioForDisplay, User } from "~/types";
import { generateScenariosForCharacter, continueAdventure } from "~/services/gemini.server";
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
import { getCharactersForUser, saveTemporaryPartySetup, getUserById, getCharactersByIds } from "~/services/db.server"; // <-- Import getCharactersByIds
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
import { subscribeToRoomChanges, unsubscribeFromAllRoomChanges } from "~/services/realtime.client"; // <-- Import realtime subscription

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

    console.log(`[GAME LOADER] Loading game route for user ${userId?.substring(0, 8) || 'unknown'}, roomCode: ${roomCode}`);
    
    console.log(`[GAME LOADER] Search params:`, Object.fromEntries(url.searchParams.entries()));

    if (!userId) {
        return redirect("/login");
    }

    let party: PlayerSlot[] = [];
    let allRoomCharacters: Character[] = [];
    let room = null; // Initialize room variable outside the if block

    // FIX: Fetch actual characters for the user instead of mocks
    // This ALWAYS contains the current user's characters, regardless of room state
    const resolvedParty: Character[] = (await getCharactersForUser(userId)).filter((c): c is Character => c !== null);
    allRoomCharacters = resolvedParty;

    if (roomCode) {
        // Fetch room data to get the saved slot configuration
        room = await getRoomByCode(roomCode);

        if (room && room.setup_slots) {
            // Check room status and redirect accordingly
            if (room.status === 'scenario_selection') {
                // Room is in scenario selection mode - stay in game route for voting
                console.log(`[GAME ROUTE] Room ${roomCode} is in scenario_selection status, showing voting interface`);
                // Continue with game route to show scenario selection
            } else if (room.status === 'active') {
                // Room is ready for map generation - redirect to world-map
                console.log(`[REDIRECT] Room ${roomCode} is in active status, redirecting to world-map for map generation`);
                return redirect(`/world-map?roomCode=${roomCode}`);
            }

            // --- START: Username Enrichment Logic & Character Fetching ---
            const participantIds = room.participants.map(p => p.userId);
            const characterIds = room.setup_slots.map(s => s.characterId).filter((id): id is string => !!id);

            // Batch fetch usernames and characters
            const userPromises = participantIds.map(id => getUserById(id));
            const users = await Promise.all(userPromises);

            // Fetch all characters mentioned in the room slots (for display in other players' slots)
            const roomCharacters = await getCharactersByIds(characterIds);
            
            // For display: combine current user's characters with other room characters
            allRoomCharacters = [...resolvedParty, ...roomCharacters.filter(c => !resolvedParty.some(rc => rc.id === c.id))];

            const userMap = new Map(users.filter((u): u is User => !!u).map(u => [u.id, u.username]));
            const participantMap = new Map(room.participants.map(p => [p.characterId, p.userId]));
            const characterMap = new Map(allRoomCharacters.map(c => [c.id, c]));

            // Use the saved slots from the room, preserving character selection and readiness, and enriching with user data
            party = room.setup_slots.map(slot => {
                if (slot.characterId) {
                    const slotUserId = participantMap.get(slot.characterId);
                    const character = characterMap.get(slot.characterId);
                    if (slotUserId && character) {
                        const username = userMap.get(slotUserId);
                        return { 
                            ...slot, 
                            userId: slotUserId, 
                            username,
                            characterName: character.name
                        };
                    }
                }
                return slot;
            });
            // --- END: Username Enrichment Logic & Character Fetching ---

        } else {
            // Room code provided but room not found (e.g., expired or invalid code)
            console.warn(`Room with code ${roomCode} not found or missing setup data.`);
            // If the room is not found, redirect back to rooms with an error message
            const session = await getSession(cookieHeader || "");
            session.flash("error", `Impossible to join this room: Room with code ${roomCode} not found or missing setup data.`);
            return redirect("/rooms", {
                headers: {
                    "Set-Cookie": await commitSession(session),
                },
            });
        }
    } else {
        // Standard setup view (no room code) - use default setup if no characters exist,
        // otherwise default to the first character if available.
        const defaultCharId = resolvedParty.length > 0 ? resolvedParty[0].id : null;

        party = [
            { type: defaultCharId ? 'Human' : 'None', characterId: defaultCharId, isReady: !!defaultCharId, userId: userId, username: undefined }, // Host slot gets user info locally
            { type: 'None', characterId: null, isReady: false },
            { type: 'None', characterId: null, isReady: false },
            { type: 'None', characterId: null, isReady: false },
        ];
    }

    // Determine the active character (usually the first human slot or first available character)
    let activeCharacter: Character | null = null;
    
    console.log(`[GAME ROUTE LOADER] Determining active character for room ${roomCode}:`);
    console.log(`  Party slots:`, party.map(s => ({ type: s.type, characterId: s.characterId, userId: s.userId })));
    console.log(`  Resolved party characters:`, resolvedParty.map(c => ({ id: c.id, name: c.name })));
    console.log(`  All room characters:`, allRoomCharacters.map(c => ({ id: c.id, name: c.name })));
    
    // First try to find the first Human slot in the party
    const firstHumanSlot = party.find(s => s.type === 'Human');
    if (firstHumanSlot?.characterId) {
        console.log(`  First Human slot found: ${firstHumanSlot.characterId}`);
        activeCharacter = resolvedParty.find(c => c.id === firstHumanSlot.characterId) || null;
        if (activeCharacter) {
            console.log(`  Active character found in resolvedParty: ${activeCharacter.name}`);
        }
    }
    
    // If no Human slot found or character not found, try to find any character in the party
    if (!activeCharacter) {
        const firstSlotWithCharacter = party.find(s => s.characterId);
        if (firstSlotWithCharacter?.characterId) {
            console.log(`  First slot with character found: ${firstSlotWithCharacter.characterId}`);
            // Try to find character in resolvedParty first, then in allRoomCharacters
            activeCharacter = resolvedParty.find(c => c.id === firstSlotWithCharacter.characterId) || 
                             allRoomCharacters.find(c => c.id === firstSlotWithCharacter.characterId) || null;
            if (activeCharacter) {
                console.log(`  Active character found: ${activeCharacter.name}`);
            }
        }
    }
    
    // Fallback: use the first character in resolvedParty
    if (!activeCharacter && resolvedParty.length > 0) {
        activeCharacter = resolvedParty[0];
        console.log(`  Fallback to first character: ${activeCharacter.name}`);
    }
    
    if (!activeCharacter) {
        console.warn(`[GAME ROUTE LOADER] No active character found for room ${roomCode}`);
    }

    let scenariosForDisplay: ScenarioForDisplay[] = [];
    if (roomCode) {
        const scenarios = await getRoomScenariosForVoting(roomCode);
        if (scenarios) {
            scenariosForDisplay = scenarios;
        }
    }
    const messages: { role: 'user' | 'model'; text: string }[] = [];

    // Check if current user is the host (only if in a room)
    let isHost = false;
    if (roomCode && room && room.setup_slots) {
        console.log(`[GAME ROUTE LOADER] Checking host status for room ${roomCode}:`);
        console.log(`  userId: ${userId}`);
        console.log(`  room.owner_id: ${room.owner_id}`);
        console.log(`  room.host_id: ${room.host_id}`);
        console.log(`  owner_id === userId: ${room.owner_id === userId}`);
        console.log(`  host_id === userId: ${room.host_id === userId}`);
        
        isHost = room.host_id === userId;
        console.log(`  isHost: ${isHost}`);
        
        console.log(`[GAME ROUTE LOADER] Room data:`, {
            code: room.code,
            owner_id: room.owner_id,
            host_id: room.host_id,
            participants: room.participants,
            setup_slots: room.setup_slots.map(s => ({ type: s.type, characterId: s.characterId, userId: s.userId }))
        });
    }

    // isInGame is false if roomCode is present (lobby setup) or if we are in the standard setup view.
    const isInGame = false;

    return json<LoaderData>({ party, resolvedParty, allRoomCharacters, currentUserId: userId, activeCharacter, scenarios: scenariosForDisplay, messages, isInGame, roomCode, isHost, roomStatus: room?.status || null });
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
            return json({ error: "Missing slot data for update." }, { status: 400 });
        }

        try {
            const slotIndex = parseInt(slotIndexStr, 10);
            let newSlotData: PlayerSlot = JSON.parse(slotDataStr);

            console.log(`[UPDATE SLOT] Updating slot ${slotIndex} in room ${roomCodeForUpdate}:`, newSlotData);

            // Fetch current room and update the specific slot
            const room = await getRoomByCode(roomCodeForUpdate);
            if (!room) {
                return json({ error: "Room not found." }, { status: 404 });
            }

            console.log(`[UPDATE SLOT] Current room slots before update:`, room.setup_slots.map(s => ({ type: s.type, characterId: s.characterId, userId: s.userId })));

            // Verify the user is updating their own slot
            if (newSlotData.userId && newSlotData.userId !== userId) {
                return json({ error: "Cannot update another player's slot." }, { status: 403 });
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
                const { getUserById } = await import("~/services/db.server");
                const user = await getUserById(newSlotData.userId);
                if (user) {
                    newSlotData = {
                        ...newSlotData,
                        username: user.username
                    };
                }
            }

            // Update the setup_slots using the new function
            const { updateSpecificSlot } = await import("~/services/room.server");
            const updatedRoom = await updateSpecificSlot(roomCodeForUpdate, slotIndex, newSlotData);

            if (!updatedRoom) {
                console.error(`[UPDATE SLOT] Failed to update slot in database for room ${roomCodeForUpdate}`);
                return json({ error: "Failed to update slot in database." }, { status: 500 });
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
            return json({ success: false, error: e instanceof Error ? e.message : "Failed to update slot." }, { status: 500 });
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

        if (!activeCharacterStr) {
            return json({ error: "Missing active character data." }, { status: 400 });
        }

        try {
            const activeCharacter: Character = JSON.parse(activeCharacterStr);
            const partyCharacters: Character[] = partyCharactersStr ? JSON.parse(partyCharactersStr) : [activeCharacter];
            const partySlots = partySlotsStr ? JSON.parse(partySlotsStr) : [];

            console.log(`[ACTION] Generating scenarios for party with ${partyCharacters.length} characters`);

            const scenarios = await generateScenariosForCharacter(activeCharacter, durationStr, regenerationPromptStr, partyCharacters, partySlots);
            
            if (!scenarios || scenarios.length === 0) {
                return json({ error: "Failed to generate any scenarios. Please try again." }, { status: 500 });
            }

            // If this is for a room, update room status to scenario_selection and store scenarios
            if (roomCode) {
                const success = await updateRoomStatus(roomCode, 'scenario_selection');
                if (success) {
                    console.log(`[ACTION] Room ${roomCode} status updated to 'scenario_selection'`);
                } else {
                    console.warn(`[ACTION] Failed to update room ${roomCode} status`);
                }
                
                // Store scenarios in the room for non-host users to fetch
                const stored = await storeRoomScenarios(roomCode, scenarios);
                if (stored) {
                    console.log(`[ACTION] Stored ${scenarios.length} scenarios for room ${roomCode}`);
                    // Also clear previous dice rolls when new scenarios are generated
                    await clearRoomDiceRolls(roomCode);
                    console.log(`[ACTION] Cleared dice rolls for room ${roomCode}`);
                } else {
                    console.warn(`[ACTION] Failed to store scenarios for room ${roomCode}`);
                }
            }

            console.log(`[ACTION] Successfully generated ${scenarios.length} scenarios for party`);
            return json({ scenarios });
        } catch (error) {
            console.error("Error generating scenarios:", error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to generate scenarios';
            return json({ error: errorMessage }, { status: 500 });
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
        const scenarioSetId = formData.get('scenarioSetId')?.toString();

        console.log(`[GAME ROUTE] castVote called with:`, {
            scenarioId, slotIndexStr, scenarioSetId, userId
        });

        if (!scenarioId || !slotIndexStr || !scenarioSetId) {
            console.log(`[GAME ROUTE] Missing required data for voting`);
            return json({ error: "Missing required data for voting." }, { status: 400 });
        }

        try {
            const slotIndex = parseInt(slotIndexStr);

            const result = await castVote(scenarioSetId, scenarioId, userId, slotIndex);
            
            console.log(`[GAME ROUTE] castVote result:`, result);
            
            if (result.success) {
                return json({ 
                    success: true, 
                    message: result.message,
                    userVoteCount: result.userVoteCount
                });
            } else {
                return json({ error: result.message }, { status: 400 });
            }
        } catch (error) {
            console.error("Error casting vote:", error);
            return json({ error: "Failed to cast vote." }, { status: 500 });
        }
    }

    if (intent === 'retractVote') {
        const scenarioId = formData.get('scenarioId')?.toString();
        const slotIndexStr = formData.get('slotIndex')?.toString();
        const scenarioSetId = formData.get('scenarioSetId')?.toString();

        if (!scenarioId || !slotIndexStr || !scenarioSetId) {
            return json({ error: "Missing required data for vote retraction." }, { status: 400 });
        }

        try {
            const slotIndex = parseInt(slotIndexStr);

            const result = await retractVote(scenarioSetId, scenarioId, userId, slotIndex);
            
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

    if (intent === 'getVoteStatus') {
        const scenarioSetId = formData.get('scenarioSetId')?.toString();

        if (!scenarioSetId) {
            return json({ error: "Missing required data for vote status." }, { status: 400 });
        }

        try {
            // Properly await the async functions
            const votingStatus = await getUserVotingStatus(scenarioSetId, userId);
            const scenarioStats = await getScenarioVoteStats(scenarioSetId);

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

            // Update room status to active
            const statusUpdated = await updateRoomStatus(roomCode, 'active_game');
            if (statusUpdated) {
                console.log(`[SELECT SCENARIO] Room ${roomCode} status updated to 'active'`);
            } else {
                console.warn(`[SELECT SCENARIO] Failed to update room ${roomCode} status`);
            }

            // Clear scenario votes since we're done with voting
            clearScenarioVotes(roomCode);

            // Clear the generated scenarios since we're starting the game
            const cleared = await clearRoomScenarios(roomCode);
            if (cleared) {
                console.log(`[SELECT SCENARIO] Cleared scenarios for room ${roomCode}`);
            } else {
                console.warn(`[SELECT SCENARIO] Failed to clear scenarios for room ${roomCode}`);
            }

            // Store the selected scenario in cache for the game session
            const stored = await storeScenarios([selectedScenario]);
            if (!stored) {
                console.warn(`[SELECT SCENARIO] Failed to store selected scenario in cache`);
            }

            console.log(`[SELECT SCENARIO] Successfully selected scenario for room ${roomCode}`);
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

    return json({ error: "Invalid intent" }, { status: 400 });
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
    const { party: initialParty, resolvedParty: initialResolvedParty, allRoomCharacters: initialAllRoomCharacters, currentUserId, activeCharacter, scenarios, messages, isInGame, roomCode: initialRoomCode, isHost, roomStatus: initialRoomStatus } = useLoaderData<LoaderData>();
    const navigation = useNavigation();
    const [fetcherKey, setFetcherKey] = useState(0);
    const fetcher = useFetcher<{ data: { characterData: Character } | { error: string }, type: 'success' | 'error' }>({ key: `character-generation-${fetcherKey}` });
    const readinessFetcher = useFetcher<{ success: boolean, error?: string }>(); // New fetcher for readiness updates
    const submit = useSubmit(); // Hook for submitting forms outside of standard navigation

    const [showCreationModal, setShowCreationModal] = useState(false);
    const [creationInitialData, setCreationInitialData] = useState<Partial<Character> | null>(null);
    const [creationSlotIndex, setCreationSlotIndex] = useState<number | undefined>(undefined);
    const [showScenarioSelector, setShowScenarioSelector] = useState(initialRoomStatus === 'scenario_selection');

    // --- Local State Management for Setup ---
    const [currentParty, setCurrentParty] = useState<PlayerSlot[]>(initialParty);
    const [currentResolvedParty, setCurrentResolvedParty] = useState<Character[]>(initialResolvedParty);
    const [currentAllRoomCharacters, setCurrentAllRoomCharacters] = useState<Character[]>(initialAllRoomCharacters);
    const [currentRoomCode, setCurrentRoomCode] = useState<string | null>(initialRoomCode); // <-- NEW STATE
    const [updatingSlots, setUpdatingSlots] = useState<Set<number>>(new Set()); // Track slots being updated
    const [slotHistory, setSlotHistory] = useState<Map<number, PlayerSlot>>(new Map()); // Track previous slot states for rollback
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
            
            setCurrentParty(newSlots);
        });
        
        // Cleanup function
        return () => {
            console.log(`[REALTIME SUBSCRIPTION] Unsubscribing from room ${currentRoomCode}`);
            unsubscribe();
        };
    }, [currentRoomCode, currentUserId]);

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
    // --------------------------------------------------------------------------

    // --- Effect to synchronize slots when room code changes ---
    useEffect(() => {
        if (currentRoomCode && currentParty.length > 0) {
            // With realtime subscription in place, this effect is no longer needed
            // Keeping it as a low-frequency fallback (every 30 seconds) in case realtime fails
            const interval = setInterval(async () => {
                try {
                    console.log(`[FALLBACK SYNCHRONIZATION] Performing fallback sync for room ${currentRoomCode}`);
                    
                    const formData = new FormData();
                    formData.append('intent', 'getRoomData');
                    formData.append('roomCode', currentRoomCode);
                    
                    const response = await fetch('/game', {
                        method: 'POST',
                        body: formData
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
                                setCurrentParty(newSlots);
                            }
                        }
                    }
                } catch (error) {
                    console.error('Failed to synchronize slots:', error);
                }
            }, 30000); // Fallback sync every 30 seconds
            
            return () => clearInterval(interval);
        }
    }, [currentRoomCode, currentParty.length]); // Depend on currentRoomCode and currentParty.length

    // --- New Effect to handle readiness persistence response ---
    useEffect(() => {
        if (readinessFetcher.data) {
            // Find which slot was being updated (we'll need to track this better in the future)
            const updatingSlotIndex = Array.from(updatingSlots)[0]; // Simple approach for now
            
            if (readinessFetcher.data.error) {
                alert(`Slot Update Failed: ${readinessFetcher.data.error}`);
                console.error("Slot persistence failed:", readinessFetcher.data.error);
                
                // Rollback to previous state
                const previousSlot = slotHistory.get(updatingSlotIndex);
                if (previousSlot) {
                    setCurrentParty(prev => {
                        const rolled = [...prev];
                        rolled[updatingSlotIndex] = previousSlot;
                        return rolled;
                    });
                    setSlotHistory(prev => {
                        const updated = new Map(prev);
                        updated.delete(updatingSlotIndex);
                        return updated;
                    });
                }
            } else {
                // Success - remove from updating slots
                if (updatingSlotIndex !== undefined) {
                    setUpdatingSlots(prev => {
                        const newSet = new Set(prev);
                        newSet.delete(updatingSlotIndex);
                        return newSet;
                    });
                }
            }
        }
    }, [readinessFetcher.data, updatingSlots, slotHistory]);
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
    // ----------------------------------------------------------

    // --- Handlers for Local State Updates ---
    const handleSlotChange = (slotIndex: number, newPlayerSlot: PlayerSlot) => {
        console.log(`[SLOT CHANGE] Slot ${slotIndex} changed to:`, newPlayerSlot);
        
        // Store previous state for potential rollback
        const previousSlot = currentParty[slotIndex];
        console.log(`[SLOT CHANGE] Previous slot state:`, previousSlot);
        
        // Mark slot as updating
        setUpdatingSlots(prev => new Set([...prev, slotIndex]));
        
        setCurrentParty(prevParty => {
            const newParty = [...prevParty];
            newParty[slotIndex] = newPlayerSlot;
            return newParty;
        });

        // Persist slot changes to the room if in lobby view
        if (currentRoomCode) {
            console.log(`[SLOT CHANGE] Persisting slot ${slotIndex} to room ${currentRoomCode}`);
            readinessFetcher.submit(
                {
                    intent: 'updateSlot',
                    slotIndex: slotIndex.toString(),
                    slotData: JSON.stringify(newPlayerSlot),
                    roomCode: currentRoomCode,
                },
                { method: 'post', action: '/game' }
            );
        }
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
        // Store previous state for potential rollback
        const previousReady = currentParty[slotIndex]?.isReady;
        console.log(`[TOGGLE READY] Slot ${slotIndex} changing from ${previousReady} to ${isReady}`);
        
        // Mark slot as updating
        setUpdatingSlots(prev => new Set([...prev, slotIndex]));
        
        // 1. Optimistic UI Update: Update local state immediately
        setCurrentParty(prevParty => {
            const newParty = [...prevParty];
            if (newParty[slotIndex]) {
                newParty[slotIndex] = { ...newParty[slotIndex], isReady };
            }
            return newParty;
        });

        // 2. Persist readiness update via fetcher if in a room
        if (currentRoomCode) {
            readinessFetcher.submit(
                {
                    intent: 'updateReadiness',
                    slotIndex: slotIndex.toString(),
                    isReady: isReady.toString(),
                    roomCode: currentRoomCode, // Pass room code for persistence
                },
                { method: 'post', action: '/game' }
            );
        }
        // If not in a room, the local state update is sufficient until 'finalizeSetup'
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

    const handleGenerateRandomCharacter = (e: React.FormEvent) => {
        e.preventDefault();
        console.log('[GAME ROUTE] Generating random character...');
        const defaultClass = DND_5E_CHARACTERS[0]?.class || 'Fighter';
        const defaultRace = DND_5E_CHARACTERS[0]?.race || 'Human';
        const defaultBackground = 'Adventurer';

        fetcher.submit(
            {
                intent: 'generateRandomCharacter',
                class: defaultClass,
                race: defaultRace,
                background: defaultBackground,
                generateFull: 'true'
            },
            { method: 'post', action: '/game' }
        );
    };

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
                return (
                    <>
                        <ScenarioSelector
                            scenarios={scenarios}
                            isLoading={isLoading}
                            activeCharacter={activeCharacter}
                            showCountdown={true}
                            partyCharacters={currentResolvedParty}
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
                            <a
                                href="/rooms"
                                className="py-2 px-4 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded transition duration-300"
                            >
                                Exit to Room Selection
                            </a>
                        )}
                    </div>

                    <div className="mt-10 w-full max-w-6xl">
                        <h2 className="text-3xl font-bold text-red-400 mb-4 text-center">Party Setup</h2>
                        
                        {allActiveSlotsReady && (
                            <div className="mb-6 text-center">
                                <button
                                    onClick={() => {
                                        const formData = new FormData();
                                        formData.append('intent', 'startScenarioSelection');
                                        formData.append('roomCode', currentRoomCode || '');
                                        fetcher.submit(formData, { method: 'post', action: '/game' });
                                    }}
                                    className="py-3 px-8 text-xl font-bold rounded-lg shadow-lg bg-green-600 hover:bg-green-500 text-white transition duration-300"
                                >
                                    Next: Scenario Selection →
                                </button>
                            </div>
                        )}
                        
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
                                    isLobbyView={isLobbyView}
                                    isUpdating={updatingSlots.has(index)} // Pass updating state
                                />
                            ))}
                        </div>
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
                                    isLobbyView={isLobbyView}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Scenario Selector */}
                    <ScenarioSelector
                        scenarios={scenarios}
                        isLoading={isLoading}
                        activeCharacter={activeCharacter}
                        partyCharacters={currentResolvedParty}
                        partySlots={currentParty}
                        currentUserId={currentUserId}
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
