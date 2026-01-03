# Turn-Based Dice - Implementation Checklist

## Phase 1: Core Turn Detection & Notifications
- [ ] **useScenarioDice.ts - State Variables**
  - [ ] Add `previousDiceState` state (track last known state)
  - [ ] Add `lastNotifiedTurnIndex` state (prevent duplicate notifications)
  - [ ] Add `diceCompleted` state (track completion status)

- [ ] **useScenarioDice.ts - Turn Detection Logic**
  - [ ] Create `detectTurnChange()` utility function
  - [ ] Compare `currentPlayerIndex` between old and new state
  - [ ] Identify change type: started, changed, or completed
  - [ ] Determine if change affects current user
  - [ ] Return change metadata for notification

- [ ] **useScenarioDice.ts - Enhanced Notifications**
  - [ ] When it's user's turn: `showToast('🎲 Your turn to roll!', 'info')`
  - [ ] When other player's turn: `showToast('[Name] is rolling...', 'info')`
  - [ ] When dice complete: `showToast('✅ All rolls complete!', 'success')`
  - [ ] Verify no duplicate notifications for same turn
  - [ ] Set correct toast duration per notification type

- [ ] **useScenarioDice.ts - Update Realtime Subscription**
  - [ ] Move turn detection inside subscription callback
  - [ ] Update `previousDiceState` after each notification
  - [ ] Track last notified turn index
  - [ ] Call `playTurnChangeSound()` for turn changes

- [ ] **Integration Test**
  - [ ] Verify notifications appear on turn changes
  - [ ] Verify no duplicates for same turn
  - [ ] Verify correct message for each scenario
  - [ ] Verify timing (notifications within 500ms)

---

## Phase 2: Visual Enhancements & Animations
- [ ] **TiebreakerDice.tsx - Enhanced Current Turn Indicator**
  - [ ] Upgrade styling with gradient background
  - [ ] Change from `bg-yellow-900` to gradient
  - [ ] Add golden glow shadow: `shadow-lg shadow-yellow-600/50`
  - [ ] Add pulse animation: `animate-pulse`
  - [ ] Add spinning dice icon: `<div className="animate-spin">🎲</div>`
  - [ ] Larger font size for character name
  - [ ] Add "👉 It's your turn!" message with `animate-bounce`

- [ ] **TiebreakerDice.tsx - Player Status Cards**
  - [ ] Add conditional styling for current player:
    - [ ] `border-2 border-yellow-400` when current
    - [ ] `shadow-lg shadow-yellow-600/50` glow
    - [ ] Slightly darker background
    - [ ] `animate-pulse` effect
  - [ ] Add turn indicator badge:
    - [ ] Position in top-right of card
    - [ ] Content: "Now Rolling!" / "Up Next!" / "Completed"
    - [ ] Color based on state (gold/gray/green)
  - [ ] Enhance roll result display:
    - [ ] Highlight with yellow when just rolled
    - [ ] Animation when result appears

- [ ] **TaiwindCSS Configuration (if needed)**
  - [ ] Check if `animate-pulse` exists (it does by default)
  - [ ] Add custom `animate-glow` if needed:
    ```
    animation: glow 2s ease-in-out infinite
    ```
  - [ ] Add custom `animate-spin-slow` if needed:
    ```
    animation: spin 3s linear infinite
    ```

- [ ] **Optional: Turn Order Timeline**
  - [ ] Add visual timeline at top of player cards
  - [ ] Show completed turns with checkmarks
  - [ ] Show current turn with highlight
  - [ ] Show pending turns with numbers

- [ ] **Visual Testing**
  - [ ] Current player card has prominent glow
  - [ ] Animation smooth and not flickering
  - [ ] Mobile responsive (glow visible on all sizes)
  - [ ] Colors clear and accessible
  - [ ] No visual glitches on turn transitions

---

## Phase 3: Sound Enhancements
- [ ] **useScenarioDice.ts - Two-Tone Your Turn Sound**
  - [ ] Create `playYourTurnSound()` function
  - [ ] First tone: 600→800 Hz over 0.2s (ascending)
  - [ ] Second tone: 800→600 Hz over 0.2s (descending)
  - [ ] Gain: 0.15 (louder than current)
  - [ ] Test for jarring/pleasant balance

