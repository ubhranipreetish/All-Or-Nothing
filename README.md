<div align="center">

# 🪙 ALL *or* NOTHING

**Five games of nerve. One wallet of play-money credits. Chase the leaderboard — not your losses.**

A full-stack, play-money casino with real-time multiplayer poker, a rupee-accurate ledger, and a noir-luxe design system — built as a systems-design showcase.

[**▶ Play it live**](https://all-or-nothing-plum.vercel.app) · [Architecture deep-dive](context.md)

![Next.js](https://img.shields.io/badge/Next.js%2016-000000?logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React%2019-087ea4?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![Express](https://img.shields.io/badge/Express-2f2f2f?logo=express&logoColor=white)
![Socket.IO](https://img.shields.io/badge/Socket.IO-010101?logo=socketdotio&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-116149?logo=mongodb&logoColor=white)

*Play-money only · no real money · 18+ · play responsibly*

</div>

---

## The games

| Game | The pitch | The tension |
|---|---|---|
| 💎 **Mines** | Flip gems, dodge the bombs | Every reveal raises the multiplier — and the odds of the boom |
| 🐉 **Dragon Tower** | Climb ten floors of a dragon-guarded keep | Bank the climb, or feed the dragon your stake |
| 🎡 **Fortune Wheel** | Set your risk, spin once | Most segments pay nothing. The wheel doesn't lie |
| 🎯 **Roulette** | European single-zero, full felt | Chips, "no more bets", and a ball that settles arguments |
| 🃏 **Poker** | Real-time No-Limit Hold'em, 6 seats | Private rooms, host-gated lobby, live socket play against real people |

Around the games: a **wallet + double-entry-style ledger** (every rupee accounted for, with running balances), **loans from the house** at 10% daily compound interest, a **net-worth leaderboard** (balance − debts), and a profile "dossier" with lifetime P&L that actually adds up.

## Why this project exists

It's a systems-design exercise wearing a casino costume. The two hard problems it's built around:

1. **Money integrity under an untrusted client.** Every mutation is server-authoritative: stakes deduct on placement, wins are validated against server-tracked sessions and per-game payout ceilings, break-even "phantom" cash-outs are rejected, refunds are first-class ledger citizens, and the ledger stores a running balance after every transaction.
2. **Real-time multiplayer authority.** Poker runs on a framework-free domain state machine (blinds, side pots, min-raise rules) behind a Socket.IO gateway: host-gated admit/deny lobbies, per-viewer card sanitization, turn clocks, disconnect grace with seat reservation, and buy-ins that settle back to the wallet no matter how a player leaves.

The backend is a layered TypeScript architecture — routes → thin controllers → services → repositories → models, with a domain layer (game strategies, interest calculator, poker table) and a typed event bus decoupling business logic from socket push. Wiring lives in a single composition root (`container.ts`), constructor-injected, no framework.


## Repo layout

```
All_Or_Nothing/
├── aon-client/          # Next.js 16 + React 19 frontend (Vercel)
│   └── src/
│       ├── app/         # Routes: /, /mines, /dragon-tower, /wheel, /roulette, /poker, /profile, /leaderboard
│       ├── components/  # Games, poker table, shared game chrome (header, leave-guard, pending states)
│       ├── contexts/    # Auth (Google/JWT) + Wallet (single source of money state)
│       └── styles/      # Noir-luxe design system (gold on void, corner-ticked panels)
└── aon-server/          # Express + TypeScript API & realtime (Render)
    └── src/
        ├── controllers/ # Thin HTTP handlers
        ├── services/    # Use-cases: games, wallet, loans, leaderboard, poker
        ├── repositories/# Data access over Mongoose
        ├── domain/      # Game strategies, interest calculator, poker state machine
        ├── realtime/    # Socket.IO server, notifier, poker gateway
        └── shared/      # Typed event bus, domain events, errors, validation
```

## Running it locally

**Prerequisites:** Node 20+, a MongoDB instance (local `mongod` or Atlas), and a Google OAuth client ID (for sign-in).

**1. Server**

```bash
cd aon-server
npm install
# .env:
#   PORT=5001
#   MONGO_URI=mongodb://127.0.0.1:27017/aon
#   GOOGLE_CLIENT_ID=<your-google-oauth-client-id>
#   JWT_SECRET=<any-long-random-string>
#   FRONTEND_URL=http://localhost:3000
npm run dev
```

**2. Client**

```bash
cd aon-client
npm install
# .env.local:
#   NEXT_PUBLIC_API_URL=http://localhost:5001/api
#   NEXT_PUBLIC_GOOGLE_CLIENT_ID=<same-google-oauth-client-id>
npm run build && npm start   # production mode
```

Open `http://localhost:3000`, sign in with Google, claim the ₹100 welcome bonus, and lose it with dignity.

**Tests:** `cd aon-server && npm test` runs a 19-check behavior-parity smoke suite that boots the real Express app against an in-memory MongoDB and exercises the full API surface (auth guards, game lifecycle, loans, ledger pagination, origin blocking).

## API at a glance

| Area | Endpoints |
|---|---|
| Auth | `POST /api/auth/google` |
| Games | `POST /api/game/start · update-multiplier · cashout · lose · refund`, `GET /api/game/active` |
| Wallet & bonus | `GET /api/wallet/balance`, `POST /api/bonus/claim-welcome` |
| Loans | `POST /api/loan/take`, `POST /api/loan/repay/:id`, `GET /api/loan/active` |
| Ledger | `GET /api/transactions/me` (paginated, filterable) |
| Leaderboard & profile | `GET /api/leaderboard/all-time`, `GET /api/profile/me` |
| Health | `GET /api/health` · `GET /api/warmup` — no auth; used to wake the free-tier dyno on first visit |
| Poker | Socket.IO events (`table:create/join/admit/leave`, actions, reconnect) — see [POKER.md](POKER.md) |

Direct API access is origin-validated (browser-only by design); the health endpoints are exempt for uptime monitors.

## Deployment

- **Frontend** → Vercel (static + client-side app, `aon-client/`)
- **Backend** → Render (`aon-server/`, `npm run build && npm start`)
- **Database** → MongoDB Atlas

The client pings `/api/health` once per session on first load and shows a *"Waking the house…"* toast if the Render dyno is cold. Point a free uptime monitor at `/api/warmup` to keep it warm.

## Design notes

The interface is a custom **noir-luxe system**: Anton/Fraunces type, gold-on-void palette, corner-ticked panels, house-voice copy ("Scared money never wins"). The landing page is a scroll-driven story — a supernova coin that shatters and re-mints — and each game has its own set piece, including a flat-illustration dragon gripping the battlements above the Dragon Tower board.

---

<div align="center">

**ALL *or* NOTHING** · © 2026 · For entertainment only · Play responsibly · 18+

*Every legend started with a single bet.*

</div>
