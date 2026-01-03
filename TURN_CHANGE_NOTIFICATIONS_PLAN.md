# Turn-Based Dice Box - Enhanced Notifications & Visual Indicators Plan

## Overview
Implement comprehensive turn change detection, notifications, and visual indicators for the tiebreaker dice rolling system. When a player's turn comes up in the dice rolling sequence, they should be prominently notified with toast messages, visual highlights, optional sound cues, and turn indicators.

---

## Detailed Implementation Plan

### 1. **useScenarioDice.ts - Turn Change Detection Enhancement**

#### Current State
- Hook already has basic turn change detection in the realtime subscription callback (lines 81-105)
- Currently plays a sound and shows a basic toast when it's the user's turn
- Sound generation is implemented but needs refinement

#### Required Changes

**1.1: Enhanced Turn Change Detection Logic**
- Track previous turn state to detect transitions
- Detect both "turn is now mine" and "turn has moved to someone else" events
- Create a previous state reference to compare against new state
- Identify all types of turn transitions:
  - Initial turn start (first player's turn)
  - Sequential turn changes (player → next player)
  - Turn completion (all players rolled → completion)

**1.2: Specific Notifications**
- When current user's turn comes up:
  - Toast: "🎲 Your turn to roll!" (info type, 4 seconds)
  - Secondary toast: "Roll a d20!" (optional, same duration)
  - Play sound notification
  - Set flag for UI animation trigger

- When other players' turns come up:
  - Toast: "[Character Name] is now rolling..." (info type, 2 seconds)
  - Optional: Subtle notification without sound

- When dice rolling completes:
  - Toast: "✅ All players have rolled!" (success type, 3 seconds)

**1.3: Turn Change Sound Refinement**
- Current implementation: Single tone sweep (800→400 Hz over 0.3s)
- Enhance with:
  - Two-tone notification for "your turn": ascending tone (400→800 Hz) + descending tone (800→400 Hz)
  - Single tone for other player turns: short beep
  - Victory chime for completion
  - Volume control consideration (currently 0.1 gain)

**1.4: State Tracking Variables** (add to hook)
```typescript
const [previousDiceState, setPreviousDiceState] = useState<DiceRollingState | null>(null);
const [lastNotifiedTurnIndex, setLastNotifiedTurnIndex] = useState<number>(-1);
const [diceCompleted, setDiceCompleted] = useState(false);
```

**1.5: Turn Detection Function** (new)
```typescript
const detectTurnChange = (
  newState: DiceRollingState | null,
  newRolls: Record<number, number>,
  previousState: DiceRollingState | null
): {
  isMyTurn: boolean;
  turnChanged: boolean;
  currentPlayerName: string;
  completionType: 'started' | 'changed' | 'completed' | null;
} => {
  // Implementation logic...
}
```

---

### 2. **TiebreakerDice.tsx - Current Turn Indicator Enhancement**

#### Current State
- Already has current turn indicator (lines 162-181)
- Shows basic yellow border and character name
- Has "Your turn to roll!" message for current player
- Displays progress metrics

#### Required Changes

**2.1: Enhanced Current Turn Display**
- Upgrade visual prominence with animated glow effect
- Add animated crown icon or turn order badge
- Display larger, more readable indicator
- Show whose turn it is in multiple places for clarity

**2.2: Current Turn Indicator Component** (new section)
- Location: Prominent header area or floating badge
- Content: "[Character Name] is rolling! 🎲"
- Animation: Pulsing glow, rotating dice icon
- Accessibility: Status message for screen readers
- Conditional styling based on:
  - Is current player: Bright highlight + glow
  - Is other player: Neutral styling + waiting message
  - Is current user: Additional emphasis/animation

**2.3: Player Status Cards Enhancement**
- Current implementation (lines 139-160):
  - Shows "Rolled" or "Waiting" status
  - Shows roll result if available
  - Shows "Your turn to roll!" for current user

- Enhancements:
  - Add visual indicator for current turn player
    - Thick animated border (gold/yellow)
    - Background color highlight
    - Spinning dice icon overlay
  - Add rank/position indicator (1st to roll, 2nd, etc.)
  - Animate entry/exit for current turn player
  - Highlight last rolled result with animation

**2.4: Turn Order Timeline** (optional enhancement)
- Visual representation of turn order at top of page
- Show current position in sequence
- Show completed turns with checkmarks
- Show pending turns with next icon

**2.5: CSS Animations to Add** (TailwindCSS)
```
- glow-pulse: Pulsing outer glow effect
- spin-slow: Slower rotation for dice icon
- bounce-highlight: Highlight that pulses up/down
- slide-in: Card animation when turn is current
```

---

### 3. **Player Status Cards - Visual Enhancements**

#### Current Implementation
- Grid layout showing all players (lines 139-160)
- Status badges ("Rolled" / "Waiting")
- Roll results display

#### Enhancements

**3.1: Current Turn Styling**
```tsx
// For current turn player:
border: 2px solid gold / border-yellow-400
background: Slightly darker with golden tint
box-shadow: Glowing effect (shadow-lg + custom)
animation: pulse/glow effect
icon: Spinning dice 🎲 in corner

// For other players:
border: 1px solid gray (normal)
background: Normal gray-700
```

**3.2: Conditional Animation Classes**
- `animate-pulse` when it's their turn (already present, good!)
- Add `animate-glow` for additional emphasis
- Add spin animation to dice icon

**3.3: Turn Indicator Badge**
- Position: Top-right of card
- Content: "Now Rolling!" or "Up Next!" or "Completed"
- Colors:
  - Gold for current turn
  - Gray for pending
  - Green for completed
  - Different color if it's current user

---

### 4. **Toast Notifications - Enhanced Messages**

#### Current Patterns (from toast.tsx)
- Types: success, error, info, warning
- Auto-hide: 3 seconds
- Position: top-right fixed
- Color-coded by type

#### New Toast Strategy

**4.1: Turn Notifications**
```typescript
// Your turn - immediate, emphasizing action needed
showToast('🎲 Your turn to roll!', 'info')    // 4 seconds

// Other player's turn - informational
showToast(`${characterName} is rolling...`, 'info')  // 2 seconds

// Completion
showToast('✅ All rolls complete!', 'success')  // 3 seconds
```

**4.2: Toast Duration Strategy**
- User's turn: 4 seconds (longer to ensure they see it)
- Other player: 2 seconds (quick info)
- Completion: 3 seconds (medium priority)
- Override: All can be manually dismissed

**4.3: Emoji Integration**
- 🎲 Dice icon for turn changes
- 🎯 Target for current turn
- ✅ Check for completion
- 👀 Eyes for "watching" other players
- 📢 Megaphone for announcements

---

### 5. **Sound Cues - Audio Enhancements**

#### Current Implementation
- Uses Web Audio API (lines 186-205 in useScenarioDice.ts)
- Creates oscillator with frequency sweep
- Gain envelope (0.1 to 0.01 over 0.3s)
- Single tone: 800→400 Hz

#### Enhanced Sound Strategy

**5.1: Sound Types**

```typescript
enum TurnChangeSound {
  YOUR_TURN,        // Two ascending tones (attention-grabbing)
  OTHER_PLAYER,     // Single short beep
  ROUND_COMPLETE,   // Ascending arpeggio
  DICE_ROLLING,     // Periodic chirp
}
```

**5.2: Sound Implementations**

- **Your Turn (HIGH PRIORITY)**
  - Tone 1: 600 Hz for 0.2s, ascending to 800 Hz
  - Tone 2: 800 Hz for 0.2s, descending to 600 Hz
  - Total duration: 0.4s
  - Gain: 0.15 (slightly louder than others)

- **Other Player Turn (LOW PRIORITY)**
  - Single tone: 500 Hz for 0.15s
  - Gain: 0.05 (quiet, doesn't distract owner)

- **Round Complete (SUCCESS)**
  - Arpeggio: C (262 Hz) → E (330 Hz) → G (392 Hz)
  - Each note: 0.1s
  - Total: 0.3s
  - Gain: 0.1

- **Dice Rolling (LOOP - optional)**
  - White noise with envelope (0.05 gain)
  - While dice are rolling
  - Fade in/out

**5.3: User Preferences** (optional)
- Add settings to disable/enable sounds
- Volume slider (0-100%)
- Different intensity levels
- Test button to preview sounds

**5.4: Browser Compatibility**
- Web Audio API with webkit fallback (already implemented)
- Graceful fallback if API unavailable
- Try-catch wrapping

---

### 6. **Integration Flow**

#### Sequence Diagram: Turn Change Event

```
1. Server updates dice_rolling_state in database
   ↓
2. Realtime subscription fires with updated data
   ↓
3. useScenarioDice detects turn change
   ├─ Compare currentPlayerIndex with previous
   ├─ Identify if it's user's turn
   └─ Identify change type (started/changed/completed)
   ↓
4. Show appropriate toast notification
   ├─ Your turn: emphasized message
   └─ Other player: informational message
   ↓
5. Play audio cue (if user's turn or completion)
   ├─ Your turn: two-tone ascending sound
   ├─ Other: quiet beep
   └─ Complete: success chime
   ↓
6. Update TiebreakerDice component
   ├─ Current turn indicator updates
   ├─ Player status cards re-render
   ├─ Animations trigger
   └─ Visual highlights apply
   ↓
7. Continue to next player or show completion
```

---

## Implementation Priority

### Phase 1 (CRITICAL)
1. ✅ Enhanced turn change detection in useScenarioDice.ts
2. ✅ Toast notifications for turn changes
3. ✅ Turn state tracking (previousDiceState)

### Phase 2 (HIGH)
1. ✅ Current turn indicator visual upgrades in TiebreakerDice.tsx
2. ✅ Player status card animations
3. ✅ Visual highlighting for current player

### Phase 3 (MEDIUM)
1. ✅ Sound cue refinement (two-tone for user's turn)
2. ✅ CSS animation additions
3. ✅ Turn order timeline (optional)

### Phase 4 (LOW - Optional)
1. ⚠️ User preferences/settings
2. ⚠️ Sound volume control
3. ⚠️ Advanced animations

---

## Files to Modify

1. **app/hooks/useScenarioDice.ts** (HIGH PRIORITY)
   - Lines 1-50: Add state variables for turn tracking
   - Lines 76-108: Enhance realtime subscription callback
   - Lines 186-205: Improve playTurnChangeSound function
   - NEW: Add detectTurnChange utility function

2. **app/components/TiebreakerDice.tsx** (HIGH PRIORITY)
   - Lines 1-50: Add animation classes/CSS imports
   - Lines 67-90: Enhance header with turn indicator
   - Lines 139-160: Upgrade player status cards
   - NEW: Add CurrentTurnIndicator component
   - NEW: Add turn order timeline (optional)

3. **app/utils/toast.tsx** (LOW PRIORITY - already good)
   - Consider adding toast duration options
   - Add emoji support (already works)
   - Add dismissible option (enhancement)

4. **app/styles** or **tailwind.config.ts** (MEDIUM PRIORITY)
   - Add custom animations:
     - `animate-glow`
     - `animate-glow-pulse`
     - `animate-spin-slow`
   - Add custom shadows for glow effects

---

## Testing Strategy

### Unit Tests
- `detectTurnChange()` function logic
- Sound generation functions (no audio output, just verify calls)
- State tracking accuracy

### Integration Tests
- Realtime subscription → state update → notification flow
- Multiple turn transitions in sequence
- Edge cases: Completion, first turn, last turn

### User Testing
- Notification clarity and timeliness
- Sound cue distinctiveness
- Visual indicator prominence
- Animation smoothness
- Mobile responsiveness

### Accessibility Testing
- Screen reader support for turn indicators
- ARIA labels for animated elements
- Keyboard navigation compatibility
- High contrast mode compatibility

---

## Success Criteria

✅ **Implemented Successfully When:**

1. **Notifications**
   - Toast appears within 500ms of turn change
   - Message is clear and actionable
   - Correct emoji/color for each event type
   - Duration is appropriate for urgency level

2. **Audio Cues**
   - Sound plays on browser without errors
   - Your turn: distinct from others
   - Volume appropriate (not jarring)
   - Can be tested/previewed

3. **Visual Indicators**
   - Current turn player highlighted prominently
   - Animation smooth and not distracting
   - Works on mobile and desktop
   - Accessible to screen readers

4. **Turn Detection**
   - Accurately identifies turn changes
   - No duplicate notifications for same turn
   - Handles edge cases (first, last, completion)
   - No performance impact

5. **Overall UX**
   - Players never confused about whose turn it is
   - Own turn is obviously signaled
   - Game flow remains smooth
   - No console errors or warnings

---

## Code Examples (To Be Implemented)

### Example 1: Enhanced Turn Detection
```typescript
// Detect turn change by comparing states
useEffect(() => {
  if (!previousDiceState || !diceState) return;
  
  const turnChanged = diceState.currentPlayerIndex !== previousDiceState.currentPlayerIndex;
  const completionChanged = diceState.status !== previousDiceState.status;
  
  if (turnChanged || completionChanged) {
    const changeType = detectTurnChange(diceState, diceRolls, previousDiceState);
    // Handle notification...
  }
  
  setPreviousDiceState(diceState);
}, [diceState]);
```

### Example 2: Enhanced Current Turn Indicator
```tsx
{!diceRollComplete && diceState && (
  <div className="relative bg-gradient-to-r from-yellow-900 via-yellow-800 to-yellow-900 
                  border-2 border-yellow-500 rounded-lg p-6 mb-6 
                  shadow-lg shadow-yellow-600/50 animate-pulse">
    <div className="absolute top-2 right-2 text-4xl animate-spin">🎲</div>
    <h2 className="text-2xl font-semibold text-yellow-300 mb-2">
      🎯 Current Turn
    </h2>
    <p className="text-yellow-200 text-lg font-bold">
      {currentPlayer?.characterName} is rolling!
    </p>
    {isCurrentPlayer && (
      <p className="text-yellow-300 mt-2 font-bold animate-bounce">
        👉 It's your turn! Roll now!
      </p>
    )}
  </div>
)}
```

### Example 3: Two-Tone Sound for Your Turn
```typescript
const playYourTurnSound = useCallback(() => {
  if (!audioContext) initializeAudioContext();
  if (!audioContext) return;
  
  try {
    // First tone: ascending (600→800 Hz)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    osc1.frequency.setValueAtTime(600, audioContext.currentTime);
    osc1.frequency.linearRampToValueAtTime(800, audioContext.currentTime + 0.2);
    gain1.gain.setValueAtTime(0.15, audioContext.currentTime);
    gain1.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    osc1.start();
    osc1.stop(audioContext.currentTime + 0.2);
    
    // Second tone: descending (800→600 Hz) starting at 0.2s
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    osc2.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
    osc2.frequency.linearRampToValueAtTime(600, audioContext.currentTime + 0.4);
    gain2.gain.setValueAtTime(0.15, audioContext.currentTime + 0.2);
    gain2.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    osc2.start(audioContext.currentTime + 0.2);
    osc2.stop(audioContext.currentTime + 0.4);
  } catch (e) {
    console.warn('Failed to play your turn sound:', e);
  }
}, [initializeAudioContext]);
```

---

## Dependencies & Requirements

✅ Already Available:
- Web Audio API (modern browsers)
- React hooks (useState, useEffect, useCallback)
- TailwindCSS (animations)
- Toast system (useGlobalToast)
- Realtime subscriptions (subscribeToRoomChanges)
- Types (DiceRollingState, RoomUpdatePayload)

⚠️ May Need:
- Custom animation configuration in tailwind.config.ts
- Additional type definitions if needed
- Sound preference storage (optional)

---

## Rollback Plan

If issues arise:
1. Disable toast notifications: Comment out showToast calls
2. Disable sound: Set audioContext to null
3. Revert visual changes: Remove animation classes
4. All changes are isolated to useScenarioDice.ts and TiebreakerDice.tsx
5. No database/schema changes required

---

## Future Enhancements

1. **Sound Settings Panel**
   - Toggle sounds on/off
   - Volume slider
   - Test/preview buttons

2. **Advanced Animations**
   - Turn order visualization
   - Dice roll physics simulation
   - Particle effects

3. **Performance Optimizations**
   - Memoize tone generation
   - Cache audio nodes
   - Lazy load animations

4. **Accessibility Features**
   - Custom haptic feedback (mobile)
   - Adjustable animation speeds
   - High contrast mode

5. **Statistics Tracking**
   - Roll history display
   - Average/min/max rolls
   - Win predictions

---

## Questions for Clarification

1. Should sound be disabled by default or enabled?
2. Any specific design preferences for the current turn indicator?
3. Should the turn order timeline be included in Phase 2?
4. Preferred animation speed (fast/medium/slow)?
5. Should different themes have different sound pitches?