- [ ] **useScenarioDice.ts - Other Player Beep**
  - [ ] Create `playOtherPlayerSound()` function
  - [ ] Single tone: 500 Hz for 0.15s
  - [ ] Gain: 0.05 (quiet, doesn't distract)
  - [ ] Only play if not user's own turn

- [ ] **useScenarioDice.ts - Completion Chime**
  - [ ] Create `playCompletionSound()` function
  - [ ] Arpeggio: C (262) → E (330) → G (392) Hz
  - [ ] Each note: 0.1s
  - [ ] Gain: 0.1
  - [ ] Conveys "success" feel

- [ ] **useScenarioDice.ts - Update Turn Detection**
  - [ ] Call `playYourTurnSound()` when user's turn
  - [ ] Call `playOtherPlayerSound()` when other player
  - [ ] Call `playCompletionSound()` when all rolled
  - [ ] Wrap in try-catch for browser compatibility

- [ ] **Audio Testing**
  - [ ] Test each sound plays without errors
  - [ ] Test browser console for warnings
  - [ ] Test different browser compatibility
  - [ ] Verify volume levels (not jarring)
  - [ ] Test graceful fallback if Web Audio unavailable

---

## Phase 4: Polish & Testing (Optional)
- [ ] **Settings Panel (Optional)**
  - [ ] Add settings button to TiebreakerDice component
  - [ ] Toggle sounds on/off
  - [ ] Volume slider (0-100%)
  - [ ] Test/preview button for each sound
  - [ ] Save preferences to localStorage

- [ ] **Accessibility**
  - [ ] Add ARIA labels for animations
  - [ ] Add screen reader announcements
  - [ ] Test with screen reader
  - [ ] Ensure color not only distinguisher
  - [ ] Test with high contrast mode

- [ ] **Performance**
  - [ ] No memory leaks from event listeners
  - [ ] Animations don't cause jank (60fps target)
  - [ ] No unnecessary re-renders
  - [ ] Profile with DevTools if needed

- [ ] **Edge Cases**
  - [ ] Test first player turn
  - [ ] Test last player turn
  - [ ] Test all players rolled
  - [ ] Test turn change while viewing other UI
  - [ ] Test multiple rapid turn changes

---

## Testing Scenarios

### Scenario 1: Basic Turn Change
- [ ] Player 1 rolls d20, result appears
- [ ] Toast shows "[Player 2] is rolling..."
- [ ] Sound plays (if enabled)
- [ ] Player 2's card highlights with glow
- [ ] Current turn indicator updates

### Scenario 2: Your Turn Notification
- [ ] Current player index reaches your slot
- [ ] Toast shows "🎲 Your turn to roll!" immediately
- [ ] Sound plays two-tone cue
- [ ] Your card gets strong visual highlight
- [ ] Dice box is ready for you to roll

### Scenario 3: Completion
- [ ] Last player rolls
- [ ] Toast shows "✅ All rolls complete!"
- [ ] Success sound plays
- [ ] All cards show results
- [ ] Winner determined and announced

### Scenario 4: Multiple Rapid Changes
- [ ] Players roll quickly in succession
- [ ] Each gets proper notification
- [ ] No duplicate toasts
- [ ] Visual indicators update smoothly
- [ ] No memory issues

---

## Code Review Checklist

- [ ] No console errors or warnings
- [ ] No TypeScript errors
- [ ] Code follows existing patterns
- [ ] Comments added for complex logic
- [ ] No hardcoded values (use constants)
- [ ] Proper error handling
- [ ] No memory leaks
- [ ] Works in all target browsers
- [ ] Mobile responsive
- [ ] Accessible

---

## Deployment Checklist

- [ ] All phases implemented
- [ ] All tests passing
- [ ] No regressions in other features
- [ ] Performance acceptable
- [ ] Accessibility approved
- [ ] User testing complete
- [ ] Documentation updated
- [ ] Ready for production

---

## Files Modified Summary

| File | Phase | Type | Changes |
|------|-------|------|---------|
| `app/hooks/useScenarioDice.ts` | 1-3 | MODIFIED | State tracking, turn detection, notifications, sounds |
| `app/components/TiebreakerDice.tsx` | 2 | MODIFIED | Visual enhancements, animations, styling |
| `tailwind.config.ts` | 2 | MODIFIED | Custom animations (if needed) |
| `app/utils/toast.tsx` | 1 | NO CHANGE | Already supports features needed |
| `.types.ts` | ALL | NO CHANGE | Already has needed types |

---

## Success Indicators

✅ **Turn Detection**: Notifications appear within 500ms of turn change
✅ **Visual Clarity**: Current player always obvious
✅ **Audio Quality**: Distinct sounds for different events
✅ **User Experience**: No confusion about whose turn it is
✅ **Performance**: No lag or jank during transitions
✅ **Accessibility**: Usable by all, including with disabilities
✅ **Reliability**: No console errors, graceful fallbacks
✅ **Mobile**: Works perfectly on phones and tablets

---

## Rollback Instructions

If issues found post-deployment:
1. Comment out `playTurnChangeSound()` calls in useScenarioDice.ts
2. Remove animation classes from TiebreakerDice.tsx
3. Simplify CSS back to original if tailwind changes made
4. Revert to previous commit if major issues
5. No database changes needed (all client-side)

---

## Documentation to Update

- [ ] TURN_CHANGE_NOTIFICATIONS_PLAN.md (this file)
- [ ] Add usage examples to component comments
- [ ] Add sound cue documentation
- [ ] Update component prop documentation
- [ ] Add accessibility notes
- [ ] Add browser compatibility notes

