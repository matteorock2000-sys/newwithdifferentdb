import { json, LoaderFunction, ActionFunction } from "@remix-run/node";
import { useLoaderData, useFetcher, Form, Link, useNavigate } from "@remix-run/react";
import { useState, useEffect, useMemo } from "react";
import { requireUser } from "~/services/auth.server";
import { getCharactersForUser, getTemporaryPartySetup, getAndClearTemporaryPartySetup, clearTemporaryPartySetup, db } from "~/services/db.server";
import { getSession, commitSession, cleanupSession } from "~/sessions";
import type { Character, User, PlayerSlot, Room } from "~/types";
import PlayerSetupSlot from "~/components/PlayerSetupSlot";
import { handleRoomAction, getAllActiveRooms } from "~/services/roomCore.server";
import { useGlobalToast } from "~/utils/toast";
import { showToast } from "~/utils/toast";
import { logger } from "~/utils/logger";
import { debounce } from "~/utils/debounce";

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
  
  // First, check if user is already in any active rooms
  const userInRoom = activeRooms.find(room => 
    room.participants.some(p => p.userId === user.id)
  );
  
  if (userInRoom) {
    // User is already in a room, use the room's setup_slots
    logger.debug('User is already in room, using room setup', { 
      userId: user.id,
      roomId: userInRoom.id,
      roomSetup: userInRoom.setup_slots
    });
    
    if (userInRoom.setup_slots && Array.isArray(userInRoom.setup_slots)) {
      initialPartySlots = userInRoom.setup_slots.map(slot => {
        if (slot.characterId && slot.type !== 'None') {
          return {
            ...slot,
            characterName: characterMap[slot.characterId] || slot.characterName,
          };
        }
        return slot;
      });
      
      // Log characters in the room
      const characterNames = initialPartySlots
        .filter(slot => slot.type !== 'None' && slot.characterName)
        .map(slot => slot.characterName);
        
      if (characterNames.length > 0) {
        logger.debug('Characters in room', { characterNames });
      }
    }
  } else {
    // User is not in any room, check for temporary party setup
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
              logger.debug('Found valid party setup in DB. Using it as initial slots', { 
                partyData: userPartyData
              });
              
              // NEW LOGGING: List character names
              const characterNames = initialPartySlots
                  .filter(slot => slot.type !== 'None' && slot.characterName)
                  .map(slot => slot.characterName);
                  
              if (characterNames.length > 0) {
                  logger.debug('Characters in party', { characterNames });
              }
          }
          // END NEW LOGGING

      } else {
          logger.debug('Found party data in DB but format is invalid. Using default slots', { 
            partyData: userPartyData
          });
      }
    }
  }

  // --- END: Database-based Party Setup Retrieval ---

  // --- START: Fetch Host Usernames ---
  // --- START: Fetch Host Usernames ---
  const hostIds = [...new Set(activeRooms.map(room => room.host_id))].filter((id): id is string => !!id);
  
  const { data: usersData, error: usersError } = await db
    .from('users')
    .select('id, username')
    .in('id', hostIds);

  if (usersError) {
    logger.error('Error fetching host usernames', { error: usersError });
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
      "Set-Cookie": await commitSession(cleanupSession(session)),
    },
  });
};

export const action: ActionFunction = async ({ request }) => {
    const user = await requireUser(request);
    try {
        logger.debug('User attempting room action', { 
          userId: user.id.substring(0, 8)
        });
        // Delegate room creation/joining logic to room.server.ts
        const result = await handleRoomAction(request, { userId: user.id });
        logger.debug('Room action completed', { 
          userId: user.id.substring(0, 8),
          resultStatus: result.status,
          resultHeaders: Object.fromEntries(result.headers.entries())
        });
        return result;
    } catch (error) {
        // CRITICAL FIX: If the error is a Response object (which happens during a redirect), re-throw it.
        if (error instanceof Response) {
            logger.debug('Redirect caught for user', { 
              userId: user.id.substring(0, 8),
              status: error.status,
              statusText: error.statusText,
              location: error.headers.get('Location')
            });
            // Log the full response to see what's happening
            logger.debug('Full redirect response', { error });
            // Ensure the redirect is properly handled
            throw error;
        }
        logger.error('Room action failed', { error });
        const errorMessage = error instanceof Error ? error.message : 'Failed to process room action';
        // Return error message in JSON response for fetcher to catch
        return json({ error: errorMessage }, { status: 400 });
    }
};

