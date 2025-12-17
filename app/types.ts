export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface Weapon {
  name: string;
  attackBonus: string;
  damage: string;
  damageAttribute: 'Strength' | 'Dexterity' | 'Constitution' | 'Intelligence' | 'Wisdom' | 'Charisma';
  special?: string;
}

export interface SpellSlots {
  level1: { current: number; max: number };
  level2: { current: number; max: number };
  level3?: { current: number; max: number };
  level4?: { current: number; max: number };
  level5?: { current: number; max: number };
  level6?: { current: number; max: number };
  level7?: { current: number; max: number };
  level8?: { current: number; max: number };
  level9?: { current: number; max: number };
  level10?: { current: number; max: number };
  level11?: { current: number; max: number };
  level12?: { current: number; max: number };
  level13?: { current: number; max: number };
  level14?: { current: number; max: number };
  level15?: { current: number; max: number };
  level16?: { current: number; max: number };
  level17?: { current: number; max: number };
  level18?: { current: number; max: number };
  level19?: { current: number; max: number };
  level20?: { current: number; max: number };
}

export interface CharacterPersonality {
  trait?: string;
  ideal?: string;
  bond?: string;
  flaw?: string;
}

export interface Character {
  id: string;
  userId: string;
  slotIndex: number; // ADDED: To manage character slots
  name: string;
  race: string;
  class: string;
  level: number;
  experience: number;
  alignment: string;
  background: string;
  speed: number;
  hitDice: string;
  hp: number;
  maxHp: number;
  proficiencyBonus: number;
  stats: AbilityScores;
  statRolls?: {
    strength?: number[];
    dexterity?: number[];
    constitution?: number[];
    intelligence?: number[];
    wisdom?: number[];
    charisma?: number[];
  };
  modifiers?: AbilityScores;
  primaryAttribute?: string;
  secondaryAttribute?: string;
  ac: number;
  initiative: number;
  passivePerception: number;
  savingThrows: string[];
  skills: string[];
  equipment: string[];
  inventory: string[];
  armor?: string;
  fightStyle?: string;
  totalAc?: number;
  weapons?: {
    primary?: Weapon;
    secondary?: Weapon;
    ranged?: Weapon;
  };
  spellcastingAbility?: string;
  spellSaveDC?: number;
  spellAttackBonus?: string;
  features: string[];
  personality: CharacterPersonality;
  appearance?: string; // ADDED: For consistency with db.server.ts mapping
  avatarUrl?: string; // ADDED: For character portrait storage
  spells?: {
    cantrips: string[];
    level1: string[];
    level2: string[];
    level3?: string[];
    level4?: string[];
    level5?: string[];
    level6?: string[];
    level7?: string[];
    level8?: string[];
    level9?: string[];
    level10?: string[];
    level11?: string[];
    level12?: string[];
    level13?: string[];
    level14?: string[];
    level15?: string[];
    level16?: string[];
    level17?: string[];
    level18?: string[];
    level19?: string[];
    level20?: string[];
  };
  spellSlots?: SpellSlots;
}

export interface User {
  id: string;
  email: string;
  username: string;
  hashedPassword: string;
}

export interface BossFight {
  name: string;
  description: string;
}

export interface AdventureScenario {
  id: string;
  title: string;
  surrounding: string;
  objective: string;
  possibleEncounters?: string[];
  possibleEnemies?: string[];
  bossFight?: BossFight;
  mapDescription?: string;
}

// Alias for display purposes
export type ScenarioForDisplay = AdventureScenario;

// --- New Types for Party Setup ---
export type PlayerSlotType = 'Human' | 'AI' | 'None';

// --- New Types for Scenario Voting ---
export interface ScenarioVote {
  scenarioId: string;
  userId: string;
  slotIndex: number; // Which slot this vote represents
  timestamp: string;
}

export interface ScenarioWithVotes extends AdventureScenario {
  votes: number;
  userVotes: ScenarioVote[]; // Track individual votes for retraction
}

