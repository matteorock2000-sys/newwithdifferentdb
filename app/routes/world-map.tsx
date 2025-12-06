import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation, Link } from "@remix-run/react";
import { getSession, commitSession } from "~/sessions";
import type { AdventureScenario, Character, PlayerSlot } from "~/types";
import { generateMapImage } from "~/services/gemini.server";
import { getAllCharacters } from "~/services/characterCache.server";
import { requireUserId } from "~/services/auth.server";
import { setMapImage, getMapImage, deleteMapImage } from "~/services/mapCache.server"; // Import map cache functions
import { getRoomByCode, updateRoomStatus } from "~/services/room.server";
import { DND_5E_CHARACTERS } from "~/data/dnd";
import CharacterDisplayCard from "~/components/CharacterDisplayCard";
import ScenarioSelector from "~/components/ScenarioSelector";

export const meta: MetaFunction = () => [{ title: "Prepare for Adventure" }];

interface LoaderData {
  mode: 'scenario_selection' | 'map_generation';
  roomCode?: string;
  roomName?: string;
  participantsCount?: number;
  maxPlayers?: number;
  currentUserId?: string;
  isHost?: boolean;
  party?: { slot: PlayerSlot; character: Character | null }[];
  scenario?: AdventureScenario;
  mapImageBase64?: string | null;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const session = await getSession(request.headers.get("Cookie"));
  const url = new URL(request.url);
  const roomCode = url.searchParams.get("roomCode");

  // If roomCode is provided, this is scenario selection mode
  if (roomCode) {
    const room = await getRoomByCode(roomCode);
    
    if (!room) {
      return redirect("/rooms");
    }

    // Ensure room is in scenario selection status
    if (room.status !== 'scenario_selection') {
      if (room.status === 'lobby') {
        return redirect(`/game?roomCode=${roomCode}`);
      } else if (room.status === 'active' || room.status === 'finished') {
        return redirect(`/game?roomCode=${roomCode}`);
      }
    }

    // Check if current user is the host
    const isHost = room.owner_id === userId || room.host_id === userId;

    return json({
      mode: 'scenario_selection',
      roomCode,
      roomName: room.name,
      participantsCount: room.participants.length,
      maxPlayers: room.maxPlayers,
      currentUserId: userId,
      isHost
    }, {
      headers: { "Set-Cookie": await commitSession(session) }
    });
  }

  // Otherwise, this is map generation mode
  const partySlots: PlayerSlot[] = session.get("party") || [];
  const scenario = session.get("currentScenario");

  if (!partySlots || !scenario) {
    return redirect("/game");
  }

  // --- Character Resolution: Load characters for the user ---
  let availableCharacters: Character[] = await getAllCharacters(userId);

  // Fallback: If user has no characters, use DND_5E_CHARACTERS
  if (availableCharacters.length === 0) {
    availableCharacters = DND_5E_CHARACTERS;
  }
  // --- End Character Resolution ---

  // Resolve full character objects for the entire party using the available list
  const party: { slot: PlayerSlot; character: Character | null }[] = partySlots
    .map((slot: PlayerSlot) => ({
      slot,
      character: availableCharacters.find(c => c.id === slot.characterId) || null,
    }))
    .filter((p: { character: Character | null }): p is { slot: PlayerSlot; character: Character } => p.character !== null);
  // --- End Character Resolution ---

  // --- Map Image Resolution: Load from server-side cache ---
  const mapCacheId = session.get("mapCacheId");
  const mapImageBase64 = mapCacheId ? getMapImage(mapCacheId) : null;
  // --- End Map Image Resolution ---

