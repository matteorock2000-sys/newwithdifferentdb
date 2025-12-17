-- Add maxPlayers column to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS maxPlayers INTEGER DEFAULT 4;

-- Add active_slots column to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS active_slots INTEGER DEFAULT 0;

-- Add setup_slots column to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS setup_slots JSONB;

-- Add room_chat_last_updated column to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS room_chat_last_updated TIMESTAMP WITH TIME ZONE;

-- Add scenarios column to rooms table (if not already added)
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS scenarios JSONB;

-- Add dice_rolling_state column to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS dice_rolling_state JSONB;

-- Add scenario_winner_id column to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS scenario_winner_id VARCHAR(255);

-- Update existing rooms to have default values
UPDATE rooms SET maxPlayers = 4 WHERE maxPlayers IS NULL;
UPDATE rooms SET active_slots = 0 WHERE active_slots IS NULL;