-- Performance indexes for rooms table
-- Run this migration to optimize common queries

-- Index for room code lookups (most frequent query)
CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);

-- Index for active room queries
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status) WHERE status != 'finished';

-- Index for participant activity queries
CREATE INDEX IF NOT EXISTS idx_rooms_updated_at ON rooms(updated_at);

-- Index for room owner queries (for cleanup and management)
CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON rooms(owner_id);

-- Index for host queries (for room management)
CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON rooms(host_id);

-- Composite index for scenario selection queries
CREATE INDEX IF NOT EXISTS idx_rooms_scenario_selection ON rooms(status, updated_at) WHERE status IN ('scenario_selection', 'scenario-selected');

-- Index for participant count queries
CREATE INDEX IF NOT EXISTS idx_rooms_participants_count ON rooms((jsonb_array_length(participants)));

-- Index for active slots count queries
CREATE INDEX IF NOT EXISTS idx_rooms_active_slots ON rooms(active_slots) WHERE active_slots > 0;

-- Index for chat last updated queries
CREATE INDEX IF NOT EXISTS idx_rooms_chat_last_updated ON rooms(room_chat_last_updated);

-- Index for scenario winner queries
CREATE INDEX IF NOT EXISTS idx_rooms_scenario_winner_id ON rooms(scenario_winner_id) WHERE scenario_winner_id IS NOT NULL;
