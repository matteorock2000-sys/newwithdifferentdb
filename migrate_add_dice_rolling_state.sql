ALTER TABLE rooms
ADD COLUMN dice_rolling_state JSONB DEFAULT '{
  "status": "not-started",
  "currentPlayerIndex": 0,
  "players": [],
  "rolls": {},
  "winner": null
}';
