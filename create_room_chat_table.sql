-- Create room_chat table for real-time chat functionality
CREATE TABLE room_chat (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(10) NOT NULL REFERENCES rooms(code) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    username VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    message_type VARCHAR(20) DEFAULT 'text' CHECK (message_type IN ('text', 'scenario_suggestion', 'system', 'notification')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraint to ensure expires_at is after created_at when set
    CONSTRAINT chk_expires_after_created CHECK (expires_at IS NULL OR expires_at > created_at)
);

-- Create indexes for efficient querying
CREATE INDEX idx_room_chat_code ON room_chat(code);
CREATE INDEX idx_room_chat_created_at ON room_chat(created_at);
CREATE INDEX idx_room_chat_code_created_at ON room_chat(code, created_at);
CREATE INDEX idx_room_chat_scenario_suggestions ON room_chat(code, message_type, expires_at) WHERE message_type = 'scenario_suggestion';

-- Enable Row Level Security (RLS)
ALTER TABLE room_chat ENABLE ROW LEVEL SECURITY;

-- Create policies for room_chat table
-- Users can insert messages in rooms they have access to
CREATE POLICY "Users can insert chat messages" ON room_chat
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM rooms 
            WHERE rooms.code = room_chat.code 
            AND (
                rooms.owner_id = room_chat.user_id
                OR (
                    participants IS NOT NULL 
                    AND jsonb_typeof(participants) = 'array'
                    AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements(participants::jsonb) elem 
                        WHERE elem->>'userId' = room_chat.user_id::text
                    )
                )
                OR room_chat.message_type = 'scenario_suggestion'  -- Allow toast notifications for scenario suggestions
            )
        )
    );

-- Users can view chat messages from rooms they have access to
CREATE POLICY "Users can view room chat" ON room_chat
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM rooms 
            WHERE rooms.code = room_chat.code 
            AND (
                rooms.owner_id = auth.uid()
                OR (
                    participants IS NOT NULL 
                    AND jsonb_typeof(participants) = 'array'
                    AND EXISTS (
                        SELECT 1 FROM jsonb_array_elements(participants::jsonb) elem 
                        WHERE elem->>'userId' = auth.uid()::text
                    )
                )
                OR room_chat.message_type = 'scenario_suggestion'  -- Allow viewing toast notifications
            )
        )
    );

-- Users can only delete their own messages (with time limit)
CREATE POLICY "Users can delete own messages" ON room_chat
    FOR DELETE USING (
        user_id = auth.uid() 
        AND created_at > NOW() - INTERVAL '1 hour'
    );

-- Add comments for documentation
COMMENT ON TABLE room_chat IS 'Real-time chat messages for game rooms';
COMMENT ON COLUMN room_chat.message_type IS 'Type of message: text, scenario_suggestion, system, or notification';
COMMENT ON COLUMN room_chat.expires_at IS 'Optional expiration time for temporary messages like notifications';