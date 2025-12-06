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
  username?: string; // NEW: Username of the user occupying this slot
}

// --- New Types for Rooms ---
export interface RoomParticipant {
  userId: string;
  characterId: string;
}

export interface Room {
  id: string;
  name: string;
  code: string;
  host_id: string;
  owner_id: string; // NEW: Track the original room creator
  participants: RoomParticipant[];
  status: 'lobby' | 'scenario_selection' | 'active' | 'finished';
  createdAt: string;
  updatedAt: string;
  currentPlayers: number; // Number of unique users currently joined
  maxPlayers: number;     // Total of slots
  activeSlotsCount: number; // NEW: Number of slots currently occupied by Human or AI characters
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
