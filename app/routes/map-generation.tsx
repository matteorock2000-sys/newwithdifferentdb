import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { getSession, commitSession } from "~/sessions";
import type { Character, PlayerSlot } from "~/types";
import { generateMapImage } from "~/services/gemini.server";
import ConnectionStatus from "~/components/ConnectionStatus";
import { useConnectionStatus } from "~/hooks/useConnectionStatus";
import { getAllCharacters } from "~/services/characterCache.server";
import { requireUserId } from "~/services/auth.server";
import { setMapImage, getMapImage, deleteMapImage } from "~/services/mapCache.server";
import { getRoomByCode } from "~/services/room.server";
import { DND_5E_CHARACTERS } from "~/data/dnd";
import { useState, useMemo } from "react";
import { logger } from "~/utils/logger";
import { createApiErrorResponse } from "~/utils/errors";
import { retryOperation } from "~/utils/retry";
import { cleanupSession } from "~/utils/sessionCleanup";
import crypto from "crypto";

export const meta: MetaFunction = () => [{ title: "Map Generation - Adventure Awaits" }];

export async function loader({ request }: LoaderFunctionArgs) {
  const userId = await requireUserId(request);
  const session = await getSession(request.headers.get("Cookie"));
  const url = new URL(request.url);
  const roomCode = url.searchParams.get("roomCode");

  logger.debug(`[MAP-GENERATION] LOADER STARTED - roomCode: ${roomCode}`);

  if (!roomCode) {
    logger.debug(`[MAP-GENERATION] No roomCode provided, redirecting to rooms`);
    return redirect("/rooms");
  }

  const room = await getRoomByCode(roomCode);

  if (!room) {
    logger.debug(`[MAP-GENERATION] Room not found for code: ${roomCode}, redirecting to rooms`);
    return redirect("/rooms");
  }

  logger.debug(`[MAP-GENERATION] Room fetched:`, {
    id: room.id,
    name: room.name,
    status: room.status,
    scenario_winner_id: room.scenario_winner_id,
    scenarios_count: room.scenarios?.length || 0
  });

  // Ensure room has a winning scenario
  if (!room.scenario_winner_id || !room.scenarios) {
    logger.debug(`[MAP-GENERATION] Room missing scenario_winner_id or scenarios, redirecting to game`);
    return redirect(`/game?roomCode=${roomCode}`);
  }

  // Normalize scenario_winner_id which may be stored as JSONB object or simple id
  const winnerRef = room.scenario_winner_id;
  const winnerId = typeof winnerRef === 'string' ? winnerRef : winnerRef?.id;

  // Find the winning scenario
  const scenario = room.scenarios.find(s => s.id === winnerId) || null;

  if (!scenario) {
    logger.debug(`[MAP-GENERATION] Winning scenario not found in room scenarios, redirecting to game`);
    return redirect(`/game?roomCode=${roomCode}`);
  }

  const isHost = room.owner_id === userId || room.host_id === userId;
  const partySlots: PlayerSlot[] = room.setup_slots || [];

  // Load characters
  let availableCharacters: Character[] = await getAllCharacters(userId);
  if (availableCharacters.length === 0) {
    availableCharacters = DND_5E_CHARACTERS;
  }

  // Resolve full character objects for the party
  const party: { slot: PlayerSlot; character: Character | null }[] = partySlots
    .map((slot: PlayerSlot) => ({
      slot,
      character: availableCharacters.find(c => c.id === slot.characterId) || null,
    }))
    .filter((p: { character: Character | null }): p is { slot: PlayerSlot; character: Character } => p.character !== null);

  // Load map image if available
  const mapCacheId = session.get("mapCacheId");
  const mapImageBase64 = mapCacheId ? getMapImage(mapCacheId) : null;

  logger.debug(`[MAP-GENERATION] Loader completed successfully`, {
    roomCode,
    scenario: scenario.title,
    partyCount: party.length,
    hasMapImage: !!mapImageBase64
  });

  return json({
    roomCode,
    roomName: room.name,
    participantsCount: room.participants.length,
    maxPlayers: room.maxPlayers,
    currentUserId: userId,
    isHost,
    party,
    scenario,
    mapImageBase64
  }, {
    headers: { "Set-Cookie": await commitSession(cleanupSession(session)) }
  });
}

