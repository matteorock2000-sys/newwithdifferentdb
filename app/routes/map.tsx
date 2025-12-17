import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation, useNavigate } from "@remix-run/react";
import { getSession, commitSession } from "~/sessions";
import type { AdventureScenario, Character, PlayerSlot } from "~/types";
import { generateMapImage } from "~/services/gemini.server";
import { getAllCharacters } from "~/services/characterCache.server";
import { requireUserId } from "~/services/auth.server";
import { setMapImage, getMapImage, deleteMapImage } from "~/services/mapCache.server";
import { getRoomByCode, updateRoomStatus } from "~/services/room.server";
import { DND_5E_CHARACTERS } from "~/data/dnd";
import CharacterDisplayCard from "~/components/CharacterDisplayCard";
import PlayerSlots from "~/components/PlayerSlots";
import { logger } from "~/utils/logger";
import { showToast } from "~/utils/toast";
import { cleanupSession } from "~/utils/sessionCleanup";

export const meta: MetaFunction = () => [{ title: "Map Generation" }];

interface LoaderData {
  mode: 'map_generation';
  roomCode?: string;
  roomName?: string;
  participantsCount?: number;
  maxPlayers?: number;
  currentUserId?: string;
  isHost?: boolean;
  party?: { slot: PlayerSlot; character: Character | null }[];
  scenario?: AdventureScenario;
  mapImageBase64?: string | null;
  diceResults?: Record<number, number>;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const session = await getSession(request.headers.get("Cookie"));
  const url = new URL(request.url);
  const roomCode = url.searchParams.get("roomCode");

  logger.debug('Loader started - accessing map generation', { 
    roomCode,
    userId: userId?.substring(0, 8)
  });

  if (!roomCode) {
    logger.debug('No room code provided, redirecting to rooms');
    return redirect("/rooms");
  }

  const room = await getRoomByCode(roomCode);
  
  if (!room) {
    logger.warn('Room not found for code, redirecting to rooms', { roomCode });
    return redirect("/rooms");
  }

  logger.debug('Room fetched', {
    id: room.id,
    name: room.name,
    status: room.status,
    scenario_winner_id: room.scenario_winner_id,
    scenarios_count: room.scenarios?.length || 0
  });

  // Ensure room is in scenario-selected status (after host clicked "Next: Map Generation")
  if (room.status !== 'scenario-selected') {
    if (room.status === 'lobby') {
      return redirect(`/game?roomCode=${roomCode}`);
    } else if (room.status === 'scenario_selection') {
      return redirect(`/game?roomCode=${roomCode}`);
    } else if (room.status === 'active' || room.status === 'active_game') {
      return redirect(`/world-map?roomCode=${roomCode}`);
    } else if (room.status === 'finished') {
      return redirect(`/game?roomCode=${roomCode}`);
    }
  }

  // Check if current user is the host
  const isHost = room.owner_id === userId || room.host_id === userId;

  // Get the selected scenario from the room
  logger.debug('Room status and scenarios', { 
    roomStatus: room.status,
    scenarioWinnerId: room.scenario_winner_id,
    scenariosCount: room.scenarios?.length || 0,
    scenarios: room.scenarios?.map(s => ({ id: s.id, title: s.title }))
  });
  
  const scenario = room.scenarios?.find(s => s.id === room.scenario_winner_id);

  if (!scenario) {
    logger.warn('Scenario not found, redirecting back to scenario selection', { roomCode });
    return redirect(`/game?roomCode=${roomCode}`);
  }

  // Get all characters for display
  const resolvedParty: Character[] = (await getAllCharacters(userId)).filter((c): c is Character => c !== null);
  const allRoomCharacters = resolvedParty;

  // Get party slots from room
  const participantIds = room.participants.map(p => p.userId);
  const characterIds = room.setup_slots.map(s => s.characterId).filter((id): id is string => !!id);

  // Batch fetch usernames and characters
  const userPromises = participantIds.map(id => getUserById(id));
  const users = await Promise.all(userPromises);

  const userMap = new Map(users.filter((u): u is User => !!u).map(u => [u.id, u.username]));
  const participantMap = new Map(room.participants.map(p => [p.characterId, p.userId]));
  const characterMap = new Map(allRoomCharacters.map(c => [c.id, c]));

  // Use the saved slots from the room, preserving character selection and readiness, and enriching with user data
  const party = room.setup_slots.map(slot => {
    if (slot.characterId) {
      const slotUserId = participantMap.get(slot.characterId);
      const character = characterMap.get(slot.characterId);
      if (slotUserId && character) {
        const username = userMap.get(slotUserId);
        return { 
          slot: {
            ...slot, 
            userId: slotUserId, 
            username,
            characterName: character.name
          },
          character
        };
      }
    }
    return { slot, character: null };
  });

  // Get map image from cache
  const mapImageBase64 = await getMapImage(roomCode);

  // Get dice results from session if available
  const diceResults = session.get("diceResults");

