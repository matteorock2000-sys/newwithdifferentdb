-- Comprehensive SQL script to create the 'characters' table based on the application's needs.
-- This script ensures all fields from the Character interface are present, uses snake_case for columns,
-- and sets 'experience' as DOUBLE PRECISION to allow for non-integer values.

CREATE TABLE IF NOT EXISTS characters (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- CRITICAL FIX: Using user_id as FK
    slot_index INTEGER NOT NULL, -- ADDED: To manage character slots per user
    name VARCHAR(255) NOT NULL,
    race VARCHAR(100),
    class VARCHAR(100) NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    experience DOUBLE PRECISION NOT NULL DEFAULT 0.0, -- CRITICAL FIX: Using DOUBLE PRECISION for experience
    alignment VARCHAR(50),
    background VARCHAR(100),
    speed INTEGER,
    hit_dice VARCHAR(20),
    hp INTEGER,
    max_hp INTEGER,
    proficiency_bonus INTEGER,
    
    -- Ability Scores (Stored as JSONB)
    stats JSONB,
    stat_rolls JSONB,
    modifiers JSONB,
    
    primary_attribute VARCHAR(50),
    secondary_attribute VARCHAR(50),
    
    armor_class INTEGER, -- Renamed from ac in interface for clarity/consistency if needed, but using armor_class to match mapDbCharacterToCharacter
    initiative INTEGER,
    passive_perception INTEGER,
    
    -- Saving Throws and Skills (Stored as JSONB/TEXT array equivalent)
    saving_throws TEXT[],
    skills TEXT[],
    
    equipment TEXT[],
    inventory TEXT[],
    armor VARCHAR(100),
    avatar_url TEXT,
    fight_style VARCHAR(100),
    total_ac INTEGER,
    
    spellcasting_ability VARCHAR(50),
    spell_save_dc INTEGER,
    spell_attack_bonus VARCHAR(10),
    
    spells JSONB,
    spell_slots JSONB,
    
    weapons JSONB,

    -- ADDED: Generic JSONB field to hold narrative data (personality, features, appearance)
    data JSONB,

    -- ADDED: A user cannot have two characters in the same slot.
    CONSTRAINT unique_user_slot UNIQUE (user_id, slot_index)
);

-- Index for fast lookup by user
CREATE INDEX IF NOT EXISTS idx_characters_user_id ON characters (user_id);