export async function action({ request }: LoaderFunctionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const formData = await request.formData();
  const intent = formData.get("intent");
  const roomCode = formData.get("roomCode")?.toString();

  logger.debug(`[MAP-GENERATION ACTION] Received intent: ${intent}`, { roomCode });

  if (intent === "generateMap") {
    if (!roomCode) {
      return json(
        { success: false, error: "Missing room code" },
        { status: 400 }
      );
    }

    try {
      const room = await getRoomByCode(roomCode);
      if (!room || !room.scenario_winner_id || !room.scenarios) {
        return json(
          { success: false, error: "Room or scenario not found" },
          { status: 400 }
        );
      }

      const winnerRef = room.scenario_winner_id;
      const winnerId = typeof winnerRef === 'string' ? winnerRef : winnerRef?.id;
      const scenario = room.scenarios.find(s => s.id === winnerId);
      if (!scenario) {
        return json(
          { success: false, error: "Scenario not found" },
          { status: 400 }
        );
      }

      logger.debug("[MAP-GENERATION ACTION] Generating map image...", { scenario: scenario.title });

      const mapImageBase64 = await retryOperation(
        () => generateMapImage(scenario),
        {
          maxAttempts: 3,
          delayMs: 3000,
          maxDelayMs: 10000,
          shouldRetry: (error) => {
            return (
              error?.message?.includes("API") ||
              error?.message?.includes("quota") ||
              error?.message?.includes("timeout")
            );
          },
          onRetry: (error, attempt) => {
            logger.info("Retrying map generation", { roomCode, attempt, error: error.message });
          }
        }
      );

      if (!mapImageBase64) {
        logger.warn("Map generation failed after retries, continuing without map", { roomCode });
        return json({
          success: true,
          mapGenerated: false,
          message: "Could not generate map, but you can continue the adventure"
        });
      }

      const mapCacheId = crypto.randomUUID();
      setMapImage(mapCacheId, mapImageBase64);
      session.set("mapCacheId", mapCacheId);

      logger.info("[MAP-GENERATION ACTION] Map generated successfully", { roomCode, mapCacheId });

      return json({
        success: true,
        mapGenerated: true,
        message: "Map generated successfully"
      }, {
        headers: { "Set-Cookie": await commitSession(session) }
      });
    } catch (error) {
      logger.error("Failed to generate map image", {
        error: error instanceof Error ? error.message : "Unknown error"
      });

      return json({
        success: true,
        mapGenerated: false,
        message: "Could not generate map, but you can continue the adventure"
      });
    }
  }

  if (intent === "nextToGame") {
    if (!roomCode) {
      return json({ success: false, error: "Missing room code" }, { status: 400 });
    }

    try {
      const room = await getRoomByCode(roomCode);
      if (!room) {
        return redirect("/rooms");
      }

      logger.debug("[MAP-GENERATION ACTION] Proceeding to game", { roomCode });
      return redirect(`/game?roomCode=${roomCode}`, {
        headers: { "Set-Cookie": await commitSession(cleanupSession(session)) }
      });
    } catch (error) {
      logger.error("Failed to proceed to game", { error });
      return createApiErrorResponse(error, "Failed to proceed to game");
    }
  }

    if (intent === "resetMapAndReturn") {
    const mapCacheId = session.get("mapCacheId");
    if (mapCacheId) {
      deleteMapImage(mapCacheId);
      session.unset("mapCacheId");
    }

    if (roomCode) {
      return redirect(`/game?roomCode=${roomCode}`, {
        headers: { "Set-Cookie": await commitSession(cleanupSession(session)) }
      });
    }

    return redirect("/game", {
      headers: { "Set-Cookie": await commitSession(cleanupSession(session)) }
    });
  }

  return json({ error: "Invalid intent" }, { status: 400 });
}