export interface PlayerSlot {
  type: PlayerSlotType;
  characterId: string | null;
  isReady: boolean;
  characterName?: string; // ADDED: To store the name for temporary setup persistence
  userId?: string; // NEW: ID of the user occupying this slot
  username?: string; // NEW: Username of the user occupying this slot (can be null)
  x?: number; // ADDED: Normalized x-coordinate for map
  y?: number; // ADDED: Normalized y-coordinate for map
}

// --- New Types for Rooms ---
// Define the structure for a participant within the room's participants JSONB array
export interface RoomParticipant {
    userId: string;
    characterId: string | null;
    lastActive: string; // ISO timestamp
}

// Define a type for the DB Room structure including setup_slots
export interface DBRoom {
    id: string;
    name: string;
    code: string;
    owner_id: string;
    user_id: string;
    host_id: string; // ADDED: Host ID field
    status: string;
    created_at: string;
    updated_at: string;
    participants: RoomParticipant[]; // Now typed
    setup_slots: PlayerSlot[]; // Crucial field for persistence
    active_slots: number | null; // ADDED: New column for cleanup verification
    maxPlayers?: number; // ADDED: Max players for the room
    room_chat_last_updated?: string; // ADDED: Timestamp of last chat update for real-time
    scenarios?: ScenarioForDisplay[];
    dice_rolling_state?: DiceRollingState | null;
    scenario_winner_id?: string | null; // ADDED: Scenario winner ID field
}

export interface Room {
  id: string;
  name: string;
  code: string;
  host_id: string;
  owner_id: string; // NEW: Track the original room creator
  participants: RoomParticipant[];
  status: 'lobby' | 'scenario_selection' | 'active' | 'finished' | 'scenario-selected' | 'active_game'; // Added 'scenario-selected' and 'active_game'
  createdAt: string;
  updatedAt: string;
  currentPlayers: number; // Number of unique users currently joined
  maxPlayers: number;     // Total of slots
  activeSlotsCount: number; // NEW: Number of slots currently occupied by Human or AI characters
  setup_slots?: PlayerSlot[]; // Optional setup_slots for Room type
  room_chat_last_updated?: string; // ADDED: Timestamp of last chat update for real-time
  scenarios?: ScenarioForDisplay[];
  dice_rolling_state?: DiceRollingState | null;
  scenario_winner_id?: string | null;
}

export interface DiceRollingState {
  status: 'not-started' | 'rolling' | 'completed';
  currentPlayerIndex: number;
  players: Array<{
    userId: string;
    slotIndex: number;
    characterId: string;
    characterName: string;
  }>;
  rolls: Record<number, number>; // slotIndex -> diceResult
  winner: number | null; // slotIndex of winner
}

// --- New Types for Realtime Room Updates ---
export type RoomUpdateType = 
  'votes_updated' | 
  'dice_updated' | 
  'room_status_updated' | 
  'participants_updated' |
  'scenarios_updated' |
  'chat_updated';

export interface RoomUpdatePayload {
  type: RoomUpdateType;
  data: {
    scenarioVotes?: Record<string, ScenarioVote[]>;
    regenerationVotes?: number;
    lastVoteTime?: string;
    diceState?: DiceRollingState | null;
    diceRolls?: Record<number, number>;
    diceRollComplete?: boolean;
    showDiceRoll?: boolean;
    isInitializingDice?: boolean;
    winningScenarioFromDice?: ScenarioForDisplay | null;
    currentScenario?: ScenarioForDisplay;
    scenarios?: ScenarioForDisplay[];
    roomCode?: string;
    newRoom?: DBRoom; // DBRoom will be imported into types.ts
    messages?: any[];
    party?: PlayerSlot[]; // For participant updates
  };
}