export default function RoomsRoute() {
  const loaderData = useLoaderData<LoaderData>();
  const fetcher = useFetcher<LoaderData>();
  const { showToast } = useGlobalToast();
const { user, characters, initialPartySlots }  = loaderData;

  useEffect(() => {
    if (loaderData.error) {
      showToast(loaderData.error, "error");
    }
  }, [loaderData.error, showToast]);

  // Handle fetcher response for room creation/joining
  useEffect(() => {
    if (fetcher.data && fetcher.state === 'idle') {
      // Check if the response is a success with redirect URL
      if (fetcher.data && typeof fetcher.data === 'object' && 'success' in fetcher.data) {
        const response = fetcher.data as any;
        if (response.success && response.redirectUrl) {
          // Navigate to the game page
          window.location.href = response.redirectUrl;
          return;
        }
      }
      
      // Check if the response is an error object (from createApiErrorResponse)
      if (fetcher.data && typeof fetcher.data === 'object' && 'error' in fetcher.data && typeof fetcher.data.error === 'object') {
        const errorResponse = fetcher.data.error as any;
        if (errorResponse.userMessage) {
          showToast(errorResponse.userMessage, 'error');
        } else if (errorResponse.message) {
          showToast(`Error: ${errorResponse.message}`, 'error');
        } else {
          showToast('An unknown error occurred.', 'error');
        }
      } else if (fetcher.data && typeof fetcher.data === 'object' && 'error' in fetcher.data && typeof fetcher.data.error === 'string') {
         // Fallback for simple string errors (like the party size error)
         showToast(`Error: ${fetcher.data.error}`, 'error');
      }
    }
  }, [fetcher.data, fetcher.state, showToast]);
  // Use state for dynamic data (polling targets)
  const [activeRooms, setActiveRooms] = useState(loaderData.activeRooms);
  const [hostUsernames, setHostUsernames] = useState(loaderData.hostUsernames);
  
  // Local state for form management
  const [roomName, setRoomName] = useState(`${user?.username || 'Guest'}'s Adventure`);
  const [partySlots, setPartySlots] = useState<PlayerSlot[]>(initialPartySlots);
  const [joinCode, setJoinCode] = useState('');
  const navigate = useNavigate();

  // Polling effect: Refetch loader data every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
        // Only load if the fetcher is idle and not currently submitting a form
        if (fetcher.state === 'idle' && fetcher.formMethod === undefined) {
            fetcher.load('/rooms');
        }
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(interval);
  }, [fetcher]);

  // Update state when fetcher data arrives
  useEffect(() => {
    if (fetcher.data) {
        if (fetcher.data.activeRooms) {
            setActiveRooms(fetcher.data.activeRooms);
            // NEW CLIENT LOGGING: Log received active rooms data
            logger.debug('Active Rooms Data received', {
              activeRooms: fetcher.data.activeRooms.map(r => ({
                name: r.name,
                code: r.code,
                activeSlotsCount: r.activeSlotsCount,
                participantsCount: r.participants.length
              }))
            });
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




  const handleSlotChange = (slotIndex: number, newPlayerSlot: PlayerSlot) => {
    setPartySlots(prevSlots => {
      const newSlots = [...prevSlots];
      newSlots[slotIndex] = newPlayerSlot;
      return newSlots;
    });
  };

  // Debounced version of handleSlotChange for server persistence
  const debouncedHandleSlotChange = useMemo(
    () => debounce(async (slotIndex: number, newPlayerSlot: PlayerSlot) => {
      // Server persistence would happen here
      // For now, this is just a placeholder for future API calls
      logger.debug('Debounced slot change persisted', { slotIndex, newPlayerSlot });
    }, 300),
    []
  );

  // Cleanup debounced function on unmount
  useEffect(() => {
    return () => {
      debouncedHandleSlotChange.cancel?.();
    };
  }, [debouncedHandleSlotChange]);

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
    showToast("Character editing is managed on the Dashboard. Redirecting...", 'info');
    navigate('/');
  };

  const handleDeleteCharacter = () => {
    // Deleting characters should also be managed on the dashboard.
    showToast("Character deletion is managed on the Dashboard.", 'info');
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
  
  const isCreating = fetcher.state === 'submitting' && fetcher.formData?.get('intent') === 'createRoom';

  const handleRoomFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!canCreateRoom) {
        e.preventDefault();
        // Updated message for flexible slot selection
        showToast("Please ensure at least one Human character is selected and ready, and all active slots (Human/AI) are marked as Ready.", "error");
        return;
    }
    
    // Show immediate feedback to user
    showToast("Creating room...", "info");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 text-white">
      
      {/* Header Section */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link 
              to="/" 
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-gray-700 hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition duration-150 ease-in-out"
            >
              ← Back to Main Menu
            </Link>
            <div className="hidden md:block text-2xl text-gray-400">|</div>
            <div className="text-sm text-gray-400">Active Lobbies: {activeRooms.length}</div>
          </div>
          
          <div className="text-center flex-1">
            <h1 className="text-4xl md:text-5xl font-medieval text-red-500">Room Selection</h1>
            <p className="text-gray-400 mt-2">Assemble your party and choose your adventure</p>
          </div>
          
          <div className="w-24"></div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pb-8">
        <div className="grid grid-cols-1 gap-8">
          
          {/* Active Rooms List */}
          <div className="space-y-6">
            <div className="bg-gray-800/80 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-gray-700">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-medieval text-red-400">Active Lobbies</h2>
                <div className="flex items-center space-x-3">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                  <span className="text-sm text-gray-400">{activeRooms.length} available</span>
                </div>
              </div>
              
              {activeRooms.length === 0 ? (
                <div className="text-center py-8">
                  <div className="text-6xl mb-4">🏰</div>
                  <p className="text-gray-400 text-lg">No active rooms found. Be the first to create one!</p>
                </div>
              ) : (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {activeRooms.map(room => (
                    <div key={room.id} className="bg-gray-700/60 rounded-xl p-4 border border-gray-600 hover:border-gray-500 transition-all duration-200">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-2">
                            <h3 className="font-bold text-xl text-white">{room.name}</h3>
                            <span className="px-2 py-1 bg-gray-600 text-gray-200 text-xs rounded-full">Room Code: {room.code}</span>
                          </div>
                          <div className="flex items-center space-x-4 text-sm text-gray-400">
                            <span>Host: {hostUsernames?.[room.host_id] || room.host_id}</span>
                            <span>•</span>
                            <span>Players: {room.participants.length}/{room.maxPlayers}</span>
                            <span>•</span>
                            <span>Status: {room.status}</span>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <div className="text-right text-sm text-gray-400">
                            <div>Available Slots</div>
                            <div className="font-bold text-white">{room.maxPlayers - room.participants.length}</div>
                          </div>
                          <Form method="post" onSubmit={(e) => {
                              if (!canCreateRoom) {
                                  e.preventDefault();
                                  showToast("Please ensure at least one Human character is selected and ready, and all active slots (Human/AI) are marked as Ready.", "error");
                                  return;
                              }
                              showToast("Joining room...", "info");
                              // Use fetcher to submit the form
                              fetcher.submit(e.currentTarget);
                            }} className="ml-2">
                            <input type="hidden" name="intent" value="joinRoom" />
                            <input type="hidden" name="roomCode" value={room.code} />
                            <input type="hidden" name="roomSlots" value={JSON.stringify(partySlots)} />
                            <input type="hidden" name="username" value={user.username} />
                            <button
                              type="submit"
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition duration-200"
                            >
                              Join
                            </button>
                          </Form>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Party Configuration - Now below Active Lobbies */}
          <div className="space-y-6">
            
            {/* Party Configuration */}
            <div className="bg-gray-800/80 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-red-700/50">
              <h2 className="text-xl font-medieval text-red-400 mb-3">Party Configuration</h2>
              <p className="text-gray-400 text-sm mb-3">Select your characters and get ready for adventure</p>
              
              {/* Party Slots - Updated layout for better character card display */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch mb-6">
                {partySlots.map((slot, index) => (
                  <div key={index} className="bg-gray-700/60 rounded-xl p-4 border border-gray-600 hover:border-gray-500 transition-all duration-200">
                    <PlayerSetupSlot
                slotIndex={index}
                playerSlot={slot}
                viewMode="rooms" 
                      allCharacters={characters}
                      allSlots={partySlots}
                      onSlotChange={handleSlotChange}
                      onEditCharacter={handleEditCharacter}
                      onDeleteCharacter={handleDeleteCharacter}
                      onToggleReady={handleToggleReady}
                      showManagementButtons={false}
                      currentUserId={user.id}
                      currentUsername={user.username} // Added this line
                      maxPlayers={4}
                      roomStatus="lobby"
                      isLobbyView={true}
                    />
                  </div>
                ))}
              </div>

              {/* Party Status */}
              <div className="bg-gray-700/40 rounded-lg p-2 border border-gray-600">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-400">Active Characters:</span>
                  <span className="font-bold text-white">{activeSlots.length}/4</span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-gray-400">Ready:</span>
                  <span className={`font-bold ${allActiveSlotsReady ? 'text-green-400' : 'text-gray-400'}`}>
                    {activeSlots.filter(slot => slot.isReady).length}/{activeSlots.length}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm mt-2">
                  <span className="text-gray-400">Host Ready:</span>
                  <span className={`font-bold ${hostCharacterReady ? 'text-green-400' : 'text-gray-400'}`}>
                    {hostCharacterReady ? 'Yes' : 'No'}
                  </span>
                </div>
              </div>
            </div>

            {/* Room Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* Create Room */}
              <div className="bg-gray-800/80 backdrop-blur-sm p-4 rounded-2xl shadow-2xl border border-green-700/50">
                <h2 className="text-xl font-medieval text-green-400 mb-3">Create New Room</h2>
                
                <Form method="post" onSubmit={(e) => {
                    if (!canCreateRoom) {
                        e.preventDefault();
                        showToast("Please ensure at least one Human character is selected and ready, and all active slots (Human/AI) are marked as Ready.", "error");
                        return;
                    }
                    showToast("Creating room...", "info");
                    // Use fetcher to submit the form
                    fetcher.submit(e.currentTarget);
                  }} className="space-y-4">
                  <input type="hidden" name="intent" value="createRoom" />
                  <input type="hidden" name="roomSlots" value={JSON.stringify(partySlots)} />
                  <input type="hidden" name="username" value={user.username} />

                  <div>
                    <label htmlFor="roomName" className="block text-gray-300 mb-2">Room Name:</label>
                    <input
                      id="roomName"
                      name="roomName"
                      type="text"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition duration-200"
                      required
                    />
                  </div>
                  
                  <div className="pt-4">
                    <button
                      type="submit"
                      disabled={!canCreateRoom || isCreating}
                      className={`w-full py-2 px-3 rounded-lg text-base font-bold transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98]
                        ${canCreateRoom && !isCreating
                          ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white shadow-lg hover:shadow-xl'
                          : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                      {isCreating ? (
                        <div className="flex items-center justify-center space-x-3">
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Creating Room...</span>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center space-x-3">
                          <span>🚀 Create Room & Enter Lobby</span>
                        </div>
                      )}
                    </button>
                  </div>
                </Form>
              </div>

              {/* Join Room */}
              <div className="bg-gray-800/80 backdrop-blur-sm p-4 rounded-2xl shadow-2xl border border-blue-700/50">
                <h2 className="text-xl font-medieval text-blue-400 mb-3">Join Existing Room</h2>
                <p className="text-gray-400 text-sm mb-3">Enter a room code to join an existing adventure</p>

                <Form method="post" onSubmit={(e) => {
                    if (!canCreateRoom) {
                        e.preventDefault();
                        showToast("Please ensure at least one Human character is selected and ready, and all active slots (Human/AI) are marked as Ready.", "error");
                        return;
                    }
                    showToast("Joining room...", "info");
                    // Use fetcher to submit the form
                    fetcher.submit(e.currentTarget);
                  }} className="space-y-4">
                  <input type="hidden" name="intent" value="joinRoom" />
                  <input type="hidden" name="roomSlots" value={JSON.stringify(partySlots)} />
                  <input type="hidden" name="username" value={user.username} /> 
                  
                  <div>
                    <label htmlFor="joinCode" className="block text-gray-300 mb-2">Room Code:</label>
                    <input
                      id="joinCode"
                      name="roomCode"
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      className="w-full p-2 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 uppercase tracking-widest text-center text-2xl font-bold transition duration-200"
                      maxLength={6}
                      required
                      placeholder="ABC123"
                    />
                  </div>
                  
                  <button
                    type="submit"
                    className="w-full py-2 px-3 rounded-lg text-base font-bold bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] shadow-lg hover:shadow-xl"
                  >
                    🔓 Join Room
                  </button>
                </Form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}