  return json({ 
    mode: 'map_generation',
    party, 
    scenario, 
    mapImageBase64 
  }, {
    headers: { "Set-Cookie": await commitSession(session) }
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const formData = await request.formData();
  const intent = formData.get("intent");
  const roomCode = formData.get("roomCode")?.toString();

  // If roomCode is provided, handle scenario selection actions
  if (roomCode && intent === 'startGame') {
    const selectedScenarioId = formData.get("selectedScenarioId")?.toString();
    
    if (!selectedScenarioId) {
      return json({ error: "No scenario selected" }, { 
        status: 400,
        headers: { "Set-Cookie": await commitSession(session) }
      });
    }

    try {
      // Update room status to active
      const success = await updateRoomStatus(roomCode, 'active');
      
      if (!success) {
        return json({ error: "Failed to update room status" }, { 
          status: 500,
          headers: { "Set-Cookie": await commitSession(session) }
        });
      }

      console.log(`[WORLD-MAP] Room ${roomCode} status updated to 'active', starting game`);

      return redirect(`/game?roomCode=${roomCode}`, {
        headers: { "Set-Cookie": await commitSession(session) }
      });
    } catch (error) {
      console.error("Failed to start game:", error);
      return json({ error: "Failed to start game" }, { 
        status: 500,
        headers: { "Set-Cookie": await commitSession(session) }
      });
    }
  }

  // Otherwise, handle map generation actions
  if (intent === 'resetMapAndReturn') {
    const mapCacheId = session.get("mapCacheId");
    if (mapCacheId) {
      deleteMapImage(mapCacheId);
      session.unset("mapCacheId");
    }
    return redirect("/game", {
      headers: { "Set-Cookie": await commitSession(session) }
    });
  }

  const scenario = session.get("currentScenario");

  if (!scenario) {
    return redirect("/game"); // Should not happen
  }

  if (intent === 'generateMap') {
    try {
      console.log("[WORLD MAP ACTION] Generating map image...");
      const mapImageBase64 = await generateMapImage(scenario);
      const mapCacheId = crypto.randomUUID(); // Generate a unique ID for the map
      setMapImage(mapCacheId, mapImageBase64); // Store the image in the server-side cache
      session.set("mapCacheId", mapCacheId); // Store only the ID in the session
      return json({ ok: true }, {
        headers: { "Set-Cookie": await commitSession(session) }
      });
    } catch (error) {
      console.error("Failed to generate map image in action:", error);
      return json({ error: "Map generation failed." }, { 
        status: 500,
        headers: { "Set-Cookie": await commitSession(session) }
      });
    }
  }

  if (intent === 'beginAdventure') {
    const initialMessage = {
      role: 'model',
      text: `Your adventure begins. ${scenario.surrounding} ${scenario.objective} What do you do?`
    };

    session.set("messages", [initialMessage]);

    return redirect("/game", {
      headers: { "Set-Cookie": await commitSession(session) }
    });
  }

  return json({ error: "Invalid intent" }, { status: 400 });
}

export default function WorldMap() {
  const { mode, roomCode, roomName, participantsCount, maxPlayers, currentUserId, isHost, party, scenario, mapImageBase64 } = useLoaderData<any>();
  const navigation = useNavigation();
  const isGeneratingMap = navigation.formData?.get('intent') === 'generateMap';
  const isStarting = navigation.formData?.get('intent') === 'beginAdventure';

  // Scenario Selection Mode
  if (mode === 'scenario_selection') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
        {/* Header */}
        <header className="bg-black bg-opacity-50 py-4 border-b border-purple-500">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-center mb-4">
              {isHost && (
                <button 
                  onClick={async () => {
                    try {
                      // Reset room status back to lobby
                      const formData = new FormData();
                      formData.append('intent', 'resetRoomStatus');
                      formData.append('roomCode', roomCode);
                      
                      const response = await fetch('/game', {
                        method: 'POST',
                        body: formData
                      });
                      
                      if (response.ok) {
                        console.log(`[WORLD-MAP] Room ${roomCode} status reset to lobby by host`);
                      }
                    } catch (error) {
                      console.error('Failed to reset room status:', error);
                    }
                    
                    // Navigate back to room
                    window.location.href = `/game?roomCode=${roomCode}`;
                  }}
                  className="bg-red-700 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition duration-200 ease-in-out"
                >
                  ← Back to Room (Host)
                </button>
              )}
              {!isHost && roomCode && (
                <Link 
                  to={`/game?roomCode=${roomCode}`}
                  className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition duration-200 ease-in-out"
                >
                  ← Back to Room
                </Link>
              )}
              <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
                🗺️ Adventure Map
              </h1>
              <div></div> {/* Empty div for spacing */}
            </div>
            <p className="text-center text-purple-300">
              Choose your destiny, brave adventurers!
            </p>
          </div>
        </header>

        {/* Room Info */}
        <div className="container mx-auto px-4 py-6">
          <div className="bg-black bg-opacity-30 rounded-lg p-6 border border-purple-500">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">{roomName}</h2>
              <div className="text-sm text-purple-300">
                {participantsCount}/{maxPlayers} players ready
              </div>
            </div>
            <div className="text-purple-300">
              Room Code: <span className="font-mono text-pink-400">{roomCode}</span>
            </div>
          </div>
        </div>

        {/* Scenario Selection */}
        <div className="container mx-auto px-4 py-6">
          <ScenarioSelector 
            roomCode={roomCode}
            currentUserId={currentUserId}
            isSubmitting={isStarting}
          />
        </div>

        {/* Loading State */}
        {isStarting && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 border border-purple-500">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
              <p className="text-center text-purple-300 mt-4">Starting adventure...</p>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Map Generation Mode
  const BackButton = () => (
    <Form method="post">
      <button
        type="submit"
        name="intent"
        value="resetMapAndReturn"
        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg inline-block"
      >
        Back to Scenario Selection
      </button>
    </Form>
  );

  return (
    <div className="container mx-auto p-4 text-white">
      <h1 className="text-4xl font-medieval text-center text-red-400 mb-4">Prepare for Adventure</h1>

      <div className="mb-4">
        <BackButton />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Scenario & Map */}
        <div className="lg:col-span-2 bg-gray-800/50 p-6 rounded-lg border border-gray-700">
          <h2 className="text-3xl font-medieval text-yellow-300 mb-2">{scenario.title}</h2>
          <p className="text-gray-300 mb-4 italic">{scenario.surrounding}</p>
          <h3 className="text-xl font-medieval text-red-300 mb-2">Objective</h3>
          <p className="text-gray-200 mb-6">{scenario.objective}</p>

          <div className="aspect-video bg-gray-900 rounded-md flex items-center justify-center border-2 border-gray-600 relative">
            {isGeneratingMap ? (
              <div className="text-center">
                <p className="text-xl mb-2">The Cartographer is drawing your map...</p>
                <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-yellow-400 mx-auto"></div>
              </div>
            ) : mapImageBase64 ? (
              <>
                <img src={`data:image/jpeg;base64,${mapImageBase64}`} alt="Generated battle map" className="object-contain w-full h-full rounded-md" />
                <div className="absolute bottom-4 right-4">
                  <Form method="post">
                    <button
                      type="submit"
                      name="intent"
                      value="generateMap"
                      disabled={isGeneratingMap}
                      className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-lg font-medieval transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                      {isGeneratingMap ? 'Generating...' : 'Regenerate Map'}
                    </button>
                  </Form>
                </div>
              </>
            ) : (
              <div className="text-center p-4">
                <p className="text-gray-400 mb-4">A map for this area has not been generated.</p>
                <Form method="post">
                  <button
                    type="submit"
                    name="intent"
                    value="generateMap"
                    disabled={isGeneratingMap}
                    className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded-lg font-medieval transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed"
                  >
                    {isGeneratingMap ? 'Generating...' : 'Generate Map'}
                  </button>
                </Form>
                <div className="mt-4">
                  <BackButton />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Party & Start Button */}
        <div className="lg:col-span-1">
          <h2 className="text-3xl font-medieval text-yellow-300 mb-4">Your Party</h2>
          <div className="space-y-2">
            {party.map(p => p.character && <CharacterDisplayCard key={p.character.id} character={p.character} />)}
          </div>
          <Form method="post" className="mt-6">
            <button
              type="submit"
              name="intent"
              value="beginAdventure"
              disabled={isStarting || isGeneratingMap || !mapImageBase64}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg text-2xl font-medieval transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed"
            >
              {isStarting ? "Entering the world..." : "Begin Adventure"}
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
