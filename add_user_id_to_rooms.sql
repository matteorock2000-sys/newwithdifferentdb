-- SQL script to add the missing 'user_id' column to the 'rooms' table.
-- Execute this script against your database.

ALTER TABLE rooms
ADD COLUMN user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL;

-- Optional: Re-index if necessary, though usually not required for simple column addition
-- CREATE INDEX IF NOT EXISTS idx_rooms_user_id ON rooms (user_id);
