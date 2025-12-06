import { json, LoaderFunction, ActionFunction, redirect } from "@remix-run/node";
import { useLoaderData, useFetcher, Form, Link, useNavigate } from "@remix-run/react";
import { useState, useEffect } from "react";
import { requireUser } from "~/services/auth.server";
import { getCharactersForUser, getAndClearTemporaryPartySetup } from "~/services/db.server";
import { getSession, commitSession } from "~/sessions";
import type { Character, User, PlayerSlot } from "~/types";
import PlayerSetupSlot from "~/components/PlayerSetupSlot";
import { handleRoomAction, getAllActiveRooms } from "~/services/room.server";
import type { Room } from "~/types";
import { useGlobalToast } from "~/utils/toast";
import { db } from "~/services/db.server"; // Import db for fetching usernames

interface LoaderData {
  user: User;
  characters: Character[];
  initialPartySlots: PlayerSlot[];
  activeRooms: Room[];
  hostUsernames: Record<string, string>; // Added for host display
  error?: string;
}

const DEFAULT_SLOTS: PlayerSlot[] = [
    { type: 'None', characterId: null, isReady: false },
    { type: 'None', characterId: null, isReady: false },
    { type: 'None', characterId: null, isReady: false },
    { type: 'None', characterId: null, isReady: false },
];

