-- Migration: Add avatar_url column to characters table
-- This ensures backward compatibility with existing character records
-- Execute this migration before deploying the updated application code

-- Add avatar_url column to existing characters table
ALTER TABLE characters ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Comment: Existing records will have avatar_url as NULL until portraits are generated
-- This is safe to run multiple times due to IF NOT EXISTS clause
-- The column is nullable to maintain backward compatibility

-- Verification query (can be run after migration):
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'characters' AND column_name = 'avatar_url';