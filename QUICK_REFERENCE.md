# Turn-Based Dice - Quick Reference Card

## 📋 One-Page Cheat Sheet

### What's Being Built
Turn-change notifications + visual indicators for tiebreaker dice rolling.
When it's your turn: toast + sound + glowing card border.

### When to Use Each Document

| Document | Time | Use For |
|----------|------|---------|
| **PLAN_SUMMARY.md** | 5 min | Quick overview |
| **VISUAL_SUMMARY.md** | 10 min | Visual examples |
| **TURN_CHANGE_NOTIFICATIONS_PLAN.md** | 20 min | Full details |
| **VISUAL_ARCHITECTURE.md** | 15 min | Diagrams & specs |
| **IMPLEMENTATION_CHECKLIST.md** | 30 min | Task breakdown |
| **INDEX.md** | 5 min | Document index |

---

## 🎯 Feature Breakdown

### Toast Notifications
```
YOUR TURN:    🎲 Your turn to roll!     (blue, 4 sec, sound)
OTHER:        [Name] is rolling...       (blue, 2 sec, quiet)
COMPLETE:     ✅ All rolls complete!    (green, 3 sec, chime)
```

### Sound Cues
```
YOUR TURN:    Two-tone (ascending-descending), 0.4s
OTHER:        Single beep (500 Hz), 0.15s
COMPLETE:     Arpeggio (C→E→G), 0.3s
```

### Visual Indicators
```
CURRENT:      Gold border + glow + pulse + spinning dice
COMPLETED:    Green badge + result displayed
WAITING:      Gray badge + no animation
```

---

## 📊 Implementation Phases

```
Phase 1: Turn Detection (2-3 hrs)      ← Core feature
  ✓ State tracking
  ✓ Detect changes
  ✓ Show toasts

Phase 2: Visuals (2-3 hrs)              ← User experience
  ✓ Glowing borders
  ✓ Animations
  ✓ Highlights

Phase 3: Sound (1-2 hrs)                ← Polish
  ✓ Two-tone sound
  ✓ Different cues
  ✓ Browser compat

Phase 4: Polish (2-3 hrs)               ← Optional
  ✓ Settings
  ✓ Accessibility
  ✓ Performance
```

---

## 🔧 Files to Modify

```
PRIORITY 1 (Critical):
  📝 app/hooks/useScenarioDice.ts
     ├─ Add state tracking
     ├─ Turn detection logic
     ├─ Toast notifications
     └─ Sound generation

PRIORITY 2 (Important):
  📝 app/components/TiebreakerDice.tsx
     ├─ Enhanced styling
     ├─ Glow effects
     ├─ Animations
     └─ Current turn indicator

OPTIONAL:
  📝 tailwind.config.ts
     └─ Custom animations (if needed)
```

---

## 💾 State Variables to Add

```typescript
// In useScenarioDice hook:
const [previousDiceState, setPreviousDiceState] = useState(null);
const [lastNotifiedTurnIndex, setLastNotifiedTurnIndex] = useState(-1);
const [diceCompleted, setDiceCompleted] = useState(false);
```

---

## 🔄 Key Functions

```typescript
// New function to create:
detectTurnChange(newState, oldState) → {
  isMyTurn: boolean
  turnChanged: boolean
  playerName: string
  changeType: 'started' | 'changed' | 'completed'
}

// Existing functions to enhance:
playTurnChangeSound()    → Two-tone instead of single
playOtherPlayerSound()   → New quiet beep
playCompletionSound()    → New success arpeggio
subscribeToRoomChanges() → Add turn detection logic
```

---

## 🎨 CSS Classes

```
From TailwindCSS (already available):
  animate-pulse    - Glowing pulse effect
  animate-spin     - Spinning animation
  animate-bounce   - Bouncing text
  border-yellow-*  - Gold/yellow colors
  shadow-lg        - Glow shadows

Custom (may need to add):
  animate-glow     - Glowing border
  animate-spin-slow - Slower rotation
```

---

## 🧪 Testing Checklist

```
Functional Tests:
  ☐ Toast appears on turn change
  ☐ Sound plays without error
  ☐ Current player card highlights
  ☐ No duplicate notifications
  ☐ Works on all browsers

UX Tests:
  ☐ Player always knows whose turn
  ☐ Not distracting/annoying
  ☐ Mobile responsive
  ☐ Animations smooth (60fps)

Accessibility:
  ☐ Screen reader compatible
  ☐ Works without sound
  ☐ Works without colors
  ☐ Touch friendly
```

---

## ⚡ Quick Stats

- **Total Lines of Code**: ~2,150 lines docs
- **Implementation Time**: 7-11 hours
- **Complexity**: Medium
- **Breaking Changes**: None
- **Database Changes**: None (client-side only)
- **Browser Support**: All modern + IE11 fallback
- **Performance Impact**: Negligible

---

## 🎯 Success Criteria

```
✅ Turn detected within 500ms
✅ Notification appears instantly
✅ Sound plays without errors
✅ Visual shows current player clearly
✅ No duplicate notifications
✅ Works on mobile & desktop
✅ Accessible to all users
✅ No console errors
```

