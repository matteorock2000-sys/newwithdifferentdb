import type { ActionFunctionArgs, LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation, Link } from "@remix-run/react";
import { getSession, commitSession, addMessageToSession } from "~/sessions";
import type { AdventureScenario, Character, PlayerSlot } from "~/types";
import { generateMapImage } from "~/services/gemini.server";
import LoadingOverlay from "~/components/LoadingOverlay";
import ProgressBar from "~/components/ProgressBar";
import SkeletonLoader from "~/components/SkeletonLoader";
import ConnectionStatus from "~/components/ConnectionStatus";
import { useConnectionStatus } from "~/hooks/useConnectionStatus";
import { getAllCharacters } from "~/services/characterCache.server";
import { requireUserId } from "~/services/auth.server";
import { setMapImage, getMapImage, deleteMapImage } from "~/services/mapCache.server"; // Import map cache functions
import { getRoomByCode, updateRoomStatus } from "~/services/roomCore.server";
import { DND_5E_CHARACTERS } from "~/data/dnd";
import CharacterDisplayCard from "~/components/CharacterDisplayCard";
import ScenarioSelector from "~/components/ScenarioSelector";
import { useState, useMemo } from "react"; // Import useMemo
import { logger } from "~/utils/logger";
import { createApiErrorResponse } from "~/utils/errors";
import { retryOperation } from "~/utils/retry";
import { cleanupSession } from "~/utils/sessionCleanup";

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
  scenario?: AdventureScenario | null; // Allow scenario to be null
  mapImageBase64?: string | null;
  diceResults?: Record<number, number>; // Dice results from tiebreaker
}

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const session = await getSession(request.headers.get("Cookie"));
  const url = new URL(request.url);
  const roomCode = url.searchParams.get("roomCode");

  logger.debug(`[WORLD-MAP] LOADER STARTED - Accessing world-map with roomCode: ${roomCode}`);
  logger.debug(`[WORLD-MAP] User ID: ${userId}`);

  // If roomCode is provided, this is map generation mode (after scenario selection)
  if (roomCode) {
    const room = await getRoomByCode(roomCode);
    
    if (!room) {
      logger.debug(`[WORLD-MAP] Room not found for code: ${roomCode}, redirecting to rooms`);
      return redirect("/rooms");
    }

    logger.debug(`[WORLD-MAP] Room fetched:`, {
        id: room.id,
        name: room.name,
        status: room.status,
        scenario_winner_id: room.scenario_winner_id,
        scenarios_count: room.scenarios?.length || 0
    });

    // Ensure room is in active status (scenario already selected)
    if (room.status !== 'active' && room.status !== 'active_game' && room.status !== 'scenario-selected') {
      if (room.status === 'lobby') {
        return redirect(`/game?roomCode=${roomCode}`);
      } else if (room.status === 'scenario_selection') {
        return redirect(`/game?roomCode=${roomCode}`);
      } else if (room.status === 'finished') {
        return redirect(`/game?roomCode=${roomCode}`);
      }
    }
    
    // If room is in scenario-selected status, redirect to map generation
    if (room.status === 'scenario-selected') {
      return redirect(`/map?roomCode=${roomCode}`);
    }

    // Check if current user is the host
    const isHost = room.owner_id === userId || room.host_id === userId;

    // Get the selected scenario from the room
    logger.debug(`[WORLD-MAP] Room status: ${room.status}, scenario_winner_id: ${room.scenario_winner_id}`);
    logger.debug(`[WORLD-MAP] Available scenarios count: ${room.scenarios?.length || 0}`);
    logger.debug(`[WORLD-MAP] Available scenarios:`, { scenarios: room.scenarios?.map(s => ({ id: s.id, title: s.title })) });
    
    // Debug: Check if scenario_winner_id matches any scenario ID
    if (room.scenarios && room.scenario_winner_id) {
      logger.debug(`[WORLD-MAP] Looking for scenario with ID: ${room.scenario_winner_id}`);
      room.scenarios.forEach((s, index) => {
        logger.debug(`[WORLD-MAP] Scenario ${index}: ID=${s.id}, Title=${s.title}, Match=${s.id === room.scenario_winner_id}`);
      });
    }
    
    const scenario = room.scenarios?.find(s => s.id === room.scenario_winner_id) || null; // Explicitly allow null

    if (!scenario) {
      logger.debug(`[WORLD-MAP] Scenario not found, scenario_winner_id: ${room.scenario_winner_id}`);
      logger.debug(`[WORLD-MAP] Checking if scenario_winner_id exists in scenarios...`);
      if (room.scenarios && room.scenario_winner_id) {
        const found = room.scenarios.some(s => s.id === room.scenario_winner_id);
        logger.debug(`[WORLD-MAP] Scenario ID found in scenarios: ${found}`);
      }
      
      // Check if there are dice results that can help determine the winner
      const diceResults = session.get("diceResults");
      if (diceResults && Object.keys(diceResults).length > 0) {
        logger.debug(`[WORLD-MAP] Found dice results in session, checking if we can determine scenario winner...`);
        
        // For now, we'll show the world-map with the dice results and let the host select the scenario
        // This is a temporary solution until we implement proper scenario winner determination from dice results
        logger.debug(`[WORLD-MAP] Showing world-map with dice results for manual scenario selection`);
      } else {
        logger.debug(`[WORLD-MAP] No dice results found, redirecting to game`);
        return redirect(`/game?roomCode=${roomCode}`);
      }
    }
    
    logger.debug(`[WORLD-MAP] Found scenario:`, { scenarioTitle: scenario?.title }); // Use optional chaining

    // Get party slots from the room
    const partySlots: PlayerSlot[] = room.setup_slots || [];

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

    // --- Map Image Resolution: Load from server-side cache ---
    const mapCacheId = session.get("mapCacheId");
    const mapImageBase64 = mapCacheId ? getMapImage(mapCacheId) : null;
    // --- End Map Image Resolution ---

    // Get dice results from session if available
    const diceResults = session.get("diceResults");

    return json({
      mode: 'map_generation',
      roomCode,
      roomName: room.name,
      participantsCount: room.participants.length,
      maxPlayers: room.maxPlayers,
      currentUserId: userId,
      isHost,
      party,
      scenario,
      mapImageBase64,
      diceResults
    }, {
      headers: { "Set-Cookie": await commitSession(cleanupSession(session)) }
    });
  }

  // Otherwise, this is standalone map generation mode (without room)
  const partySlots: PlayerSlot[] = session.get("party") || [];
  const scenario = session.get("currentScenario") as AdventureScenario | null; // Cast to allow null

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

  // Get dice results from query params (preferred) or session (fallback)
  const diceResultsFromQuery = url.searchParams.get('diceResults');
  const diceResults = diceResultsFromQuery 
    ? JSON.parse(decodeURIComponent(diceResultsFromQuery))
    : session.get("diceResults") || undefined;

  return json({ 
    mode: 'map_generation',
    roomCode,
    roomName: room.name,
    participantsCount: room.participants.length,
    maxPlayers: room.maxPlayers,
    currentUserId: userId,
    isHost,
    party, 
    scenario, 
    mapImageBase64,
    diceResults
  }, {
    headers: { "Set-Cookie": await commitSession(cleanupSession(session)) }
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const formData = await request.formData();
  const intent = formData.get("intent");
  const roomCode = formData.get("roomCode")?.toString();

  if (intent === 'startGame') {
    const roomCode = formData.get('roomCode')?.toString();
    
    logger.debug(`[WORLD-MAP ACTION] Starting game for room: ${roomCode}`);
    
    if (!roomCode) {
      return json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing room code",
            userMessage: "Room code is required to start the game.",
            recoverySteps: ["Check the room URL", "Refresh the page"],
            retryable: false,
          },
        },
        { status: 400 }
      );
    }

    try {
      // Update room status to active_game
      const statusUpdated = await updateRoomStatus(roomCode, 'active_game');
      if (statusUpdated) {
        logger.debug(`[WORLD-MAP ACTION] Room ${roomCode} status updated to 'active_game'`);
      } else {
        logger.warn(`[WORLD-MAP ACTION] Failed to update room ${roomCode} status`);
      }

      // Redirect to game with roomCode
      return redirect(`/game?roomCode=${roomCode}`, {
        headers: { "Set-Cookie": await commitSession(cleanupSession(session)) }
      });
    } catch (error) {
      logger.error("Error starting game", { error: error instanceof Error ? error.message : "Unknown error" });
      
      // Use standardized error response
      return createApiErrorResponse(error, `roomCode: ${roomCode}, intent: startGame`);
    }
  }

  // Otherwise, handle map generation actions
  if (intent === 'resetMapAndReturn') {
    const mapCacheId = session.get("mapCacheId");
    if (mapCacheId) {
      deleteMapImage(mapCacheId);
      session.unset("mapCacheId");
    }
    
    // Check for roomCode in form data
    const formDataRoomCode = formData.get("roomCode")?.toString();
    
    // Redirect back to room scenario selection if roomCode is present
    if (formDataRoomCode) {
      return redirect(`/game?roomCode=${formDataRoomCode}`, {
        headers: { "Set-Cookie": await commitSession(cleanupSession(session)) }
      });
    } else {
      // Keep existing behavior for standalone flows
      return redirect("/game", {
        headers: { "Set-Cookie": await commitSession(cleanupSession(session)) }
      });
    }
  }

  const scenario = session.get("currentScenario") as AdventureScenario | null; // Cast to allow null

  // If roomCode is present, get the scenario from the room instead of session
  if (roomCode && !scenario) {
    const room = await getRoomByCode(roomCode);
    if (room && room.scenario_winner_id) {
      const roomScenario = room.scenarios?.find(s => s.id === room.scenario_winner_id);
      if (roomScenario) {
        // Use room scenario for room-based flows
      } else {
        return json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Selected scenario not found in room",
              userMessage: "The selected scenario could not be found in the room.",
              recoverySteps: ["Check the room selection", "Try again"],
              retryable: false,
            },
          },
          { status: 400 }
        );
      }
    }
  } else if (!scenario) {
    return json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "No scenario available",
          userMessage: "No scenario is available for map generation.",
          recoverySteps: ["Select a scenario first", "Try again"],
          retryable: false,
        },
      },
      { status: 400 }
    );
  }

  if (intent === "generateMap") {
    try {
      logger.debug("[WORLD MAP ACTION] Generating map image...");

      let scenarioToUse = scenario;

      // If roomCode is present, use the room's selected scenario instead of session scenario
      if (roomCode) {
        const room = await getRoomByCode(roomCode);
        if (room && room.scenario_winner_id) {
          const roomScenario = room.scenarios?.find(
            (s) => s.id === room.scenario_winner_id
          );
          if (roomScenario) {
            scenarioToUse = roomScenario;
            logger.debug(
              `[WORLD MAP ACTION] Using room scenario: ${roomScenario.title}`
            );
          } else {
            return json(
              {
                success: false,
                error: {
                  code: "VALIDATION_ERROR",
                  message: "Selected scenario not found in room",
                  userMessage: "The selected scenario could not be found in the room.",
                  recoverySteps: ["Check the room selection", "Try again"],
                  retryable: false,
                },
              },
              { status: 400 }
            );
          }
        } else {
          return json(
            {
              success: false,
              error: {
                code: "ROOM_NOT_FOUND",
                message: "Room not found or no scenario selected",
                userMessage: "The room could not be found or no scenario was selected.",
                recoverySteps: ["Check the room code", "Ask the host for a new invite"],
                retryable: false,
              },
            },
            { status: 400 }
          );
        }
      } else if (!scenarioToUse) {
        return json(
          {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "No scenario available for map generation",
              userMessage: "No scenario is available to generate a map.",
              recoverySteps: ["Select a scenario first", "Try again"],
              retryable: false,
            },
          },
          { status: 400 }
        );
      }

      // Use retry logic for map generation
      const mapImageBase64 = await retryOperation(
        async () => {
          // Set initial progress and stage
          setIsGeneratingMapLocal(true);
          setMapGenerationProgress(0);
          setMapGenerationStage('analyzing');
          
          // Simulate progress during generation
          let progress = 0;
          const progressInterval = setInterval(() => {
            progress += 10;
            setMapGenerationProgress(Math.min(progress, 70)); // Cap at 70% until response
            if (progress >= 70) {
              clearInterval(progressInterval);
            }
          }, 500);
          
          // Update stage
          setTimeout(() => setMapGenerationStage('generating'), 1500);
          
          try {
            const result = await generateMapImage(scenarioToUse);
            
            // Complete progress animation
            setMapGenerationStage('finalizing');
            setMapGenerationProgress(100);
            
            // Final cleanup
            setTimeout(() => {
              setIsGeneratingMapLocal(false);
              setMapGenerationProgress(0);
              setMapGenerationStage(null);
            }, 1000);
            
            return result;
          } catch (error) {
            // Cleanup on error
            clearInterval(progressInterval);
            setIsGeneratingMapLocal(false);
            setMapGenerationProgress(0);
            setMapGenerationStage(null);
            throw error;
          }
        },
        {
          maxAttempts: 3,
          delayMs: 3000,
          maxDelayMs: 10000,
          shouldRetry: (error, attempt) => {
            // Retry on API errors, quota errors, and timeouts but not on validation errors
            if (attempt >= 3) return false; // Max 3 attempts

            return (
              error?.message?.includes("API") ||
              error?.message?.includes("quota") ||
              error?.message?.includes("timeout") ||
              error?.message?.includes("ETIMEDOUT") ||
              error?.message?.includes("ECONNRESET")
            );
          },
          onRetry: (error, attempt) => {
            logger.info("Retrying map generation", {
              roomCode,
              attempt,
              error: error.message,
            });
          },
        }
      );

      if (!mapImageBase64) {
        // Graceful degradation - continue without map
        logger.warn(
          "Map generation failed after retries, continuing without map",
          { roomCode }
        );

        return json({
          success: true,
          mapGenerated: false,
          message:
            "Could not generate map, but you can continue the adventure",
        });
      }

      const mapCacheId = crypto.randomUUID(); // Generate a unique ID for the map
      setMapImage(mapCacheId, mapImageBase64); // Store the image in the server-side cache
      session.set("mapCacheId", mapCacheId); // Store only the ID in the session

      return json({
        success: true,
        mapGenerated: true,
        message: "Map generated successfully",
      });
    } catch (error) {
      logger.error("Failed to generate map image in action", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      // Graceful degradation - continue without map
      logger.warn("Map generation failed, continuing without map", {
        roomCode,
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return json({
        success: true,
        mapGenerated: false,
        message: "Could not generate map, but you can continue the adventure",
      });
    }
  }

  if (intent === 'nextToGame') {
    // Use room scenario if available, otherwise use session scenario
    let scenarioToUse = scenario;
    
    if (roomCode) {
      const room = await getRoomByCode(roomCode);
      if (room && room.scenario_winner_id) {
        const roomScenario = room.scenarios?.find(s => s.id === room.scenario_winner_id);
        if (roomScenario) {
          scenarioToUse = roomScenario;
        }
      }
    }
    
    if (!scenarioToUse) {
      return json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "No scenario available for initial message",
            userMessage: "No scenario is available for the initial message.",
            recoverySteps: ["Select a scenario first", "Try again"],
            retryable: false,
          },
        },
        { status: 400 }
      );
    }

    const initialMessage = {
      role: 'model',
      text: `Your adventure begins. ${scenarioToUse.surrounding} ${scenarioToUse.objective} What do you do?`
    };

    addMessageToSession(session, initialMessage);

    // Redirect to game with roomCode if available
    if (roomCode) {
      return redirect(`/game?roomCode=${roomCode}`, {
        headers: { "Set-Cookie": await commitSession(cleanupSession(session)) }
      });
    } else {
      return redirect("/game", {
        headers: { "Set-Cookie": await commitSession(cleanupSession(session)) }
      });
    }
  }

  return json(
    {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid intent",
        userMessage: "Unknown action requested.",
        recoverySteps: ["Check the action", "Try again"],
        retryable: false,
      },
    },
    { status: 400 }
  );
}

