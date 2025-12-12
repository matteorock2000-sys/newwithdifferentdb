# Scenario Voting System Implementation

## Overview

The D&D AI Dungeon Master application already has a comprehensive pre-game scenario voting system implemented. This document provides an overview of the current implementation and suggests potential enhancements.

## Current Implementation

### Backend Components

#### 1. ScenarioVoteService (`app/services/scenarioVoteService.server.ts`)
- **castVote(roomCode, scenarioId, userId, slotIndex)**: Casts a vote for a scenario
- **retractVote(roomCode, scenarioId, userId, slotIndex)**: Retracts a vote for a scenario
- **getScenarioVoteStats(roomCode)**: Gets scenario statistics with vote counts
- **getUserVotingStatus(roomCode, userId)**: Gets user's voting status for all scenarios
- **clearScenarioVotes(roomCode)**: Clears all votes for a scenario set

Key Features:
- Per-slot voting (each player can vote once per character slot)
- Automatic vote retraction when changing votes
- Validation to prevent multiple votes from the same slot
- Support for "Regenerate" votes (special scenario ID)

#### 2. API Endpoints

**GET `/api/room/scenarios?roomCode=CODE`**
- Returns scenarios for voting with vote counts
- Used for real-time updates

**GET `/api/room/votes?roomCode=CODE`**
- Returns all votes cast in the room
- Used for real-time vote polling

**POST `/api/room/votes`**
- Casts votes (handled via game route action)

### Frontend Components

#### 1. ScenarioSelector (`app/components/ScenarioSelector.tsx`)

Key Features:
- Displays scenarios with vote counts
- Per-slot voting interface
- Real-time vote updates via polling
- Tiebreaker dice rolling system
- Regenerate voting functionality

#### 2. Game Route (`app/routes/game.tsx`)

Handles:
- Scenario generation
- Vote casting and retraction
- Room status management
- Real-time updates

### Voting Logic

1. **Slot-Based Voting**: Each player can vote once per character slot they control
2. **Vote Validation**: Prevents multiple votes from the same slot
3. **Auto-Retraction**: Automatically retracts previous votes when changing selection
4. **Real-Time Updates**: Uses polling to update vote counts across all clients
5. **Tiebreaker System**: Dice rolling to resolve ties when no clear winner

### User Experience

#### For Host:
- Generate scenarios with custom duration and theme
- Monitor voting progress
- Handle tiebreakers with dice rolling

#### For Players:
- Vote for scenarios using their character slots
- View real-time vote counts
- Suggest custom scenarios
- See which slots have voted

## Enhancement Suggestions

### 1. Add Vote Retraction Interface
The backend supports vote retraction, but the frontend doesn't expose it. Add a "Retract Vote" button next to voted scenarios.

### 2. Improve Visual Feedback
- Add animated transitions when votes are cast
- Highlight scenarios with the most votes
- Show progress bars for vote counts

### 3. Enhanced Tiebreaker System
- Visual dice rolling animation
- Show which players are tied
- Allow manual selection if dice rolling fails

### 4. Voting Analytics
- Show voting history
- Display which players have voted/not voted
- Time remaining for voting (optional timer)

### 5. Better Mobile Support
- Optimize voting buttons for touch
- Improve responsive layout for small screens

### 6. Accessibility Improvements
- Keyboard navigation for voting
- Screen reader support
- High contrast mode

### 7. Advanced Voting Options
- Weighted voting (host gets extra votes)
- Ranked choice voting
- Approval voting (vote for multiple scenarios)

## Technical Architecture

### Data Flow
1. Host generates scenarios → stored in room.scenarios
2. Players cast votes → stored in room.scenarios[].userVotes
3. Real-time updates → polling every 1 second
4. Vote aggregation → calculated from userVotes arrays
5. Winner selection → highest votes or dice tiebreaker

### State Management
- Local state for immediate UI feedback
- Server state for persistence and multi-user sync
- Real-time updates via Supabase subscriptions

### Security Considerations
- Vote validation prevents duplicate votes
- Slot ownership verification
- User authentication required for voting

## Future Improvements

### 1. Replace Polling with WebSockets
Currently uses HTTP polling every 1 second. Could be enhanced with:
- Supabase realtime subscriptions for instant updates
- Reduced server load
- Better real-time experience

### 2. Add Voting Time Limits
- Configurable voting time limits
- Automatic tiebreaker after timeout
- Visual countdown timer

### 3. Enhanced Scenario Display
- Scenario images/avatars
- Expanded scenario details
- Preview maps or locations

### 4. Voting History
- Track voting patterns
- Show previous session winners
- Player voting statistics

### 5. Integration with Character Stats
- Vote based on character preferences
- Align scenarios with party composition
- Character-based scenario weighting

## Conclusion

The current voting system is robust and feature-complete for basic scenario selection. The main areas for improvement are:
1. User interface polish and visual feedback
2. Real-time communication optimization
3. Additional voting mechanics and options
4. Mobile and accessibility improvements

The system provides a solid foundation for pre-game scenario selection and can be enhanced incrementally based on user feedback and requirements.
