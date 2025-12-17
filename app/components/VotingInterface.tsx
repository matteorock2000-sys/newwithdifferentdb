import React from 'react';
import SkeletonLoader from './SkeletonLoader';
import ProgressBar from './ProgressBar';
import type { ScenarioForDisplay, PlayerSlot, ScenarioVote } from '~/types';
import { useGlobalToast } from '~/utils/toast';
import ScenarioCard from './ScenarioCard';

interface VotingInterfaceProps {
  scenarios: ScenarioForDisplay[] | null;
  isLoading: boolean;
  generationProgress?: number; // Added: 0-100
  generationStage?: 'analyzing' | 'generating' | 'finalizing' | null; // Added
  userVotes: Record<number, string | null>;
  scenarioVotes: Record<string, ScenarioVote[]>;
  userSlotIndices: number[]; // Added
  userActiveSlots: number;
  userVotesCast: number; // Added
  userHasCompletedVoting: boolean; // Added
  userCanStillVote: boolean; // Added
  regenerateVoteCount: number; // Added
  regenerateMajority: boolean;
  allHaveVoted: boolean;
  needsTiebreaker: boolean;
  isClearWinner: boolean; // Added
  shouldShowStartAdventure: boolean;
  winningScenario: ScenarioForDisplay | null;
  tiedScenarios: ScenarioForDisplay[] | null; // Added
  partySlots: PlayerSlot[];
  currentUserId: string;
  onVoteScenario: (slotIndex: number, scenarioId: string) => void;
  onVoteRegenerate: (slotIndex: number) => void;
  onSuggestScenario: () => void;
  onTiebreakerDiceRoll: () => void;
  onGenerateScenarios: () => void;
  onDurationChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onCustomPromptChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  selectedDuration: string;
  customPrompt: string;
  showCountdown: boolean;
  countdown: number;
  isGenerating: boolean;
  isHost: boolean; // Added
  showDiceRoll: boolean;
  isInitializingDice: boolean;
  onInitiateAdventure: () => void; // Added
  onStartMapGeneration: () => void; // NEW: Manual map generation start
  diceRollComplete: boolean; // Added
  diceSelectionApplied: boolean; // Added
  scenarioSelectionInProgress: boolean; // Added
  winningScenarioFromDice: ScenarioForDisplay | null; // Added
  adventureStarted: boolean; // Added
  diceResults?: Record<number, number>; // Added
}

