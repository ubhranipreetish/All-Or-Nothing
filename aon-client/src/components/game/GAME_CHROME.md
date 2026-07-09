# Game Chrome Primitives — integration contract

Shared UI for all 5 games. Styles live in `src/styles/Game.css` (`.gh-`, `.lg-`, `.gp-`).
`LeaveGuardProvider` is already mounted in `src/app/layout.tsx` — do NOT mount it again.

## 1. GameHeader — replaces the old `game-head` block

```tsx
import GameHeader from "@/components/game/GameHeader";
// Props: { eyebrow: string; title: string; titleAccent?: string; tagline: string; onHowToPlay?: () => void }

<GameHeader
  eyebrow={`Provably fair · ${mineCount} mines`}
  title="DRAGON"
  titleAccent="tower"                 // optional serif-italic accent word
  tagline="Climb floor by floor. One wrong stone wakes the dragon."
  onHowToPlay={() => setShowRules(true)}   // omit to hide the "? How to play" button
/>
```

It renders the "← Games" back link, eyebrow + ember dot, gold display title, tagline, and the
how-to-play ghost button (right on desktop, below on mobile). Delete the old
`<header className="game-head">…</header>` markup and the inline `<HowToPlay />` trigger; keep
`HowToPlay`'s modal by controlling it yourself, or open your own rules modal from `onHowToPlay`.

## 2. useLeaveGuard — navigation guard while money is live

```ts
import { useLeaveGuard, type LeaveGuardAction } from "@/components/game/LeaveGuard";

useLeaveGuard({
  when: boolean,        // arm while a round/bet is live; disarms on false or unmount
  title: string,
  message: string,
  actions: LeaveGuardAction[],
});
// LeaveGuardAction = { label: string; tone?: "gold" | "ember" | "ghost";
//                      run?: () => Promise<void> | void; leave: boolean }
```

Armed behavior: internal link clicks (`a[href^="/"]`) and browser Back open the styled dialog;
tab close/reload gets the native browser prompt. If the chosen action has `leave: true`, its
`run()` is awaited (button shows a spinner), then navigation proceeds (Back intent routes to `/`).
If `run()` throws on a `leave` action, the player STAYS — settle failures never strand money.
Only one guard is active at a time (last registered wins).

**Forfeit-or-save (Mines / Dragon Tower — round live, winnings unbanked):**
```ts
useLeaveGuard({
  when: started && !gameOver && !cashedOut,
  title: "Leave the table?",
  message: `You have ₹${earnings.toFixed(2)} on the board. Cash out or forfeit before you go.`,
  actions: [
    { label: "Stay", tone: "ghost", leave: false },
    { label: "Cash out & leave", tone: "gold", leave: true,
      run: async () => { await recordWin(earnings, amount, "MINES", parseFloat(multiplier)); } },
    { label: "Forfeit & leave", tone: "ember", leave: true,
      run: async () => { if (sessionIdRef.current) await recordLoss(sessionIdRef.current); } },
  ],
});
```

**Auto-settle-and-leave (Wheel / Roulette — bet placed, spin not resolved):**
```ts
useLeaveGuard({
  when: betPlaced && !spinResolved,
  title: "Spin in progress",
  message: "Your bet rides on this spin. Leaving now forfeits the stake.",
  actions: [
    { label: "Watch it land", tone: "gold", leave: false },
    { label: "Forfeit & leave", tone: "ember", leave: true,
      run: async () => { if (sessionId) await recordLoss(sessionId); } },
  ],
});
```

**Poker settle (seated at a live table):**
```ts
useLeaveGuard({
  when: seated && gamePhase !== "ended",
  title: "Leave the poker table?",
  message: "You'll fold this hand and your remaining chips will be settled to your wallet.",
  actions: [
    { label: "Keep playing", tone: "ghost", leave: false },
    { label: "Fold & cash chips", tone: "ember", leave: true,
      run: async () => { socket.emit("leaveTable", { roomCode }); await settleChips(); } },
  ],
});
```

## 3. PendingButton — "the house is dealing", not lag

```tsx
import PendingButton from "@/components/game/PendingButton";
// Props: { pending: boolean; pendingLabel: string; children } & ButtonHTMLAttributes<HTMLButtonElement>

<PendingButton pending={placingBet} pendingLabel="Dealing…" type="submit" disabled={swapGuard}>
  Place Bet
</PendingButton>
```

Renders the standard `.game-primary` button. While `pending` it is disabled (`aria-busy`),
keeps its exact size, and shows an inline spinner (`.gp-spinner`, currentColor — reusable on
any button) + `pendingLabel`.

## 4. Board staging state — the 1–3s bet-to-round-start gap

```tsx
<div className={`game-board ${placingBet ? "is-staging" : ""}`}>
  {/* ...board internals untouched... */}
  {placingBet && <p className="staging-note">The house is dealing…</p>}
</div>
```

- `.game-board.is-staging` — board dims under a dark veil and a slow diagonal gold sheen
  sweeps across (~1.2s loop). Purely visual; disable inputs yourself while staging.
- `.staging-note` — small pulsing mono microcopy; when it's a direct child of `.game-board`
  it auto-pins to the bottom center. Set `placingBet` true on submit, false once the round
  actually starts (session confirmed).