---

## 🚀 Getting Started

1. Read [PLAN_SUMMARY.md](./PLAN_SUMMARY.md) (5 min)
2. Read [VISUAL_ARCHITECTURE.md](./VISUAL_ARCHITECTURE.md) (15 min)
3. Open [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)
4. Start with Phase 1 tasks
5. Check off items as you complete them
6. Test after each phase

---

## 📞 Reference Materials

- 📖 [TURN_CHANGE_NOTIFICATIONS_PLAN.md](./TURN_CHANGE_NOTIFICATIONS_PLAN.md) - Deep dive
- 🎨 [VISUAL_ARCHITECTURE.md](./VISUAL_ARCHITECTURE.md) - Design specs
- 📊 [VISUAL_SUMMARY.md](./VISUAL_SUMMARY.md) - Visual examples
- ✅ [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) - Tasks
- 📑 [INDEX.md](./INDEX.md) - Document index

---

## 🔗 Key Code Snippets

### Turn Detection Loop
```typescript
useEffect(() => {
  if (!previousDiceState || !diceState) return;
  
  const turnChanged = diceState.currentPlayerIndex !== 
                     previousDiceState.currentPlayerIndex;
  
  if (turnChanged) {
    const changeInfo = detectTurnChange(diceState, previousDiceState);
    if (changeInfo.isMyTurn) {
      showToast('🎲 Your turn to roll!', 'info');
      playYourTurnSound();
    }
  }
  
  setPreviousDiceState(diceState);
}, [diceState]);
```

### Enhanced Player Card
```tsx
<div className={`
  bg-gray-700 rounded-lg p-4 
  ${index === currentPlayerIndex ? 
    'border-2 border-yellow-400 shadow-lg shadow-yellow-600/50 animate-pulse' 
    : 'border border-gray-600'
  }
`}>
  {/* Card content */}
  {index === currentPlayerIndex && (
    <div className="animate-spin text-3xl">🎲</div>
  )}
</div>
```

---

## ⚠️ Common Pitfalls

```
❌ Don't:
  - Play sound on EVERY state change (queue multiple sounds)
  - Show toast for same turn index twice (use tracking var)
  - Block UI during sound generation (async/await)
  - Forget to cleanup audio contexts (memory leaks)
  - Use hardcoded frequencies (use constants)
  - Ignore mobile viewport (test on phones)

✅ Do:
  - Compare states before showing notification
  - Track lastNotifiedTurnIndex
  - Wrap audio in try-catch
  - Cleanup on unmount
  - Use typed constants for sounds
  - Test responsiveness early
```

---

## 📈 Progress Tracking

```
Phase 1: Turn Detection       [████░░░░░] 40%
Phase 2: Visual Enhancements  [░░░░░░░░░░] 0%
Phase 3: Sound Refinement     [░░░░░░░░░░] 0%
Phase 4: Polish               [░░░░░░░░░░] 0%

Total Progress:               [████░░░░░░] 10%
```

Use [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md) for detailed tasks.

---

## 🎓 Learning Resources

### By Role
- **Developer**: Start with [TURN_CHANGE_NOTIFICATIONS_PLAN.md](./TURN_CHANGE_NOTIFICATIONS_PLAN.md)
- **Designer**: Start with [VISUAL_ARCHITECTURE.md](./VISUAL_ARCHITECTURE.md)
- **QA**: Start with [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)
- **Manager**: Start with [PLAN_SUMMARY.md](./PLAN_SUMMARY.md)

### Total Reading Time
- Executive Summary: 5 minutes
- Developer Deep Dive: 45 minutes
- Full Understanding: 90 minutes

---

## ✨ Expected User Experience

```
BEFORE: "Whose turn is it? I'm not sure..."
AFTER:  "🎲 Your turn! I got notified, heard a sound,
         and my card is glowing - DEFINITELY my turn!"
```

---

## 🔐 Production Checklist

Before deploying:
```
☐ All phases implemented
☐ No console errors
☐ No TypeScript errors
☐ Mobile tested
☐ Accessibility tested
☐ Browser compatibility verified
☐ Performance acceptable
☐ Team reviewed
☐ Ready for users
```

---

## 📞 Questions?

Refer to appropriate document based on your question:
- **"How do I code this?"** → [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md)
- **"What's it look like?"** → [VISUAL_ARCHITECTURE.md](./VISUAL_ARCHITECTURE.md)
- **"Give me the details"** → [TURN_CHANGE_NOTIFICATIONS_PLAN.md](./TURN_CHANGE_NOTIFICATIONS_PLAN.md)
- **"Where are the docs?"** → [INDEX.md](./INDEX.md)

---

## 🎉 You're Ready!

Everything is planned, documented, and ready to implement.

Pick a document above and start learning.
When ready, follow [IMPLEMENTATION_CHECKLIST.md](./IMPLEMENTATION_CHECKLIST.md).

Good luck! 🚀

