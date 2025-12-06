-- Migration: Add avatar_url column to characters table
-- This ensures backward compatibility with existing character records

ALTER TABLE characters ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Comment: Existing records will have avatar_url as NULL until portraits are generated
-- This is safe to run multiple times due to IF NOT EXISTS clause