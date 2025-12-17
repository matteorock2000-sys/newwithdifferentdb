import React from "react";
import type { PlayerSlot, Character } from "~/types";

interface PlayerSlotsProps {
  roomCode: string;
  scenarioId: string;
  partySlots: PlayerSlot[];
  allCharacters: Character[];
  isHost: boolean;
  currentUserId: string;
}

export default function PlayerSlots({
  roomCode,
  scenarioId,
  partySlots,
  allCharacters,
  isHost,
  currentUserId
}: PlayerSlotsProps) {
  const activeSlots = partySlots.filter(slot => slot.type === 'Human' || slot.type === 'AI');
  const userSlots = partySlots.filter(slot => slot.userId === currentUserId);

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gray-900">
      <div className="w-full max-w-4xl bg-black bg-opacity-70 p-8 rounded-lg border border-gray-700 shadow-lg text-white">
        
        {/* Header */}
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h2 className="text-4xl font-medieval text-red-500">Player Slots</h2>
            <p className="text-gray-400">Room: {roomCode}</p>
          </div>
          <div className="text-gray-400">
            {isHost ? 'Host' : 'Player'} View
          </div>
        </div>

        {/* Scenario Info */}
        <div className="mb-8 p-4 bg-gray-800 rounded-lg border border-gray-600">
          <h3 className="text-2xl font-medieval text-green-400 mb-2">Selected Scenario</h3>
          <p className="text-gray-300">Scenario ID: {scenarioId}</p>
        </div>

        {/* Active Slots */}
        <div className="mb-8">
          <h3 className="text-3xl font-medieval text-yellow-400 mb-4">Active Player Slots</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {activeSlots.map((slot, index) => {
              const character = slot.characterId 
                ? allCharacters.find(c => c.id === slot.characterId)
                : null;
              
              return (
                <div key={index} className="bg-gray-800 p-4 rounded-lg border border-gray-600">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h4 className="text-lg font-semibold text-yellow-300">
                        Slot {index} - {slot.type}
                      </h4>
                      <p className="text-sm text-gray-400">
                        User: {slot.username || slot.userId || 'Unknown'}
                      </p>
                    </div>
                    <div className={`px-3 py-1 rounded-full text-sm ${
                      slot.isReady ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                    }`}>
                      {slot.isReady ? 'Ready' : 'Not Ready'}
                    </div>
                  </div>
                  
                  {character ? (
                    <div className="mt-2 p-3 bg-gray-700 rounded">
                      <p className="font-semibold text-white">{character.name}</p>
                      <p className="text-sm text-gray-300">
                        {character.race} {character.class} - Level {character.level}
                      </p>
                    </div>
                  ) : (
                    <div className="mt-2 p-3 bg-gray-700 rounded">
                      <p className="text-gray-400">No character assigned</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Your Slots */}
        <div className="mb-8">
          <h3 className="text-3xl font-medieval text-blue-400 mb-4">Your Slots</h3>
          {userSlots.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {userSlots.map((slot, index) => {
                const character = slot.characterId 
                  ? allCharacters.find(c => c.id === slot.characterId)
                  : null;
                
                return (
                  <div key={index} className="bg-gray-800 p-4 rounded-lg border border-gray-600">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="text-lg font-semibold text-blue-300">
                          Your Slot - {slot.type}
                        </h4>
                        <p className="text-sm text-gray-400">Slot Index: {index}</p>
                      </div>
                      <div className={`px-3 py-1 rounded-full text-sm ${
                        slot.isReady ? 'bg-green-600 text-white' : 'bg-gray-600 text-gray-300'
                      }`}>
                        {slot.isReady ? 'Ready' : 'Not Ready'}
                      </div>
                    </div>
                    
                    {character ? (
                      <div className="mt-2 p-3 bg-gray-700 rounded">
                        <p className="font-semibold text-white">{character.name}</p>
                        <p className="text-sm text-gray-300">
                          {character.race} {character.class} - Level {character.level}
                        </p>
                      </div>
                    ) : (
                      <div className="mt-2 p-3 bg-gray-700 rounded">
                        <p className="text-gray-400">No character assigned to this slot</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-4 bg-yellow-900 bg-opacity-30 rounded-lg border border-yellow-600">
              <p className="text-yellow-300">You don't have any active slots in this room.</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-4 justify-center">
          <button
            onClick={() => window.location.href = `/game?roomCode=${roomCode}`}
            className="bg-red-700 hover:bg-red-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            ← Back to Scenario Selector
          </button>
          
          <button
            onClick={() => window.location.href = `/world-map?roomCode=${roomCode}&scenarioId=${scenarioId}`}
            className="bg-green-700 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg transition-colors"
          >
            Generate Map →
          </button>
        </div>

        {/* Host Controls */}
        {isHost && (
          <div className="mt-8 p-4 bg-blue-900 bg-opacity-30 rounded-lg border border-blue-600">
            <h4 className="text-lg font-semibold text-blue-400 mb-2">Host Controls</h4>
            <p className="text-blue-300 text-sm">
              As the host, you can manage the room and proceed to map generation when all players are ready.
            </p>
            <div className="mt-4 flex gap-4">
              <button
                onClick={() => {
                  // Refresh the page to get latest slot status
                  window.location.reload();
                }}
                className="bg-blue-700 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded"
              >
                Refresh Status
              </button>
              <button
                onClick={() => window.location.href = `/rooms`}
                className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded"
              >
                Manage Rooms
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}