  logger.debug('Successfully loaded map generation page', { 
    roomCode,
    scenarioTitle: scenario.title,
    mapImageExists: !!mapImageBase64,
    partySize: party.length
  });

  return json({
    mode: 'map_generation' as const,
    roomCode,
    roomName: room.name,
    participantsCount: room.participants.length,
    maxPlayers: room.setup_slots.length,
    currentUserId: userId,
    isHost,
    party,
    scenario,
    mapImageBase64,
    diceResults
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const userId = await requireUserId(request);
  const session = await getSession(request.headers.get("Cookie"));
  const formData = await request.formData();
  const intent = formData.get("intent");
  const roomCode = formData.get("roomCode")?.toString();

  if (!roomCode) {
    return json({ error: "Missing room code." }, { status: 400 });
  }

  if (intent === 'generateMap') {
    const scenarioStr = formData.get('scenario')?.toString();
    const partyCharactersStr = formData.get('partyCharacters')?.toString();

    if (!scenarioStr) {
      return json({ error: "Missing scenario data." }, { status: 400 });
    }

    try {
      const scenario: AdventureScenario = JSON.parse(scenarioStr);
      const partyCharacters: Character[] = partyCharactersStr ? JSON.parse(partyCharactersStr) : [];

      logger.debug('Generating map for scenario', { 
        scenarioTitle: scenario.title
      });

      const mapImageBase64 = await generateMapImage(scenario, partyCharacters);
      
      if (!mapImageBase64) {
        return json({ error: "Failed to generate map image." }, { status: 500 });
      }

      // Store map image in cache
      const stored = await setMapImage(roomCode, mapImageBase64);
      if (!stored) {
        logger.warn('Failed to store map image for room', { roomCode });
      }

      logger.debug('Successfully generated map for room', { roomCode });
      return json({ success: true, mapImageBase64 });
    } catch (error) {
      logger.error('Error generating map', { error });
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate map';
      return json({ error: errorMessage }, { status: 500 });
    }
  }

  if (intent === 'startGame') {
    if (!roomCode) {
      return json({ error: "Missing room code." }, { status: 400 });
    }

    try {
      // Update room status to active_game
      const statusUpdated = await updateRoomStatus(roomCode, 'active_game');
      if (statusUpdated) {
        logger.debug('Room status updated to active_game', { roomCode });
      } else {
        logger.warn('Failed to update room status', { roomCode });
      }

      logger.debug('Starting game for room', { roomCode });
      return redirect(`/world-map?roomCode=${roomCode}`);
    } catch (error) {
      logger.error('Error starting game', { error });
      const errorMessage = error instanceof Error ? error.message : 'Failed to start game';
      return json({ error: errorMessage }, { status: 500 });
    }
  }

  return json({ error: "Invalid intent." }, { status: 400 });
}

// Import getUserById and User types
const { getUserById } = await import("~/services/db.server");
type User = { id: string; username: string };

export default function MapGeneration() {
  const { mode, roomCode, roomName, participantsCount, maxPlayers, currentUserId, isHost, party, scenario, mapImageBase64, diceResults } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isGeneratingMap = navigation.formData?.get('intent') === 'generateMap';
  const isStarting = navigation.formData?.get('intent') === 'startGame';

  const navigate = useNavigate();

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gray-900">
      <div className="w-full max-w-6xl bg-black bg-opacity-70 p-8 rounded-lg border border-gray-700 shadow-lg text-white">
        
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h2 className="text-4xl font-medieval text-red-500">🗺️ Map Generation</h2>
            <p className="text-gray-400">Room: {roomCode} • {roomName}</p>
          </div>
          <div className="text-gray-400">
            {isHost ? 'Host' : 'Player'} • {participantsCount}/{maxPlayers} Players
          </div>
        </div>

        {/* Scenario Info */}
        <div className="mb-8 p-4 bg-gray-800 rounded-lg border border-gray-600">
          <h3 className="text-2xl font-medieval text-green-400 mb-2">Selected Scenario</h3>
          <p className="text-gray-300 text-lg">{scenario.title}</p>
          <p className="text-gray-400">{scenario.surrounding}</p>
        </div>

        {/* Map Display */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
            <h3 className="text-2xl font-medieval text-yellow-300 mb-4">🗺️ Generated Map</h3>
            
            {mapImageBase64 ? (
              <div className="space-y-4">
                <div className="aspect-video bg-gray-900 rounded-md flex items-center justify-center border-2 border-gray-600 relative overflow-hidden">
                  <img 
                    src={`data:image/png;base64,${mapImageBase64}`} 
                    alt="Generated Map"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 hover:bg-opacity-20 transition-all duration-300 flex items-center justify-center">
                    <span className="text-white text-lg opacity-0 hover:opacity-100 transition-opacity">
                      Click to view full size
                    </span>
                  </div>
                </div>
                
                <Form method="post" className="flex gap-3">
                  <input type="hidden" name="roomCode" value={roomCode} />
                  <input type="hidden" name="scenario" value={JSON.stringify(scenario)} />
                  <input type="hidden" name="partyCharacters" value={JSON.stringify(party.map(p => p.character).filter(Boolean))} />
                  
                  <button
                    type="submit"
                    name="intent"
                    value="generateMap"
                    disabled={isGeneratingMap}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-6 rounded-lg text-lg font-medieval transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    {isGeneratingMap ? (
                      <span className="flex items-center justify-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Regenerating...</span>
                      </span>
                    ) : (
                      'Regenerate Map'
                    )}
                  </button>
                  
                  <button
                    onClick={() => navigate(`/world-map?roomCode=${roomCode}`)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg font-medieval transition duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    View in World Map →
                  </button>
                </Form>
              </div>
            ) : (
              <div className="text-center p-8">
                <p className="text-gray-400 mb-4">No map generated yet.</p>
                <Form method="post">
                  <input type="hidden" name="roomCode" value={roomCode} />
                  <input type="hidden" name="scenario" value={JSON.stringify(scenario)} />
                  <input type="hidden" name="partyCharacters" value={JSON.stringify(party.map(p => p.character).filter(Boolean))} />
                  
                  <button
                    type="submit"
                    name="intent"
                    value="generateMap"
                    disabled={isGeneratingMap}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-4 px-8 rounded-lg text-xl font-medieval transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105 animate-pulse"
                  >
                    {isGeneratingMap ? (
                      <span className="flex items-center justify-center space-x-2">
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        <span>Generating...</span>
                      </span>
                    ) : (
                      'Generate Map'
                    )}
                  </button>
                </Form>
              </div>
            )}
          </div>

          {/* Player Slots */}
          <div className="bg-gray-800/50 p-6 rounded-lg border border-gray-700">
            <h3 className="text-2xl font-medieval text-yellow-300 mb-4">👥 Active Player Slots</h3>
            <div className="space-y-4">
              {party.filter(p => p.slot.type !== 'None' && p.slot.characterId !== null).map((p, index) => {
                const slot = p.slot;
                const character = p.character;
                
                return (
                  <div key={slot.characterId || index} className={`bg-gradient-to-br ${
                    slot.type === 'Human' ? 'bg-blue-900/50 border-blue-500' : 'bg-green-900/50 border-green-500'
                  } rounded-lg p-4 border-2 shadow-lg`}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-12 h-12 bg-gray-700 rounded-full flex items-center justify-center border-2 border-gray-600">
                          <span className="text-xl font-bold">
                            {character ? character.name.charAt(0).toUpperCase() : slot.type.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold text-white">{character?.name || slot.type}</h4>
                          <p className="text-sm text-gray-300">
                            {character ? `${character.race} ${character.class} - Level ${character.level}` : slot.type}
                          </p>
                        </div>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm font-semibold ${
                        slot.type === 'Human' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'
                      }`}>
                        {slot.type === 'Human' ? '👤 Human' : '🤖 AI'}
                      </div>
                    </div>

                    {character && (
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-gray-800 rounded p-2">
                          <div className="text-xs text-green-400 font-semibold">HP</div>
                          <div className="text-white font-bold">{character.hp}/{character.maxHp}</div>
                        </div>
                        <div className="bg-gray-800 rounded p-2">
                          <div className="text-xs text-blue-400 font-semibold">AC</div>
                          <div className="text-white font-bold">{character.ac}</div>
                        </div>
                      </div>
                    )}

                    {slot.type === 'Human' && slot.username && (
                      <div className="flex items-center justify-between pt-2 border-t border-gray-700">
                        <span className="bg-blue-900/50 text-blue-300 px-3 py-1 rounded-full text-sm">
                          👤 {slot.username}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          slot.isReady ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                        }`}>
                          {slot.isReady ? 'Ready' : 'Not Ready'}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => navigate(`/game?roomCode=${roomCode}`)}
            className="bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            ← Back to Scenario Selector
          </button>
          
          {isHost && (
            <Form method="post">
              <input type="hidden" name="roomCode" value={roomCode} />
              <button
                type="submit"
                name="intent"
                value="startGame"
                disabled={isStarting || isGeneratingMap}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-lg text-2xl font-medieval transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105"
              >
                {isStarting ? (
                  <span className="flex items-center justify-center space-x-3">
                    <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Starting Game...</span>
                  </span>
                ) : (
                  'Start Game →'
                )}
              </button>
            </Form>
          )}
        </div>

        {/* Dice Results */}
        {diceResults && Object.keys(diceResults).length > 0 && (
          <div className="mt-8 p-4 bg-yellow-900 bg-opacity-30 rounded-lg border border-yellow-600">
            <h4 className="text-lg font-semibold text-yellow-400 mb-2">🎲 Tiebreaker Results</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(diceResults).map(([slotIndex, result]) => (
                <div key={slotIndex} className="bg-yellow-800 bg-opacity-40 rounded-lg p-2 text-center">
                  <div className="text-yellow-300 font-semibold">Slot {slotIndex}</div>
                  <div className="text-2xl font-bold text-yellow-400">{result}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}