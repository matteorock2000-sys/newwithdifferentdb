import React, { useState } from 'react';
import type { PlayerSlot, DiceRollingState, ScenarioForDisplay } from '~/types';
import DiceBoxDirect from './DiceBoxDirect';
 
 interface TiebreakerDiceProps {
   showDiceRoll: boolean;
   isInitializingDice: boolean;
   diceState: DiceRollingState | null;
   diceRolls: Record<number, number>;
   diceRollComplete: boolean;
   winningScenarioFromDice: ScenarioForDisplay | null;
   partySlots: PlayerSlot[];
   currentUserId: string;
   onPlayerRollComplete: (slotIndex: number, result: number, userId: string) => void;
   onTiebreakerDiceRoll: () => void;
   onSelectScenarioForWorldMap?: () => void;
   adventureStarted: boolean;
   scenarioSelectionInProgress: boolean;
   isHost: boolean;
 }
const TiebreakerDice: React.FC<TiebreakerDiceProps> = ({
  showDiceRoll,
  isInitializingDice,
  diceState,
  diceRolls,
  diceRollComplete,
  winningScenarioFromDice,
  partySlots,
  currentUserId,
  onPlayerRollComplete,
  onTiebreakerDiceRoll,
  onSelectScenarioForWorldMap,
  adventureStarted,
  scenarioSelectionInProgress,
  isHost,
}) => {
  const [showPlayerRollSection, setShowPlayerRollSection] = useState(false);
  const diceBoxRef = useRef<DiceBoxDirectHandle>(null);

  const totalActiveSlots = partySlots.filter(slot => 
    slot.type === 'Human' || slot.type === 'AI'
  ).length;

  const rolledCount = Object.keys(diceRolls).length;
  const completionPercentage = totalActiveSlots > 0 ? Math.round((rolledCount / totalActiveSlots) * 100) : 0;

  const players = partySlots
    .filter(slot => slot.type === 'Human' || slot.type === 'AI')
    .map((slot, index) => ({
      slotIndex: index,
      characterName: slot.characterName || `Player ${index}`,
      userId: slot.userId || '',
      hasRolled: diceRolls[index] !== undefined,
      result: diceRolls[index]
    }));


  const currentPlayerIndex = diceState?.currentPlayerIndex || 0;
  const isCurrentPlayer = players[currentPlayerIndex]?.userId === currentUserId;

  if (!showDiceRoll) {
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-gray-900">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-medieval text-red-500 mb-2">Tiebreaker Dice Roll</h1>
          <div className="text-gray-300">
            Roll dice to determine the winner when there's a tie in scenario voting!
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        {/* Dice Rolling Status */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="text-gray-300">
                <span className="font-semibold">Status:</span> 
                <span className={`ml-2 font-bold ${
                  diceState?.status === 'rolling' ? 'text-yellow-400' :
                  diceState?.status === 'completed' ? 'text-green-400' : 'text-gray-400'
                }`}>
                  {isInitializingDice ? 'Initializing...' : 
                   diceState?.status === 'rolling' ? 'Rolling...' :
                   diceState?.status === 'completed' ? 'Completed' : 'Not started'}
                </span>
              </div>
              <div className="text-gray-300">
                <span className="font-semibold">Progress:</span> 
                <span className="ml-2 font-bold text-yellow-400">{completionPercentage}%</span>
              </div>
              <div className="text-gray-300">
                <span className="font-semibold">Rolled:</span> 
                <span className="ml-2 font-bold text-green-400">{rolledCount}/{totalActiveSlots}</span>
              </div>
            </div>
            {!diceRollComplete && (
              <button
                onClick={onTiebreakerDiceRoll}
                disabled={isInitializingDice || diceState?.status === 'rolling'}
                className="bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg transition duration-200 ease-in-out"
              >
                {isInitializingDice ? 'Starting...' : 'Start Dice Roll'}
              </button>
            )}
          </div>
        </div>

        {/* Dice Box */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 className="text-2xl font-semibold text-red-400 mb-4">Dice Rolling Interface</h2>
          <DiceBoxDirect
            ref={diceBoxRef}
            onPlayerRollComplete={onPlayerRollComplete}
            players={players}
            currentUserId={currentUserId}
            diceState={diceState}
            showPlayerRolls={showPlayerRollSection}
          />
        </div>

        {/* Player Status */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <h2 className="text-2xl font-semibold text-red-400 mb-4">Player Status</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {players.map((player, index) => (
              <div key={player.slotIndex} className="bg-gray-700 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-200">{player.characterName}</h3>
                    <p className="text-gray-400 text-sm">
                      {player.userId === currentUserId ? 'You' : 'Other Player'}
                    </p>
                  </div>
                  <div className={`px-3 py-1 rounded text-sm font-semibold ${
                    player.hasRolled ? 'bg-green-900 text-green-300' : 'bg-gray-600 text-gray-400'
                  }`}>
                    {player.hasRolled ? 'Rolled' : 'Waiting'}
                  </div>
                </div>
                {player.hasRolled && (
                  <div className="mt-2">
                    <span className="text-yellow-400 font-bold text-xl">{player.result}</span>
                    <span className="text-gray-400 ml-2">d20</span>
                  </div>
                )}
                {index === currentPlayerIndex && !player.hasRolled && (
                  <div className="mt-2 text-yellow-400 font-semibold">
                    Your turn to roll!
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Winner Information */}
        {diceRollComplete && winningScenarioFromDice && (
          <div className="bg-green-900 border border-green-600 rounded-lg p-4 mb-6">
            <h2 className="text-2xl font-semibold text-green-300 mb-2">🎉 Winner Determined by Dice!</h2>
            <p className="text-green-200 mb-4">
              The winner is <strong>{winningScenarioFromDice.title}</strong>!
            </p>
            <div className="flex items-center space-x-4">
              <button
                onClick={onSelectScenarioForWorldMap}
                disabled={adventureStarted || scenarioSelectionInProgress}
                className="bg-blue-700 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg transition duration-200 ease-in-out"
              >
                {scenarioSelectionInProgress ? 'Starting Map Generation...' : 'Next: Map Generation'}
              </button>
              <span className="text-blue-200">
                Host must click to proceed to map generation
              </span>
            </div>
          </div>
        )}

        {/* Roll Results */}
        {Object.keys(diceRolls).length > 0 && (
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <h2 className="text-2xl font-semibold text-red-400 mb-4">Roll Results</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {Object.entries(diceRolls).map(([slotIndex, result]) => {
                const slot = partySlots[parseInt(slotIndex)];
                return (
                  <div key={slotIndex} className="bg-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold text-gray-200">
                          {slot?.characterName || `Player ${slotIndex}`}
                        </h3>
                        <p className="text-gray-400 text-sm">
                          {slot?.userId === currentUserId ? 'You' : 'Other Player'}
                        </p>
                      </div>
                      <div className="text-yellow-400 font-bold text-2xl">
                        {result}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Instructions */}
        {!diceRollComplete && (
          <div className="bg-blue-900 border border-blue-600 rounded-lg p-4">
            <h2 className="text-lg font-semibold text-blue-300 mb-2">How to Play</h2>
            <ul className="text-blue-200 space-y-1">
              <li>• Each player takes turns rolling a d20</li>
              <li>• The highest roll wins the tiebreaker</li>
              <li>• The winner's voted scenario becomes the adventure</li>
              <li>• If the winner didn't vote, the scenario with the most votes is selected</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default TiebreakerDice;