# Turn Change Notifications - Visual Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     DICE ROLLING IN PROGRESS                     │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────┐
│  Database Updated                │
│  - dice_rolling_state changed    │
│  - currentPlayerIndex updated    │
│  - rolls updated                 │
└──────────────────────┬───────────┘
                       │
                       ▼
┌──────────────────────────────────┐
│ Realtime Subscription Fires      │
│ (subscribeToRoomChanges)         │
│ - type: 'dice_updated'           │
│ - data includes new state        │
└──────────────────────┬───────────┘
                       │
                       ▼
┌──────────────────────────────────────────┐
│ useScenarioDice Hook Receives Update    │
│ - previousDiceState: null/old state     │
│ - diceState: new state                  │
│ - diceRolls: updated rolls              │
└──────────────────────┬───────────────────┘
                       │
                       ▼
        ┌──────────────────────────┐
        │ detectTurnChange()       │
        │ Compare old vs new state │
        │                          │
        │ Returns:                 │
        │ - isMyTurn: boolean      │
        │ - turnChanged: boolean   │
        │ - playerName: string     │
        │ - changeType: enum       │
        └──────────┬───────────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
       ▼                       ▼
   ┌────────────┐       ┌──────────────┐
   │ Show Toast │       │ Play Sound   │
   │            │       │              │
   │ "🎲 Your   │       │ Two-tone for │
   │ turn to    │       │ your turn    │
   │ roll!"     │       │ Beep for     │
   │            │       │ others       │
   └────────────┘       │ Chime for    │
                        │ completion   │
                        └──────────────┘
       │                       │
       └───────────┬───────────┘
                   │
                   ▼
    ┌──────────────────────────────┐
    │ Update TiebreakerDice        │
    │ Component Re-render          │
    │                              │
    │ - Current turn indicator     │
    │ - Player status cards update │
    │ - Animations trigger         │
    │ - Visual highlights apply    │
    └──────────────────────────────┘
                   │
                   ▼
    ┌──────────────────────────────┐
    │ Visual Update Complete       │
    │                              │
    │ ✅ Toast visible            │
    │ ✅ Sound playing            │
    │ ✅ Animations running       │
    │ ✅ Player knows whose turn  │
    └──────────────────────────────┘
```

---

## Component Layout During Turn

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 🎯 CURRENT TURN INDICATOR                           │   │
│  │ ┌───────────────────────────────────────────────┐   │   │
│  │ │ Player: Aragorn is rolling!                  │   │   │
│  │ │ Status: 🎲 (spinning animation)              │   │   │
│  │ │ Progress: 2/4 players have rolled            │   │   │
│  │ │ [YOUR TURN MESSAGE if applicable]            │   │   │
│  │ └───────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  PLAYER STATUS CARDS (Grid Layout)                          │
│  ┌──────────────┬──────────────┬──────────────┐             │
│  │ Player 1     │ Player 2     │ Player 3     │             │
│  │ (Rolled)     │ (ROLLING)    │ (Waiting)    │             │
│  │              │              │              │             │
│  │ ✅ 15        │ 🎲           │ ⏳            │             │
│  │              │ (gold glow)  │              │             │
│  │              │ animate      │              │             │
│  │              │ -pulse       │              │             │
│  │              │              │              │             │
│  │ Green badge  │ Gold border  │ Gray badge   │             │
│  │ "Rolled"     │ "Now Rolling"│ "Waiting"    │             │
│  └──────────────┴──────────────┴──────────────┘             │
│                                                             │
│  [ Player 4: (Waiting) ... similar to Player 3 ]            │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ 📋 STATUS BAR                                       │   │
│  │ Rolled: 1/4 | Ready: 0/4 | Status: Rolling...      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Notification Timeline

```
0ms      Turn change event fires from server
         │
100ms    Realtime subscription notified
         │
         ├─► detectTurnChange() executed
         │
200ms    ├─► showToast() called
         │   └─► Toast appears on screen
         │
         ├─► playTurnChangeSound() called
         │   └─► Audio starts playing (0.1-0.4s duration)
         │
300ms    └─► Component re-render triggered
             ├─► Current player highlight updates
             ├─► Animations start
             └─► Status badges change

        [Optimal: all changes within 500ms]
```

---

## State Tracking Variables

```
useScenarioDice Hook State:

