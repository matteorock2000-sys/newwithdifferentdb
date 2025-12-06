-- Add scenarios column to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS scenarios JSONB;

-- Create a table to track scenario votes in rooms
CREATE TABLE room_scenario_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_code VARCHAR(255) NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    slot_index INTEGER NOT NULL,
    scenario_id VARCHAR(255),
    vote_type VARCHAR(20) CHECK (vote_type IN ('scenario', 'regenerate')) DEFAULT 'scenario',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure one vote per slot per user per room
    UNIQUE(room_code, user_id, slot_index),
    
    -- Ensure either scenario_id or vote_type is set appropriately
    CONSTRAINT valid_vote CHECK (
        (vote_type = 'scenario' AND scenario_id IS NOT NULL) OR
        (vote_type = 'regenerate' AND scenario_id IS NULL)
    )
);

-- Create indexes for efficient querying
CREATE INDEX idx_room_votes ON room_scenario_votes (room_code);
CREATE INDEX idx_room_user_votes ON room_scenario_votes (room_code, user_id);
CREATE INDEX idx_scenario_votes ON room_scenario_votes (scenario_id) WHERE scenario_id IS NOT NULL;

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_room_scenario_votes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_room_scenario_votes_updated_at  
    BEFORE UPDATE ON room_scenario_votes
    FOR EACH ROW
    EXECUTE FUNCTION update_room_scenario_votes_updated_at();

-- Enable Row Level Security
ALTER TABLE room_scenario_votes ENABLE ROW LEVEL SECURITY;

-- Allow read access for room participants
CREATE POLICY "Room participants can read votes" ON room_scenario_votes
    FOR SELECT
    USING (
        room_code IN (
            SELECT code FROM rooms 
            WHERE owner_id = auth.uid() 
            OR (
                participants IS NOT NULL 
                AND jsonb_typeof(participants) = 'array'
                AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(participants::jsonb) elem 
                    WHERE elem->>'userId' = auth.uid()::text
                )
            )
        )
    );

-- Allow insert/update for room participants
CREATE POLICY "Room participants can manage votes" ON room_scenario_votes
    FOR ALL
    USING (
        room_code IN (
            SELECT code FROM rooms 
            WHERE owner_id = auth.uid() 
            OR (
                participants IS NOT NULL 
                AND jsonb_typeof(participants) = 'array'
                AND EXISTS (
                    SELECT 1 FROM jsonb_array_elements(participants::jsonb) elem 
                    WHERE elem->>'userId' = auth.uid()::text
                )
            )
        )
    );