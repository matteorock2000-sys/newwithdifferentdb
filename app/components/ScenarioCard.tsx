import React from 'react';
import type { ScenarioForDisplay, PlayerSlot, ScenarioCardProps } from '~/types';

const ScenarioCard: React.FC<ScenarioCardProps> = ({
  scenario,
  partySlots,
  allHaveVoted,
  onVoteScenario,
  getVoteCount,
  getSlotVote,
  isSlotOwnedByCurrentUser,
  getSlotOwner,
  isSlotVoted,
  getSlotVoteDisplay,
}) => {
  return (
    <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
      <h3 className="text-xl font-semibold text-red-400 mb-2">{scenario.title}</h3>
      <p className="text-gray-300 mb-4">{scenario.surrounding}</p>
      <div className="flex items-center justify-between mb-4">
        <span className="text-gray-400">Objective:</span>
        <span className="text-gray-300">{scenario.objective}</span>
      </div>
      <div className="flex items-center justify-between mb-4">
        <span className="text-gray-400">Votes:</span>
        <span className="text-yellow-400 font-bold">{getVoteCount(scenario.id)}</span>
      </div>

      {/* Voting Buttons */}
      <div className="space-y-2">
        {partySlots.map((slot, slotIndex) => {
          const isOwnedByCurrentUserValue = isSlotOwnedByCurrentUser(slotIndex);
          const vote = getSlotVote(slotIndex);
          const isVotedForThisScenario = vote === scenario.id;

          return (
            <div key={slotIndex} className="flex items-center justify-between">
              <span className="text-sm text-gray-300">
                {getSlotOwner(slotIndex)} {isOwnedByCurrentUserValue ? '(You)' : ''}
              </span>
              <div className="flex items-center space-x-2">
                {isVotedForThisScenario ? (
                  <span className="bg-green-900 text-green-300 px-2 py-1 rounded text-sm">
                    Voted ✓
                  </span>
                ) : (
                  <button
                    onClick={() => onVoteScenario(slotIndex, scenario.id)}
                    disabled={!isOwnedByCurrentUserValue || isSlotVoted(slotIndex) || allHaveVoted}
                    className={`px-3 py-1 rounded text-sm font-semibold transition duration-200 ease-in-out ${
                      !isOwnedByCurrentUserValue || isSlotVoted(slotIndex) || allHaveVoted
                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                        : 'bg-green-700 hover:bg-green-600 text-white'
                    }`}
                  >
                    Vote
                  </button>
                )}
                <span className="text-xs text-gray-400">{getSlotVoteDisplay(slotIndex)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ScenarioCard;