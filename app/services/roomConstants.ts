// Room-related constants to avoid circular dependencies

// Define the threshold for considering a participant active (e.g., last 7 seconds)
export const ACTIVE_THRESHOLD_MS = 7 * 1000; // 7 seconds (Quick cleanup after one missed 5s ping)
export const INACTIVITY_DELETION_MS = 5 * 60 * 1000; // 5 minutes in milliseconds