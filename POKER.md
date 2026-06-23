# Multiplayer Poker — All or Nothing

Real-time, authoritative-server No-Limit Texas Hold'em for up to **6 players**,
built on the platform's existing Socket.IO infrastructure. This document covers
the architecture, the file map, how to run/test it, what's done vs. simplified,
and the next steps.

---

## URLs

| URL | Needs backend? | What it is |
|---|---|---|
| `/poker` | **Yes** (aon-server on :5001) | The real multiplayer game over WebSockets. Open in 2+ tabs (or share the 4-letter table code) to play a live hand. |
| `/poker-test` | **No** | A backend-free harness: the full poker engine + 3 bots run in the browser so you can check the UI and gameplay without the server. "Leave" re-deals. |

> Neither is linked from the home page or nav — they're reachable by URL only.

---

## How real-time multiplayer poker works (the architecture)

**1. Authoritative server, dumb clients.**
The one hard rule of any card game: the client can never be trusted. The server
holds the entire truth — the shuffled deck, everyone's hole cards, whose turn it
is — and clients only *render* what the server sends and *request* actions. A
tampered client can't deal itself aces because it never possesses the deck.

**2. WebSockets, not HTTP.**
The other games (Mines, Dragon Tower, Wheel) are REST: one request → one
response, single player. Poker needs the **server to push** to players ("it's
your turn", "the flop is out") without them asking — a persistent, bidirectional
connection. That's **Socket.IO**, which the backend already runs. Poker lives on
its **own `/poker` namespace**, fully isolated from the existing notification
sockets, so the platform's REST/socket behaviour is unchanged (all 19 smoke
tests still pass).

**3. Rooms / tables.**
Socket.IO "rooms" group the sockets at one table (`poker:ABCD`). A `PokerHub`
keeps an in-memory `Map` of live tables, matchmakes (Quick Play finds a table
with an open seat or creates one), and disposes tables when they empty.

**4. The game is a state machine.**
`PokerTable` is a pure engine: `waiting → preflop → flop → turn → river →
showdown`. It enforces blinds, betting rounds, min-raise rules, all-ins, **side
pots**, and a **7-card hand evaluator** decides showdowns (split pots on ties).
It's framework-free → unit-testable and impossible to corrupt from socket code.

**5. Per-viewer state sanitization.**
On every change the hub serialises a *different* snapshot per player: you get
your own hole cards; everyone else's are face-down backs until showdown. This is
the core security boundary.

**6. The turn clock.**
A server-side timer (25s) auto-checks/folds a stalling player so one AFK person
can't freeze the table.

**Per-action flow:**
```
client emits  action {fold|check|call|bet|raise}
        │
        ▼
server validates  (your turn? legal? amount ok?)
        │
        ▼
PokerTable mutates  (apply action, advance street / showdown if needed)
        │
        ▼
PokerHub broadcasts  per-viewer sanitised TableState to everyone in the room
        │
        ▼
server arms next turn timer
```

---

## File map

### Server (`aon-server/src/`)
| File | Responsibility |
|---|---|
| `domain/poker/cards.ts` | Card model, 52-card deck, Fisher–Yates shuffle |
| `domain/poker/handEvaluator.ts` | Best-of-7 hand scoring + comparison (royal flush → high card) |
| `domain/poker/PokerTable.ts` | Authoritative table state machine: seating, blinds, betting, side pots, showdown |
| `realtime/poker/PokerHub.ts` | `/poker` namespace, table manager, per-viewer serialization, turn clock, auto-start |
| `server.ts` | Registers `pokerHub` on the existing Socket.IO server (one added line) |
| `scripts/pokerSmoke.ts` | Engine simulation: `npx ts-node -T scripts/pokerSmoke.ts` (termination + chip-conservation) |

### Client (`aon-client/src/`)
| File | Responsibility |
|---|---|
| `components/poker/types.ts` | Shared view types (`TableState`, `SeatView`, `Legal`, …) |
| `components/poker/usePoker.ts` | Live socket hook (connect, join, act) |
| `components/poker/PokerTable.tsx` | Table UI: felt, seats, countdown ring, bet sizing, pre-actions, animations |
| `components/poker/sounds.ts` | Optional WebAudio cues (deal / turn / win) |
| `components/poker/engine.ts` | Browser port of the engine + a simple bot policy (test mode) |
| `components/poker/useLocalPoker.ts` | Drives the local engine + bots (test mode) |
| `app/poker/page.tsx` | Lobby (Quick Play / join code) → live room |
| `app/poker-test/page.tsx` | Backend-free harness page |
| `styles/Poker.css` | All poker styling (noir-luxe felt, gold accents) |

---

## Running it

```bash
# backend
cd aon-server && npm run dev          # serves :5001 (HTTP + Socket.IO)

# frontend
cd aon-client && npm run dev          # NOTE: project convention is to build,
                                      # not run next dev — use `npm run build`
```

- **Live game:** open `http://localhost:3000/poker` in two browser tabs, hit
  **Quick Play** in each. A hand auto-starts once 2+ players are seated.
- **UI/gameplay check (no backend):** open `http://localhost:3000/poker-test`.

The client points at `NEXT_PUBLIC_API_URL` (default `http://localhost:5001/api`)
and derives the socket URL by stripping `/api`.

---

## Status

### Game (server-authoritative)
- Full No-Limit Texas Hold'em: blinds, dealing, all four betting streets,
  raises/all-ins, **side pots**, correct 7-card showdown evaluation with split
  pots. (`scripts/pokerSmoke.ts` simulates thousands of random-but-legal actions
  across 2–6 players and asserts hands always terminate and chips are conserved.)
- Auto-start hands, dealer-button rotation.
- **Turn clock** (20s) with a server deadline broadcast for an accurate client
  countdown; correct min-raise reopen (a sub-minimum all-in does *not* reopen
  the betting for players who already acted).
- **Timeout penalties:** time-out → auto check/fold; **2 consecutive misses →
  auto sit-out**. A voluntary action clears the penalty.
- **Sit-out / sit-in / rebuy**, and **bust → sit-out** until rebuy.

### Connection / identity
- **Stable per-browser identity** (persisted `playerId`) instead of socket id.
- **Reconnect-to-seat:** a disconnect holds the seat for a 60s grace; a refresh
  rejoins automatically (client persists the table for 2 min). The turn clock
  still auto-folds a disconnected player if it's their turn.

### UX (learned from online poker)
- Avatar **countdown ring** on the active player + seconds shown.
- **Bet-sizing controls:** presets (Min / ½ / ¾ / Pot / All-in) + slider +
  numeric input, all clamped to legal bounds.
- **Pre-action toggles** (Check/Fold, Check/Call) that auto-fire on your turn.
- **Animations:** staggered community-card deal, winner-seat pulse, fold dim.
- **Seat badges:** dealer button, SB/BB, all-in, sitting-out, disconnected,
  winner highlight. Inter-hand reveal pause (5s) at showdown.
- **Sound cues** (deal / your-turn / win) via WebAudio, mute toggle.
- Responsive felt; backend-free `/poker-test` harness mirrors all of the above.

### Deliberately not wired (next steps)
1. **Play-money chips only** (₵1000) — real ₹ wallet **buy-in / cash-out** via
   `WalletService` is the main remaining step (kept out to avoid money-handling
   risk until gameplay is validated).
2. **JWT-verified identity** on the socket handshake (today the `playerId` is
   client-supplied — fine for play money, must be server-trusted for real money).
3. Time-bank (extra reserve time beyond the per-turn clock); hand history; rake.
4. Multiple stake levels / a richer lobby with a table browser.