export const loader: LoaderFunction = async ({ request }) => {
  const user = await requireUser(request);
  const session = await getSession(request.headers.get("Cookie"));
  const characters = await getCharactersForUser(user.id);
  const activeRooms = await getAllActiveRooms();
  
  // Create a map for quick character name lookup
  const characterMap = characters.reduce((acc, char) => {
    if (char) acc[char.id] = char.name;
    return acc;
  }, {} as Record<string, string>);
  
  // --- START: Database-based Party Setup Retrieval ---
  let initialPartySlots: PlayerSlot[] = DEFAULT_SLOTS;
  
  // Attempt to retrieve temporary party setup from the database
  const temporaryParty = await getAndClearTemporaryPartySetup(user.id);
  const userPartyData = temporaryParty || [];
  
  if (temporaryParty && Array.isArray(temporaryParty) && temporaryParty.length === 4) {
    // Basic structural check
    const isValidParty = temporaryParty.every(slot => 
        typeof slot === 'object' && slot !== null && 
        ('type' in slot) && ('characterId' in slot) && ('isReady' in slot)
    );

    if (isValidParty) {
        // Populate characterName for display/logging if missing
        initialPartySlots = (temporaryParty as PlayerSlot[]).map(slot => {
            if (slot.characterId && slot.type !== 'None') {
                return {
                    ...slot,
                    characterName: characterMap[slot.characterId] || slot.characterName,
                };
            }
            return slot;
        });
        
        // Only log when party setup is actually found and used
        if (userPartyData.length > 0) {
            console.log("[ROOMS LOADER] Found valid party setup in DB. Using it as initial slots.");
            
            // NEW LOGGING: List character names
            const characterNames = initialPartySlots
                .filter(slot => slot.type !== 'None' && slot.characterName)
                .map(slot => slot.characterName);
                
            if (characterNames.length > 0) {
                console.log(`[ROOMS LOADER] Characters in party: ${characterNames.join(', ')}`);
            }
        }
        // END NEW LOGGING

    } else {
        console.log("[ROOMS LOADER] Found party data in DB but format is invalid. Using default slots.");
    }
  } else {
    // Only log this once per user session, not on every poll
    if (!session.get("hasSeenDefaultSlots")) {
        console.log("[ROOMS LOADER] No temporary party setup found in DB. Using default slots.");
        session.set("hasSeenDefaultSlots", true);
    }
  }

  // --- END: Database-based Party Setup Retrieval ---

  // --- START: Fetch Host Usernames ---
  const hostIds = [...new Set(activeRooms.map(room => room.host_id))];
  
  const { data: usersData, error: usersError } = await db
    .from('users')
    .select('id, username')
    .in('id', hostIds);

  if (usersError) {
    console.error("Error fetching host usernames:", usersError);
  }

  const hostUsernames: Record<string, string> = (usersData || []).reduce((acc, u) => {
    acc[u.id] = u.username;
    return acc;
  }, {} as Record<string, string>);
  // --- END: Fetch Host Usernames ---


  const error = session.get("error");

  return json<LoaderData>({
    user,
    characters: characters.filter((c): c is Character => c !== null),
    initialPartySlots,
    activeRooms,
    hostUsernames,
    error
  }, {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
};

export const action: ActionFunction = async ({ request }) => {
    const user = await requireUser(request);
    try {
        console.log(`[ROOMS ACTION] User ${user.id.substring(0, 8)} attempting room action...`);
        // Delegate room creation/joining logic to room.server.ts
        const result = await handleRoomAction(request, { userId: user.id });
        console.log(`[ROOMS ACTION] Room action completed for user ${user.id.substring(0, 8)}, result:`, result);
        return result;
    } catch (error) {
        // CRITICAL FIX: If the error is a Response object (which happens during a redirect), re-throw it.
        if (error instanceof Response) {
            console.log(`[ROOMS ACTION] Redirect caught for user ${user.id.substring(0, 8)}: ${error.status} ${error.statusText}`);
            console.log(`[ROOMS ACTION] Redirect location:`, error.headers.get('Location'));
            // Log the full response to see what's happening
            console.log(`[ROOMS ACTION] Full redirect response:`, error);
            // Ensure the redirect is properly handled
            throw error;
        }
        console.error("Room action failed:", error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to process room action';
        // Return error message in JSON response for fetcher to catch
        return json({ error: errorMessage }, { status: 400 });
    }
};

export default function RoomsRoute() {
  const loaderData = useLoaderData<LoaderData>();
  const fetcher = useFetcher<LoaderData>();
  const { error: showToastError } = useGlobalToast();
  const { user, characters, initialPartySlots } = loaderData;

  useEffect(() => {
    if (loaderData.error) {
      showToastError(loaderData.error);
    }
  }, [loaderData.error, showToastError]);
  // Use state for dynamic data (polling targets)
  const [activeRooms, setActiveRooms] = useState(loaderData.activeRooms);
  const [hostUsernames, setHostUsernames] = useState(loaderData.hostUsernames);
  
  // Local state for form management
  const [roomName, setRoomName] = useState(`${user?.username || 'Guest'}'s Adventure`);
  const [partySlots, setPartySlots] = useState<PlayerSlot[]>(initialPartySlots);
  const [joinCode, setJoinCode] = useState('');
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const navigate = useNavigate();

  // Polling effect: Refetch loader data every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
        // Only load if the fetcher is idle and not currently submitting a form
        if (fetcher.state === 'idle' && fetcher.formMethod === undefined) {
            fetcher.load('/rooms');
        }
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [fetcher]);

  // Update state when fetcher data arrives
  useEffect(() => {
    if (fetcher.data) {
        if (fetcher.data.activeRooms) {
            setActiveRooms(fetcher.data.activeRooms);
            // NEW CLIENT LOGGING: Log received active rooms data
            console.log("[CLIENT ROOMS FETCHED] Active Rooms Data:", fetcher.data.activeRooms.map(r => ({
                name: r.name,
                code: r.code,
                activeSlotsCount: r.activeSlotsCount,
                participantsCount: r.participants.length
            })));
        }
        if (fetcher.data.hostUsernames) {
            setHostUsernames(fetcher.data.hostUsernames);
        }
    }
  }, [fetcher.data]);
  
  // Sync local state when loader data changes (e.g., after a redirect/reload or action submission)
  // CRITICAL FIX: Removed initialPartySlots sync to prevent hydration mismatch caused by immediate post-hydration state update.
  useEffect(() => {
    setActiveRooms(loaderData.activeRooms);
    setHostUsernames(loaderData.hostUsernames);
  }, [loaderData.activeRooms, loaderData.hostUsernames]);

  // Handle action errors (e.g., join validation failure)
  useEffect(() => {
    if (fetcher.data && 'error' in fetcher.data && typeof fetcher.data.error === 'string') {
        const errorMessage = fetcher.data.error;
        
        // Check for the specific party size error
        if (errorMessage.startsWith("not enough slots for this party:")) {
            alert(`Join Failed: ${errorMessage}`);
        } else {
            // Handle other errors (Room not found, must select character, etc.)
            alert(`Error: ${errorMessage}`);
        }
    }
  }, [fetcher.data]);


  const handleSlotChange = (slotIndex: number, newPlayerSlot: PlayerSlot) => {
    setPartySlots(prevSlots => {
      const newSlots = [...prevSlots];
      newSlots[slotIndex] = newPlayerSlot;
      return newSlots;
    });
  };

  // Readiness toggle handler (local state update only, persistence happens on room creation)
  const handleToggleReady = (slotIndex: number, isReady: boolean) => {
    setPartySlots(prevSlots => {
        const newSlots = [...prevSlots];
        if (newSlots[slotIndex]) {
            newSlots[slotIndex] = { ...newSlots[slotIndex], isReady };
        }
        return newSlots;
    });
  };

  const handleEditCharacter = () => {
    // Editing characters should redirect back to the dashboard or open a modal here.
    // For simplicity, we'll redirect to the dashboard for character management.
    alert("Character editing is managed on the Dashboard. Redirecting...");
    navigate('/');
  };

  const handleCreateRoom = async (roomName: string, partySlots: PlayerSlot[]) => {
    setIsCreatingRoom(true);
    try {
      // Existing room creation logic
      const formData = new FormData();
      formData.append('intent', 'create');
      formData.append('roomName', roomName);
      formData.append('roomSlots', JSON.stringify(partySlots));
      
      fetcher.submit(formData, { method: 'post', action: '/rooms' });
    } catch (error) {
      console.error('Error creating room:', error);
      setIsCreatingRoom(false);
    }
  };

  const handleDeleteCharacter = (characterId: string) => {
    // Deleting characters should also be managed on the dashboard.
    alert("Character deletion is managed on the Dashboard.");
  };

  // --- UPDATED VALIDATION LOGIC for flexible hosting ---
  const activeSlots = partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI');
  
  // 1. Must have at least one active slot (Human or AI)
  const hasActiveSlots = activeSlots.length > 0;
  
  // 2. All active slots must be ready
  const allActiveSlotsReady = hasActiveSlots && activeSlots.every(slot => slot.isReady);
  
  // 3. At least one Human slot must be ready (to designate the host)
  const hostCharacterReady = partySlots.some(slot => slot.type === 'Human' && slot.isReady && slot.characterId !== null);
  
  // Room can be created if all conditions met
  const canCreateRoom = allActiveSlotsReady && hostCharacterReady;
  
  const isCreating = fetcher.state === 'submitting' && fetcher.formData?.get('intent') === 'create';

  const handleRoomFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!canCreateRoom) {
        e.preventDefault();
        // Updated message for flexible slot selection
        alert("Please ensure at least one Human character is selected and ready, and all active slots (Human/AI) are marked as Ready.");
        return;
    }
    // The form submission handles the rest via the action function
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 lg:p-8">
      
      {/* Back to Main Menu Button */}
      <div className="max-w-4xl mx-auto mb-6">
        <Link 
          to="/" 
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-600 hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition duration-150 ease-in-out"
        >
          &larr; Back to Main Menu
        </Link>
      </div>

      <h1 className="text-6xl font-medieval text-red-500 text-center mb-12">Room Selection</h1>

      <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Room Creation Panel */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-red-700">
          <h2 className="text-3xl font-medieval text-red-400 mb-6">Create New Room</h2>
          
          <Form method="post" onSubmit={handleRoomFormSubmit} className="space-y-4">
            <input type="hidden" name="intent" value="create" />
            <input type="hidden" name="roomSlots" value={JSON.stringify(partySlots)} />

            <div>
              <label htmlFor="roomName" className="block text-gray-300 mb-2">Room Name:</label>
              <input
                id="roomName"
                name="roomName"
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 focus:border-red-500"
                required
              />
            </div>

            <h3 className="text-xl font-bold text-gray-300 mt-6 mb-4">Party Configuration (Host Setup)</h3>
            <div className="grid grid-cols-2 gap-4">
                {partySlots.map((slot, index) => (
                    <PlayerSetupSlot 
                        key={index}
                        slotIndex={index} 
                        playerSlot={slot} 
                        allCharacters={characters}
                        allSlots={partySlots}
                        onSlotChange={handleSlotChange}
                        onEditCharacter={handleEditCharacter} // Redirects to dashboard
                        onDeleteCharacter={handleDeleteCharacter} // Alerts user
                        onToggleReady={handleToggleReady} // Local state update
                        showManagementButtons={false} // <-- CRITICAL: Hide Edit/Delete in Room Setup
                        currentUserId={user.id} // <-- Pass currentUserId for ownership detection
                    />
                ))}
            </div>
            
            <div className="pt-4">
              <button
                type="submit"
                disabled={!canCreateRoom || isCreating}
                className={`w-full py-3 px-4 rounded-lg text-xl font-bold transition duration-300
                  ${canCreateRoom && !isCreating
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
              >
                {isCreating ? 'Creating Room...' : 'Create Room & Enter Lobby'}
              </button>
            </div>
          </Form>
          
          <div className="text-center my-4 text-gray-400">OR</div>

          <Form method="post" className="space-y-4">
            <input type="hidden" name="intent" value="join" />
            {/* Pass the current party setup for joining */}
            <input type="hidden" name="roomSlots" value={JSON.stringify(partySlots)} /> 
            
            <div>
              <label htmlFor="joinCode" className="block text-gray-300 mb-2">Join By Code:</label>
              <input
                id="joinCode"
                name="roomCode"
                type="text"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full p-3 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 uppercase tracking-widest text-center"
                maxLength={6}
                required
              />
            </div>
            {/* REMOVED: Join Character selection, as the partySlots hidden input handles the character selection */}
            <button
              type="submit"
              className="w-full py-3 px-4 rounded-lg text-xl font-bold bg-blue-600 hover:bg-blue-500 text-white transition duration-300"
            >
              Join Room
            </button>
          </Form>
        </div>

        {/* Active Rooms List */}
        <div className="bg-gray-800 p-6 rounded-xl shadow-2xl border border-gray-600">
          <h2 className="text-3xl font-medieval text-red-400 mb-6">Active Lobbies ({activeRooms.length})</h2>
          {activeRooms.length === 0 ? (
            <p className="text-gray-400">No active rooms found. Be the first to create one!</p>
          ) : (
            <ul className="space-y-3">
              {activeRooms.map(room => (
                <li key={room.id} className="bg-gray-700 p-3 rounded flex justify-between items-center">
                  <div>
                    <p className="font-bold text-lg text-white">{room.name}</p>
                    {/* Display host username instead of ID, and remove code display */}
                    {/* FIX: Use optional chaining to prevent TypeError if hostUsernames is undefined during hydration */}
                    <p className="text-sm text-gray-400">Host: {hostUsernames?.[room.host_id] || room.host_id}</p>
                    {/* NEW: Display active slots count */}
                    <p className="text-sm text-gray-400 mt-1">Active Slots: {room.activeSlotsCount}/{room.maxPlayers}</p>
                  </div>
                  {/* Join button here (requires character selection logic, omitted for now) */}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