// Hook return types
export interface UseScenarioVotingReturn {
  scenarios: ScenarioForDisplay[] | null; // Re-added
  tiedScenarios: ScenarioForDisplay[] | null; // Re-added
  userVotes: Record<number, string | null>;
  scenarioVotes: Record<string, ScenarioVote[]>;
  regenerationVotes: number;
  votesLoaded: boolean;
  votesError: boolean;
  userActiveSlots: number;
  userSlotIndices: number[];
  userVotesCount: number;
  userRegenerateVotesCount: number;
  totalVotesCast: number;
  allSlotsVoted: boolean; // Global flag - all slots have voted
  userCanStillVote: boolean;
  userHasCompletedVoting: boolean; // Per-user flag - user has completed all votes
  winningScenario: ScenarioForDisplay | null;
  needsTiebreaker: boolean;
  isClearWinner: boolean;
  shouldShowStartAdventure: boolean; // Global flag - should show start adventure button (all slots voted)
  regenerateMajority: boolean;
  isGenerating: boolean;
  generationProgress: number;
  generationStage: 'analyzing' | 'generating' | 'finalizing' | null;
  selectedDuration: string;
  customPrompt: string;
  handleVoteScenario: (slotIndex: number, scenarioId: string) => void;
  handleVoteRegenerate: (slotIndex: number) => void;
  handleSuggestScenario: () => void;
  handleGenerateScenarios: () => void;
  handleDurationChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  handleCustomPromptChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  clearVotes: () => void;
}

export interface UseScenarioDiceReturn {
  diceState: DiceRollingState | null;
  diceRolls: Record<number, number>;
  diceRollComplete: boolean;
  showDiceRoll: boolean;
  isInitializingDice: boolean;
  winningScenarioFromDice: ScenarioForDisplay | null;
  handleTiebreakerDiceRoll: () => Promise<void>;
  onPlayerRollComplete: (slotIndex: number, result: number, userId: string) => Promise<void>;
  clearDiceState: () => void;
}

// Component prop types
export interface ScenarioCardProps {
  scenario: ScenarioForDisplay;
  partySlots: PlayerSlot[];
  allHaveVoted: boolean;
  onVoteScenario: (slotIndex: number, scenarioId: string) => void;
  getVoteCount: (scenarioId: string) => number;
  getSlotVote: (slotIndex: number) => string | null;
  isSlotOwnedByCurrentUser: (slotIndex: number) => boolean;
  getSlotOwner: (slotIndex: number) => string;
  isSlotVoted: (slotIndex: number) => boolean;
  getSlotVoteDisplay: (slotIndex: number) => string;
}

export interface VotingInterfaceProps {
  scenarios: ScenarioForDisplay[] | null;
  isLoading: boolean;
  userVotes: Record<number, string | null>;
  scenarioVotes: Record<string, ScenarioVote[]>;
  userSlotIndices: number[];
  userActiveSlots: number;
  userVotesCast: number; // Added
  userHasCompletedVoting: boolean; // Added
  userCanStillVote: boolean; // Added
  userHasVoted: boolean; // Added
  regenerateVoteCount: number; // Added
  regenerateMajority: boolean;
  allHaveVoted: boolean;
  needsTiebreaker: boolean;
  isClearWinner: boolean; // Added
  shouldShowStartAdventure: boolean; // Global flag - should show start adventure button (all slots voted)
  winningScenario: ScenarioForDisplay | null;
  tiedScenarios: ScenarioForDisplay[] | null;
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
  isHost: boolean;
  showDiceRoll: boolean;
  isInitializingDice: boolean;
  onInitiateAdventure: () => void; // Added
  diceRollComplete: boolean;
  diceSelectionApplied: boolean;
  scenarioSelectionInProgress: boolean;
  winningScenarioFromDice: ScenarioForDisplay | null;
  adventureStarted: boolean;
  diceResults?: Record<number, number>;
}

export interface TiebreakerDiceProps {
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
  adventureStarted: boolean;
  scenarioSelectionInProgress: boolean;
}

export interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
  roomCode: string;
  currentUserId: string;
  recentSuggestions: Array<{
    id: string;
    user_id: string;
    username: string;
    message: string;
    created_at: string;
  }>;
  lastSeenSuggestionId: string | null;
  setLastSeenSuggestionId: React.Dispatch<React.SetStateAction<string | null>>;
  showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  partySlots: PlayerSlot[];
}

// Slot Synchronization Status Types
export type SlotSyncStatus = 'synced' | 'syncing' | 'error' | 'pending';

export interface SlotSyncState {
  status: SlotSyncStatus;
  errorMessage?: string;
}