export default function WorldMap() {
  const { mode, roomCode, roomName, participantsCount, maxPlayers, currentUserId, isHost, party, scenario, mapImageBase64, diceResults } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isGeneratingMap = navigation.formData?.get('intent') === 'generateMap';
  const isStarting = navigation.formData?.get('intent') === 'nextToGame';
  
  // Connection status
  const { status: connectionStatus, isOnline, isReconnecting, isOffline } = useConnectionStatus();
  
  // Collapsible sections state
  const [expandedSections, setExpandedSections] = useState({
    encounters: false,
    enemies: false,
    mapDescription: false
  });

  // Map generation state
  const [isGeneratingMapLocal, setIsGeneratingMapLocal] = useState(false);
  const [mapGenerationProgress, setMapGenerationProgress] = useState(0);
  const [mapGenerationStage, setMapGenerationStage] = useState<'analyzing' | 'generating' | 'finalizing' | null>(null);
  const [mapGenerationError, setMapGenerationError] = useState<string | null>(null);
  
  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  // --- DERIVED STATE ---
  const activeParty = useMemo(() => {
    return party?.filter(p => p.slot.type === 'Human' || p.slot.type === 'AI') || [];
  }, [party]);

  const humanCount = useMemo(() => {
    return activeParty.filter(p => p.slot.type === 'Human').length;
  }, [activeParty]);

  const aiCount = useMemo(() => {
    return activeParty.filter(p => p.slot.type === 'AI').length;
  }, [activeParty]);
  // --- END DERIVED STATE ---

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
                        logger.debug(`[WORLD-MAP] Room ${roomCode} status reset to lobby by host`);
                      }
                    } catch (error) {
                      logger.error('Failed to reset room status', { error: error instanceof Error ? error.message : "Unknown error" });
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
                🗺️ Map Generation
              </h1>
              <div></div> {/* Empty div for spacing */}
            </div>
            <p className="text-center text-purple-300">
              Generate your adventure map and prepare for the journey!
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
            scenarios={scenario ? [scenario] : null} // Pass scenario as an array or null
            isLoading={isStarting}
            currentUserId={currentUserId}
            roomCode={roomCode}
            isHost={isHost}
            diceResults={diceResults}
            partySlots={party?.map(p => p.slot)} // Pass party slots
            activeCharacter={party?.[0]?.character || null} // Pass first character as active
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
      {roomCode && (
        <input type="hidden" name="roomCode" value={roomCode} />
      )}
      <button
        type="submit"
        name="intent"
        value="resetMapAndReturn"
        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg inline-block"
        disabled={isGeneratingMapLocal}
      >
        {isGeneratingMapLocal ? "Generating..." : "Back to Scenario Selection"}
      </button>
    </Form>
  );

  return (
    <div className="container mx-auto p-4 text-white">
      {/* Connection Status Indicator */}
      <ConnectionStatus 
        status={connectionStatus === 'online' ? 'connected' : 
               connectionStatus === 'reconnecting' ? 'reconnecting' : 'offline'}
        autoHide={isOnline}
        autoHideDelay={3000}
      />
      
      <h1 className="text-4xl font-medieval text-center text-red-400 mb-4">🗺️ Map Generation</h1>

      <div className="mb-4">
        <BackButton />
      </div>

      {/* Map Generation Loading Overlay */}
      {isGeneratingMapLocal && (
        <LoadingOverlay
          isLoading={true}
          message={mapGenerationStage === 'analyzing' ? 'Analyzing scenario details...' :
                  mapGenerationStage === 'generating' ? 'Generating map layout...' :
                  mapGenerationStage === 'finalizing' ? 'Rendering map image...' :
                  'Generating world map...'}
          fullScreen={false}
        >
          <div className="space-y-6">
            <ProgressBar
              progress={mapGenerationProgress}
              label={mapGenerationStage === 'analyzing' ? 'Analyzing scenario details...' :
                     mapGenerationStage === 'generating' ? 'Generating map layout...' :
                     mapGenerationStage === 'finalizing' ? 'Rendering map image...' :
                     'Generating world map...'}
              showPercentage
              color="blue"
              size="md"
            />
            
            <div className="text-center text-gray-400 text-sm">
              {mapGenerationStage === 'analyzing' && 'Analyzing environment, objectives, and encounters...'}
              {mapGenerationStage === 'generating' && 'Creating terrain, paths, and landmarks...'}
              {mapGenerationStage === 'finalizing' && 'Adding details and optimizing for gameplay...'}
              {!mapGenerationStage && 'This may take a moment as we craft your adventure map...'}
            </div>

            {/* Estimated time indicator */}
            <div className="text-center text-xs text-gray-500">
              Estimated time: 30-60 seconds
            </div>
          </div>
        </LoadingOverlay>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Scenario & Map */}
        <div className="lg:col-span-2 bg-gray-800/50 p-6 rounded-lg border border-gray-700">
          {isGeneratingMap ? (
            <SkeletonLoader variant="card" count={1} />
          ) : (
            <>
              <h2 className="text-4xl font-medieval text-green-400 mb-2">🗺️ {scenario?.title}</h2> {/* Optional chaining */}
            </>
          )}
          
          {/* Environment Card */}
          <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-yellow-600">
            <h3 className="text-lg font-semibold text-yellow-400 mb-2">🌍 Environment</h3>
            <p className="text-gray-300">{scenario?.surrounding}</p> {/* Optional chaining */}
          </div>

          {/* Objective Card */}
          <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-red-600">
            <h3 className="text-lg font-semibold text-red-400 mb-2">🎯 Objective</h3>
            <p className="text-gray-300">{scenario?.objective}</p> {/* Optional chaining */}
          </div>

          {/* Map Description Section */}
          {scenario?.mapDescription && (
            <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-blue-600">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-blue-400">🗺️ Map Description</h3>
                <button
                  onClick={() => toggleSection('mapDescription')}
                  className="text-blue-300 hover:text-blue-100"
                >
                  {expandedSections.mapDescription ? '▼ Hide' : '▶ Show'}
                </button>
              </div>
              {expandedSections.mapDescription && (
                <p className="text-gray-300">{scenario.mapDescription}</p>
              )}
            </div>
          )}

          {/* Encounters Section */}
          {scenario?.possibleEncounters && scenario.possibleEncounters.length > 0 && (
            <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-purple-600">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-purple-400">⚔️ Possible Encounters</h3>
                <button
                  onClick={() => toggleSection('encounters')}
                  className="text-purple-300 hover:text-purple-100"
                >
                  {expandedSections.encounters ? '▼ Hide' : `▶ Show (${scenario.possibleEncounters.length})`}
                </button>
              </div>
              {expandedSections.encounters && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {scenario.possibleEncounters.map((encounter, index) => (
                    <span key={index} className="inline-block bg-purple-900/50 text-purple-300 px-3 py-1 rounded-full text-sm">
                      {encounter}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Enemies Section */}
          {scenario?.possibleEnemies && scenario.possibleEnemies.length > 0 && (
            <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-orange-600">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-orange-400">👹 Possible Enemies</h3>
                <button
                  onClick={() => toggleSection('enemies')}
                  className="text-orange-300 hover:text-orange-100"
                >
                  {expandedSections.enemies ? '▼ Hide' : `▶ Show (${scenario.possibleEnemies.length})`}
                </button>
              </div>
              {expandedSections.enemies && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {scenario.possibleEnemies.map((enemy, index) => (
                    <span key={index} className="inline-block bg-orange-900/50 text-orange-300 px-3 py-1 rounded-full text-sm">
                      {enemy}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Boss Fight Section */}
          {scenario?.bossFight && (
            <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-red-700">
              <h3 className="text-lg font-semibold text-red-500 mb-2">💀 Boss Fight</h3>
              <div className="bg-red-900/30 p-3 rounded border border-red-600">
                <p className="text-red-300 font-semibold">{scenario.bossFight.name}</p>
                <p className="text-red-200 text-sm">{scenario.bossFight.description}</p>
              </div>
            </div>
          )}
          
          {/* Map Image Display */}
          {isGeneratingMapLocal ? (
            <div className="mt-6">
              <SkeletonLoader variant="card" count={1} height={400} />
            </div>
          ) : (
            mapImageBase64 && (
              <div className="mt-6 bg-gray-800 rounded-lg p-4 border border-blue-600">
                <h3 className="text-lg font-semibold text-blue-400 mb-2">🗺️ Generated Map</h3>
                <div className="relative">
                  <img 
                    src={`data:image/jpeg;base64,${mapImageBase64}`} 
                    alt={`${scenario?.title} map`}
                    className="w-full h-auto rounded-lg"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      const parent = e.target.parentElement;
                      if (parent) {
                        const fallback = parent.querySelector('.map-fallback');
                        if (fallback) fallback.style.display = 'block';
                      }
                    }}
                  />
                  <div className="map-fallback bg-gray-800 border border-gray-600 rounded-lg p-6 text-center hidden">
                    <p className="text-gray-400">Map image failed to load</p>
                    <p className="text-sm text-gray-500">Please try generating the map again</p>
                  </div>
                </div>
              </div>
            )
          )}
          
          {/* Map Generation Controls */}
          {!isGeneratingMapLocal && !mapImageBase64 && (
            <Form method="post" className="mt-6">
              {roomCode && (
                <input type="hidden" name="roomCode" value={roomCode} />
              )}
              <button
                type="submit"
                name="intent"
                value="generateMap"
                disabled={isGeneratingMapLocal}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg text-lg font-medieval transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed"
              >
                {isGeneratingMapLocal ? "Generating Map..." : "Generate Map"}
              </button>
            </Form>
          )}
          
          {/* Dice Results Display */}
          {diceResults && Object.keys(diceResults).length > 0 && (
            <div className="mb-6 p-4 bg-yellow-900 bg-opacity-30 rounded-lg border border-yellow-600">
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
                      className="bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-3 px-6 rounded-lg text-lg font-medieval transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105"
                    >
                      {isGeneratingMap ? (
                        <span className="flex items-center justify-center space-x-2">
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Generating...</span>
                        </span>
                      ) : (
                        'Regenerate Map'
                      )}
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
                <div className="mt-4">
                  <BackButton />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Party & Next Button */}
        <div className="lg:col-span-1">
          <h2 className="text-3xl font-medieval text-yellow-300 mb-4">Your Party</h2>
          <div className="space-y-3">
            {party?.map((p, index) => { // Optional chaining
              const slot = p.slot;
              const character = p.character;
              
              return (
                <div key={slot.characterId || index} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center">
                        <span className="text-sm font-semibold">
                          {character ? character.name.charAt(0) : slot.type.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold">
                          {character ? character.name : slot.type}
                        </div>
                        <div className="text-sm text-gray-400">
                          {slot.userId ? `Player: ${slot.userId.substring(0, 8)}` : 'No player assigned'}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`px-2 py-1 rounded text-xs font-semibold ${
                        slot.type === 'Human' ? 'bg-blue-600 text-white' :
                        slot.type === 'AI' ? 'bg-green-600 text-white' :
                        'bg-gray-600 text-white'
                      }`}>
                        {slot.type}
                      </div>
                    </div>
                  </div>

                  {/* Username Badge for Human Slots */}
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
            
            {/* Party Composition Summary */}
            <div className="mt-6 p-4 bg-gray-800 rounded-lg border border-purple-600">
              <h4 className="text-lg font-semibold text-purple-400 mb-3">👥 Party Composition</h4>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                    👤 {humanCount} Human Players
                  </span>
                  <span className="bg-green-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                    🤖 {aiCount} AI Companions
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-400">Total Adventurers</div>
                  <div className="text-2xl font-bold text-white">
                    {activeParty.length}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Host Controls */}
          {isHost && (
            <div className="mt-6 space-y-3">
              <h3 className="text-xl font-medieval text-yellow-300">Host Controls</h3>
              <Form method="post">
                <input type="hidden" name="roomCode" value={roomCode} />
                <button
                  type="submit"
                  name="intent"
                  value="startGame"
                  disabled={isStarting || isGeneratingMap}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg text-lg font-medieval transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed"
                >
                  {isStarting ? "Starting..." : "Start Game"}
                </button>
              </Form>
            </div>
          )}
          
          {/* Next Button for all players */}
          <Form method="post" className="mt-6">
            <input type="hidden" name="roomCode" value={roomCode} />
            <button
              type="submit"
              name="intent"
              value="nextToGame"
              disabled={isStarting}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-2xl font-medieval transition duration-300 disabled:bg-gray-500 disabled:cursor-not-allowed shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              {isStarting ? (
                <span className="flex items-center justify-center space-x-3">
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin"></div>
                  <span>Preparing Adventure...</span>
                </span>
              ) : (
                'Next → Begin Adventure'
              )}
            </button>
            
            {/* Helper text for map requirement */}
            {!mapImageBase64 && (
              <p className="text-yellow-300 text-sm mt-2 text-center">
                Note: Map generation is optional but recommended for the best experience
              </p>
            )}
          </Form>
        </div>
      </div>
    </div>
  );
}