┌─────────────────────────────────────────┐
│ diceState: DiceRollingState | null      │
├─────────────────────────────────────────┤
│ {                                       │
│   status: 'rolling'                     │
│   currentPlayerIndex: 2                 │
│   players: [...]                        │
│   rolls: { 0: 15, 1: 12 }               │
│   winner: null                          │
│ }                                       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ previousDiceState: DiceRollingState     │
├─────────────────────────────────────────┤
│ {                                       │
│   status: 'rolling'                     │
│   currentPlayerIndex: 1          ◄─ Different!
│   players: [...]                        │
│   rolls: { 0: 15 }                      │
│   winner: null                          │
│ }                                       │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ lastNotifiedTurnIndex: number = 1       │
├─────────────────────────────────────────┤
│ Prevents duplicate notifications        │
│ for the same turn                       │
└─────────────────────────────────────────┘

Comparison Result:
✅ currentPlayerIndex changed: 1 → 2
✅ New player: check if it's current user
✅ Generate appropriate notification
✅ Update previousDiceState to current
```

---

## Toast Notification Types

```
YOUR TURN NOTIFICATION
┌─────────────────────────────────────┐
│ 🎲 Your turn to roll!              │
│ (Blue background, info style)       │
│ Duration: 4 seconds (longer!)       │
│ Auto-dismiss: Yes                   │
│ Sound: Two-tone ascending/descending│
│ Importance: CRITICAL               │
└─────────────────────────────────────┘

OTHER PLAYER NOTIFICATION
┌─────────────────────────────────────┐
│ Aragorn is rolling...              │
│ (Blue background, info style)       │
│ Duration: 2 seconds                 │
│ Auto-dismiss: Yes                   │
│ Sound: Quiet beep                   │
│ Importance: INFORMATIONAL           │
└─────────────────────────────────────┘

COMPLETION NOTIFICATION
┌─────────────────────────────────────┐
│ ✅ All rolls complete!             │
│ (Green background, success style)   │
│ Duration: 3 seconds                 │
│ Auto-dismiss: Yes                   │
│ Sound: Success arpeggio              │
│ Importance: IMPORTANT               │
└─────────────────────────────────────┘
```

---

## Audio Cue Waveforms

```
YOUR TURN SOUND
│
│     ╱╲      ╱╲
│    ╱  ╲    ╱  ╲
│   ╱    ╲  ╱    ╲
│  ╱      ╲╱      ╲
├─────────────────────── Time
│ Ascending (0-0.2s)  Descending (0.2-0.4s)
│ 600→800 Hz          800→600 Hz
│ Gain: 0.15          Gain: 0.15

[Pleasing, attention-grabbing, not jarring]


OTHER PLAYER SOUND
│     ╱╲
│    ╱  ╲
│   ╱    ╲
│  ╱      ╲
├─────────── Time
│   Single tone
│   500 Hz for 0.15s
│   Gain: 0.05
[Subtle, doesn't distract]


COMPLETION SOUND (Arpeggio)
│  ╱╲    ╱╲    ╱╲
│ ╱  ╲  ╱  ╲  ╱  ╲
│╱    ╲╱    ╲╱    ╲
├────────────────────── Time
│ C    E    G
│ 262  330  392 Hz
│ 0.1s each, 0.1 gain
[Success/completion feeling]
```

---

## Animation CSS Classes

```
Pulsing Glow (Current Turn)
@keyframes glow {
  0%, 100% {
    box-shadow: 0 0 20px rgba(234, 179, 8, 0.5);
  }
  50% {
    box-shadow: 0 0 40px rgba(234, 179, 8, 0.8);
  }
}

Spinning Dice
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
animation: spin 2s linear infinite;

Bouncing Message
@keyframes bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-10px); }
}
animation: bounce 1s infinite;
```

---

## Turn Change Scenarios

```
SCENARIO 1: Initial Start
├─ Player 1's turn (first)
├─ Notification: Show toast
├─ Sound: Your turn sound (if player 1 is current user)
└─ Visual: Player 1 card highlights

SCENARIO 2: Sequential Turn
├─ Player 1 rolled, now Player 2's turn
├─ Previous: currentPlayerIndex = 0
├─ Current: currentPlayerIndex = 1
├─ Notification: "Player 2 is rolling..."
├─ Sound: Your turn sound (if player 2 is current user)
└─ Visual: Player 1 badge → "Rolled", Player 2 → glow

SCENARIO 3: All Completed
├─ Player 4 just rolled
├─ All 4 players have rolled
├─ Notification: "✅ All rolls complete!"
├─ Sound: Success chime
└─ Visual: All cards show results, glow disappears