const VotingInterface: React.FC<VotingInterfaceProps> = ({
  scenarios,
  isLoading,
  userVotes,
  scenarioVotes,
  userSlotIndices, // Added
  userActiveSlots,
  userVotesCast, // Added
  userHasCompletedVoting, // Added
  userCanStillVote, // Added
  regenerateVoteCount, // Added
  regenerateMajority,
  allHaveVoted,
  needsTiebreaker,
  isClearWinner, // Added
  shouldShowStartAdventure,
  winningScenario,
  tiedScenarios, // Added
  partySlots,
  currentUserId,
  onVoteScenario,
  onVoteRegenerate,
  onSuggestScenario,
  onTiebreakerDiceRoll,
  onGenerateScenarios,
  onDurationChange,
  onCustomPromptChange,
  selectedDuration,
  customPrompt,
  showCountdown,
  countdown,
  isGenerating,
  isHost, // Added
  showDiceRoll,
  isInitializingDice,
  onInitiateAdventure, // Added
  onStartMapGeneration, // NEW: Manual map generation start
  diceRollComplete, // Added
  diceSelectionApplied, // Added
  scenarioSelectionInProgress, // Added
  winningScenarioFromDice, // Added
  adventureStarted, // Added
  diceResults, // Added
}) => {
  const { showToast } = useGlobalToast();

  const getVoteCount = (scenarioId: string) => {
    return (scenarioVotes[scenarioId] || []).length;
  };

  const getSlotVote = (slotIndex: number) => {
    return userVotes[slotIndex] || null;
  };

  const isSlotVoted = (slotIndex: number) => {
    return getSlotVote(slotIndex) !== null;
  };

  const getSlotVoteDisplay = (slotIndex: number) => {
    const vote = getSlotVote(slotIndex);
    if (!vote) return 'No vote';
    if (vote === 'REGENERATE') return 'Regenerate';
    
    const scenario = scenarios?.find(s => s.id === vote);
    return scenario ? scenario.title : 'Unknown';
  };

  const getSlotOwner = (slotIndex: number) => {
    const slot = partySlots[slotIndex];
    if (!slot) return 'Unknown';
    return slot.username || `Player ${slotIndex}`;
  };

  const isSlotOwnedByCurrentUser = (slotIndex: number) => {
    const slot = partySlots[slotIndex];
    return slot && slot.userId === currentUserId;
  };

  if (showCountdown) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gray-900">
        <div className="flex flex-col items-center justify-center">
          <div className="text-center">
            <h1 className="text-6xl font-medieval text-red-500 mb-8">Get Ready!</h1>
            <div className="text-9xl font-bold text-yellow-400 mb-8 animate-pulse">
              {countdown}
            </div>
            <p className="text-2xl text-gray-300">Prepare your adventure...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="min-h-screen w-full bg-gray-900" 
      role="region" 
      aria-label="Scenario voting interface" 
      aria-live="polite"
      onKeyDown={(e) => {
        // Keyboard navigation for scenarios
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          // Focus next scenario card
          const cards = document.querySelectorAll('[role="button"][aria-label*="Vote for"]');
          const currentIndex = Array.from(cards).findIndex(card => (card as HTMLElement).focus());
          const nextIndex = Math.min(cards.length - 1, currentIndex + 1);
          if (cards[nextIndex]) {
            (cards[nextIndex] as HTMLElement).focus();
          }
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          // Focus previous scenario card
          const cards = document.querySelectorAll('[role="button"][aria-label*="Vote for"]');
          const currentIndex = Array.from(cards).findIndex(card => (card as HTMLElement).focus());
          const prevIndex = Math.max(0, currentIndex - 1);
          if (cards[prevIndex]) {
            (cards[prevIndex] as HTMLElement).focus();
          }
        }
      }}
      tabIndex={0}
    >
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700 p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-4xl font-medieval text-red-500 mb-2" aria-label="Adventure Scenario Selection">Adventure Scenario Selection</h1>
          <div className="flex items-center justify-between">
            <div className="text-gray-300" aria-label="Vote for your preferred adventure scenarios">
              Cast your votes for the adventure you want to embark on!
            </div>
            <div className="flex items-center space-x-4">
              <input
                type="text"
                value={customPrompt}
                onChange={onCustomPromptChange}
                placeholder="Enter a custom theme or suggestion for the adventure..."
                className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500 mr-4"
                disabled={isGenerating || allHaveVoted}
              />
              <select
                value={selectedDuration}
                onChange={onDurationChange}
                className="bg-gray-700 text-white px-4 py-2 rounded-lg border border-gray-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                disabled={isGenerating || allHaveVoted}
              >
                <option value="Short">Short (1-2 hours)</option>
                <option value="Medium">Medium (2-4 hours)</option>
                <option value="Long">Long (4+ hours)</option>
              </select>
              <button
                onClick={onGenerateScenarios}
                disabled={isGenerating || allHaveVoted || regenerateMajority}
                className="bg-red-700 hover:bg-red-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg transition duration-200 ease-in-out"
              >
                {isGenerating ? 'Generating...' : 'Generate Scenarios'}
              </button>
              <button
                onClick={onSuggestScenario}
                disabled={isGenerating || allHaveVoted || !customPrompt.trim()}
                className="bg-blue-700 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg transition duration-200 ease-in-out"
              >
                Suggest Theme
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-6">
        {/* Voting Status */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <div className="text-gray-300">
                <span className="font-semibold">Your Slots:</span> {userActiveSlots}
              </div>
              <div className="text-gray-300">
                <span className="font-semibold">Votes Cast:</span> {userVotesCast}
              </div>
              <div className="text-gray-300">
                <span className="font-semibold">Regenerate Votes:</span> {regenerateVoteCount}
              </div>
              <div className={`font-semibold ${
                userHasCompletedVoting ? 'text-green-400' : 'text-yellow-400'
              }`}>
                {userHasCompletedVoting ? 'All votes cast!' : 'Continue voting...'}
              </div>
            </div>
            {regenerateMajority && (
              <div className="bg-yellow-900 border border-yellow-600 text-yellow-300 px-4 py-2 rounded-lg">
                Regenerate majority reached! Generating new scenarios...
              </div>
            )}
          </div>
        </div>

        {/* Scenarios */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {scenarios?.map(scenario => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              partySlots={partySlots}
              allHaveVoted={allHaveVoted}
              onVoteScenario={onVoteScenario}
              getVoteCount={getVoteCount}
              getSlotVote={getSlotVote}
              isSlotOwnedByCurrentUser={isSlotOwnedByCurrentUser}
              getSlotOwner={getSlotOwner}
              isSlotVoted={isSlotVoted}
              getSlotVoteDisplay={getSlotVoteDisplay}
            />
          ))}
        </div>

        {/* Regenerate Option */}
        <div className="mt-8 bg-gray-800 rounded-lg p-4">
          <h3 className="text-lg font-semibold text-red-400 mb-2">Regenerate Scenarios</h3>
          <p className="text-gray-300 mb-4">
            If none of these scenarios appeal to you, vote to regenerate new ones!
          </p>
          <div className="space-y-2">
            {partySlots.map((slot, slotIndex) => {
              const isOwnedByCurrentUserValue = isSlotOwnedByCurrentUser(slotIndex);
              const vote = getSlotVote(slotIndex);
              const isVotedForRegenerate = vote === 'REGENERATE';
              
              return (
                <div key={slotIndex} className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">
                    {getSlotOwner(slotIndex)} {isOwnedByCurrentUserValue ? '(You)' : ''}
                  </span>
                  <div className="flex items-center space-x-2">
                    {isVotedForRegenerate ? (
                      <span className="bg-red-900 text-red-300 px-2 py-1 rounded text-sm">
                        Regenerate ✓
                      </span>
                    ) : (
                      <button
                        onClick={() => onVoteRegenerate(slotIndex)}
                        disabled={!isOwnedByCurrentUserValue || isSlotVoted(slotIndex) || allHaveVoted}
                        className={`px-3 py-1 rounded text-sm font-semibold transition duration-200 ease-in-out ${
                          !isOwnedByCurrentUserValue || isSlotVoted(slotIndex) || allHaveVoted
                            ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                            : 'bg-red-700 hover:bg-red-600 text-white'
                        }`}
                      >
                        Regenerate
                      </button>
                    )}
                    <span className="text-xs text-gray-400">{getSlotVoteDisplay(slotIndex)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tiebreaker Section */}
        {needsTiebreaker && (
          <div className="mt-8 bg-yellow-900 border border-yellow-600 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-yellow-300 mb-2">Tiebreaker Needed</h3>
            <p className="text-yellow-200 mb-4">
              There's a tie! The winner will be determined by a dice roll.
            </p>
            <button
              onClick={onTiebreakerDiceRoll}
              disabled={showDiceRoll || isInitializingDice}
              className="bg-yellow-700 hover:bg-yellow-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold py-2 px-6 rounded-lg transition duration-200 ease-in-out"
            >
              {isInitializingDice ? 'Starting Dice Roll...' : 'Start Tiebreaker Dice Roll'}
            </button>
          </div>
        )}

        {/* Start Adventure Button */}
        {shouldShowStartAdventure && winningScenario && (
          <div className="mt-8 bg-green-900 border border-green-600 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-green-300 mb-2">🎉 Scenario Selected!</h3>
            <p className="text-green-200 mb-4">
              All votes are in! The winning scenario is: <strong>{winningScenario.title}</strong>
            </p>
            {isHost ? (
              <button
                onClick={onStartMapGeneration}
                disabled={scenarioSelectionInProgress}
                className="bg-blue-700 hover:bg-blue-600 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 px-6 rounded-lg transition duration-200 ease-in-out"
              >
                {scenarioSelectionInProgress ? 'Starting Map Generation...' : 'Next: Map Generation'}
              </button>
            ) : (
              <div className="text-blue-200">
                Waiting for host to start map generation...
              </div>
            )}
          </div>
        )}

        {/* Loading State with Progress */}
        {isLoading && (
          <div className="mt-8 space-y-4">
            <ProgressBar 
              progress={generationProgress || 0}
              label={generationStage ? 
                generationStage === 'analyzing' ? 'Analyzing party composition...' :
                generationStage === 'generating' ? 'Generating adventure scenarios...' :
                'Finalizing details...' : 
                'Generating scenarios...'
              }
              showPercentage
              color="blue"
              size="md"
            />
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <SkeletonLoader variant="card" count={3} />
            </div>
            
            <div className="text-center text-gray-400 text-sm">
              This may take a moment as we craft unique adventures for your party...
            </div>
          </div>
        )}

        {/* Scenario Selection in Progress */}
        {scenarioSelectionInProgress && (
          <div className="mt-8 bg-yellow-900 border border-yellow-600 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-yellow-300 mb-2">🗺️ Starting Map Generation...</h3>
            <p className="text-yellow-200">Please wait while we prepare your adventure...</p>
            <div className="mt-4 flex items-center space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-yellow-300"></div>
              <span className="text-yellow-200">Loading...</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VotingInterface;