export default function MapGeneration() {
  const { roomCode, roomName, participantsCount, maxPlayers, party, scenario, mapImageBase64 } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isGeneratingMap = navigation.formData?.get('intent') === 'generateMap';
  const isStarting = navigation.formData?.get('intent') === 'nextToGame';

  const { status: connectionStatus, isOnline } = useConnectionStatus();

  const [expandedSections, setExpandedSections] = useState({
    encounters: false,
    enemies: false,
    mapDescription: false
  });

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const activeParty = useMemo(() => {
    return party?.filter(p => p.slot.type === 'Human' || p.slot.type === 'AI') || [];
  }, [party]);

  const humanCount = useMemo(() => {
    return activeParty.filter(p => p.slot.type === 'Human').length;
  }, [activeParty]);

  const aiCount = useMemo(() => {
    return activeParty.filter(p => p.slot.type === 'AI').length;
  }, [activeParty]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 text-white">
      {/* Header */}
      <header className="bg-black bg-opacity-50 py-4 border-b border-purple-500">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            🗺️ Map Generation
          </h1>
          <p className="text-center text-purple-300 mt-2">
            Generate your adventure map and prepare for the journey!
          </p>
        </div>
      </header>

      {/* Connection Status */}
      <ConnectionStatus 
        status={connectionStatus === 'online' ? 'connected' : 'offline'}
        autoHide={isOnline}
        autoHideDelay={3000}
      />

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

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column: Scenario & Map */}
        <div className="lg:col-span-2 bg-gray-800/50 p-6 rounded-lg border border-gray-700 space-y-6">
          <h2 className="text-4xl font-medieval text-green-400 mb-4">🗺️ {scenario?.title}</h2>

          {/* Active Slots Indicator */}
          <div className="bg-purple-600 text-white px-4 py-2 rounded-lg inline-flex items-center space-x-2">
            <span className="text-sm font-semibold">👥</span>
            <span className="text-lg font-bold">{activeParty.length}</span>
            <span className="text-sm">Active Adventurers</span>
          </div>

          {/* Scenario Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-800 rounded-lg border border-yellow-600">
              <h3 className="text-lg font-semibold text-yellow-400 mb-2">🌍 Environment</h3>
              <p className="text-gray-300 text-sm">{scenario?.surrounding}</p>
            </div>

            <div className="p-4 bg-gray-800 rounded-lg border border-red-600">
              <h3 className="text-lg font-semibold text-red-400 mb-2">🎯 Objective</h3>
              <p className="text-gray-300 text-sm">{scenario?.objective}</p>
            </div>
          </div>

          {/* Map Description */}
          {scenario?.mapDescription && (
            <div className="p-4 bg-gray-800 rounded-lg border border-blue-600">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-blue-400">🗺️ Map Description</h3>
                <button
                  onClick={() => toggleSection('mapDescription')}
                  className="text-blue-300 hover:text-blue-100"
                >
                  {expandedSections.mapDescription ? '▼ Hide' : '▶ Show'}
                </button>
              </div>
              {expandedSections.mapDescription && (
                <p className="text-gray-300 text-sm">{scenario.mapDescription}</p>
              )}
            </div>
          )}

          {/* Encounters */}
          {scenario?.possibleEncounters && scenario.possibleEncounters.length > 0 && (
            <div className="p-4 bg-gray-800 rounded-lg border border-purple-600">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-purple-400">⚔️ Possible Encounters</h3>
                <button
                  onClick={() => toggleSection('encounters')}
                  className="text-purple-300 hover:text-purple-100"
                >
                  {expandedSections.encounters ? '▼ Hide' : `▶ Show (${scenario.possibleEncounters.length})`}
                </button>
              </div>
              {expandedSections.encounters && (
                <div className="grid grid-cols-2 gap-2">
                  {scenario.possibleEncounters.map((encounter, i) => (
                    <span key={i} className="bg-purple-900/50 text-purple-300 px-3 py-1 rounded-full text-sm">
                      {encounter}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Enemies */}
          {scenario?.possibleEnemies && scenario.possibleEnemies.length > 0 && (
            <div className="p-4 bg-gray-800 rounded-lg border border-orange-600">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-orange-400">👹 Possible Enemies</h3>
                <button
                  onClick={() => toggleSection('enemies')}
                  className="text-orange-300 hover:text-orange-100"
                >
                  {expandedSections.enemies ? '▼ Hide' : `▶ Show (${scenario.possibleEnemies.length})`}
                </button>
              </div>
              {expandedSections.enemies && (
                <div className="grid grid-cols-2 gap-2">
                  {scenario.possibleEnemies.map((enemy, i) => (
                    <span key={i} className="bg-orange-900/50 text-orange-300 px-3 py-1 rounded-full text-sm">
                      {enemy}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Boss Fight */}
          {scenario?.bossFight && (
            <div className="p-4 bg-gray-800 rounded-lg border border-red-700">
              <h3 className="text-lg font-semibold text-red-500 mb-3">💀 Boss Fight</h3>
              <div className="bg-red-900/30 p-4 rounded border border-red-600">
                <p className="text-red-300 font-semibold text-lg">{scenario.bossFight.name}</p>
                <p className="text-red-200 text-sm mt-2">{scenario.bossFight.description}</p>
              </div>
            </div>
          )}

          {/* Map Generation */}
          {mapImageBase64 ? (
            <div className="bg-gray-800 rounded-lg p-4 border border-blue-600">
              <h3 className="text-lg font-semibold text-blue-400 mb-2">🗺️ Generated Map</h3>
              <img 
                src={`data:image/jpeg;base64,${mapImageBase64}`} 
                alt={`${scenario?.title} map`}
                className="w-full h-auto rounded-lg"
              />
            </div>
          ) : (
            <Form method="post">
              <input type="hidden" name="roomCode" value={roomCode} />
              <button
                type="submit"
                name="intent"
                value="generateMap"
                disabled={isGeneratingMap}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 px-8 rounded-lg text-2xl transition duration-300 disabled:bg-gray-500"
              >
                {isGeneratingMap ? '⏳ Generating...' : '🗺️ Generate Map'}
              </button>
            </Form>
          )}
        </div>

        {/* Right Column: Party & Controls */}
        <div className="lg:col-span-1 space-y-6">
          <h2 className="text-3xl font-medieval text-yellow-300">Your Party</h2>

          <div className="space-y-4">
            {activeParty.map((p, idx) => (
              <div key={idx} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <div className="flex items-center space-x-3">
                  <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center text-lg font-bold">
                    {p.character?.avatarUrl ? (
                      <img src={p.character.avatarUrl} alt={p.character.name} className="w-full h-full rounded-lg object-cover" />
                    ) : (
                      p.character?.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{p.character?.name}</h3>
                    <p className="text-sm text-gray-400">{p.character?.race} {p.character?.class}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 bg-gray-800 rounded-lg border border-purple-600">
            <h4 className="text-lg font-semibold text-purple-400 mb-3">👥 Party Composition</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-300">Human Players:</span>
                <span className="font-bold text-blue-400">{humanCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-300">AI Companions:</span>
                <span className="font-bold text-green-400">{aiCount}</span>
              </div>
              <div className="flex justify-between text-lg font-bold mt-3 pt-3 border-t border-gray-600">
                <span className="text-gray-300">Total:</span>
                <span className="text-white">{activeParty.length}</span>
              </div>
            </div>
          </div>

          {/* Navigation Controls */}
          <Form method="post" className="space-y-3">
            <input type="hidden" name="roomCode" value={roomCode} />
            <button
              type="submit"
              name="intent"
              value="nextToGame"
              disabled={isStarting}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-6 rounded-lg text-xl transition duration-300 disabled:bg-gray-500"
            >
              {isStarting ? '⏳ Preparing...' : '▶️ Begin Adventure'}
            </button>

            <button
              type="submit"
              name="intent"
              value="resetMapAndReturn"
              className="w-full bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-6 rounded-lg transition duration-300"
            >
              ← Back to Room
            </button>
          </Form>
        </div>
      </div>
    </div>
  );
}