SCENARIO 4: Edge Case - User Returns to Page
├─ Page was minimized during turn sequence
├─ Multiple turns may have occurred
├─ Solution: previousDiceState is null on mount
├─ Only notify on next NEW state change
└─ No spam of "missed" notifications
```

---

## Mobile Layout (Responsive)

```
DESKTOP (lg breakpoint)
┌─────────────────────────────────────────┐
│ Current Turn Indicator (full width)     │
└─────────────────────────────────────────┘

Player Cards (3 columns)
┌──────────┬──────────┬──────────┐
│ P1       │ P2       │ P3       │
├──────────┼──────────┼──────────┤
│ P4       │          │          │
└──────────┴──────────┴──────────┘

Dice Box (full width)
┌─────────────────────────────────────────┐
│ Dice rolling interface                  │
└─────────────────────────────────────────┘

────────────────────────────────────────

TABLET (md breakpoint)
┌─────────────────────────────────────────┐
│ Current Turn Indicator (full width)     │
└─────────────────────────────────────────┘

Player Cards (2 columns)
┌──────────────┬──────────────┐
│ P1           │ P2           │
├──────────────┼──────────────┤
│ P3           │ P4           │
└──────────────┴──────────────┘

────────────────────────────────────────

MOBILE (sm - default)
┌─────────────────────────────────────────┐
│ Current Turn Indicator (full width)     │
└─────────────────────────────────────────┘

Player Cards (1 column - stack)
┌─────────────────────────────────────────┐
│ P1                                      │
├─────────────────────────────────────────┤
│ P2                                      │
├─────────────────────────────────────────┤
│ P3                                      │
├─────────────────────────────────────────┤
│ P4                                      │
└─────────────────────────────────────────┘

Glow effect still visible on all sizes
Animations run smoothly
Touch-friendly sizing
```

---

## Error Handling Flow

```
Audio Context Creation
├─ Try to create AudioContext
├─ If fails (not supported):
│  └─ Log warning, continue without sound
├─ If succeeds:
│  ├─ Store in global audioContext
│  └─ Ready to play sounds
└─ Every sound wrapped in try-catch

Turn Detection
├─ Compare states
├─ If comparison fails:
│  └─ Log error, continue
├─ If comparison succeeds:
│  ├─ Generate notification
│  └─ Continue normally
└─ Never crash the UI

Toast Display
├─ showToast() called
├─ If provider not available:
│  └─ Log error, skip (graceful degrade)
├─ If available:
│  └─ Show toast normally
└─ App continues regardless

Accessibility
├─ Missing animations:
│  └─ Browser still functional
├─ Missing sound:
│  └─ Visual indicators still clear
├─ No ARIA labels:
│  └─ Screen reader uses fallback text
└─ Everything degrades gracefully
```

---

## Performance Considerations

```
Optimization Points:

1. Memoization
   ├─ detectTurnChange() pure function
   └─ Can be memoized if needed

2. Audio Nodes
   ├─ Create fresh oscillators each play
   ├─ Clean up after use
   └─ No memory leaks

3. Component Re-renders
   ├─ Only TiebreakerDice re-renders
   ├─ Parent components unchanged
   └─ Minimal performance impact

4. Animation Performance
   ├─ Use CSS animations (GPU accelerated)
   ├─ Not JS animations
   └─ Smooth 60fps target

5. Event Listeners
   ├─ Unsubscribe on unmount
   ├─ No lingering listeners
   └─ Clean cleanup

Expected Impact: < 2% CPU, < 5MB memory
```

---

## Browser Compatibility Matrix

```
Feature                  Chrome  Firefox  Safari  Edge   IE11
─────────────────────────────────────────────────────────────
Web Audio API              ✅      ✅       ✅     ✅     ❌
Oscillator/Gain            ✅      ✅       ✅     ✅     ❌
CSS Animations             ✅      ✅       ✅     ✅     ⚠️
Flexbox                    ✅      ✅       ✅     ✅     ⚠️
React Hooks                ✅      ✅       ✅     ✅     ❌
Toast Notifications        ✅      ✅       ✅     ✅     ✅
─────────────────────────────────────────────────────────────
Overall Support           ✅      ✅       ✅     ✅     ⚠️

Fallback Strategy for Unsupported Browsers:
- Disable sound (continue without Audio API)
- Show text-based notifications instead of styled toasts
- Disable CSS animations (use static display)
- All core functionality remains operational
```

