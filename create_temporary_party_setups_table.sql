CREATE TABLE temporary_party_setups (
    userId TEXT PRIMARY KEY,
    party_slots JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
