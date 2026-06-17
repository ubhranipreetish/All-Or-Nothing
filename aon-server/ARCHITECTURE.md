# All-Or-Nothing — Backend Architecture

A layered, dependency-injected TypeScript backend for the All-Or-Nothing gaming
platform (Express 5 + Mongoose + Socket.IO). The codebase is organised so that
**business rules don't depend on frameworks** — they depend on small interfaces,
and the concrete framework code is pushed to the edges.

> The public API (routes, request/response shapes, socket events) is unchanged
> from the original implementation — this is a structural refactor, verified by
> `npm test` (`scripts/smoke.ts` boots the real app against an in-memory Mongo and
> asserts 19 behaviours end-to-end).

## Request flow

```
HTTP request
   │
   ▼
routes/              maps URL → controller, applies `protect` guard
   │
   ▼
controllers/         thin HTTP adapters: parse req → call a service → send res
   │                 (no business logic; errors bubble to error.middleware)
   ▼
services/            ★ business rules. Orchestrate repositories + domain + events
   │
   ├──► repositories/   data access (the only code that talks to Mongoose)
   ├──► domain/         pure rules: game strategies, interest calculator
   ├──► adapters/       third-party wrappers (Google, JWT) behind interfaces
   └──► shared/events   publish domain events (no knowledge of Socket.IO)
                              │
                              ▼
                        realtime/SocketNotifier (Observer) → Socket.IO clients
```

Everything is wired together in one place — [`src/container.ts`](src/container.ts),
the **composition root**. That is the only file that picks concrete classes; the
rest of the app receives its collaborators through constructors.

## Layout

| Folder | Responsibility |
|---|---|
| `config/` | `Environment` + `Database` singletons |
| `shared/` | cross-cutting: `AppError`, `EventBus` + domain events, validation |
| `domain/` | framework-free rules: game strategies, interest calculator |
| `adapters/` | third-party integrations behind ports (Google auth, JWT) |
| `repositories/` | persistence behind interfaces (one per collection) |
| `services/` | use cases / business orchestration |
| `realtime/` | `SocketServer` facade + `SocketNotifier` observer |
| `controllers/`, `routes/`, `middlewares/` | the HTTP edge |
| `container.ts` | composition root (manual DI) |

## Design patterns (and why)

| Pattern | Where | Why it's here |
|---|---|---|
| **Singleton** | `config/env.ts`, `config/database.ts`, `shared/events/EventBus.ts`, `realtime/SocketServer.ts` | one shared instance of each cross-cutting resource |
| **Observer** | `EventBus` + `realtime/SocketNotifier.ts` | services announce *what happened*; the socket layer reacts. Adding a reaction never touches the publisher. Killed the leaderboard logic that was duplicated inside the old `socket.ts`. |
| **Strategy** | `domain/games/GameStrategy.ts`, `domain/loans/InterestCalculator.ts` | per-game limits and the interest formula are swappable algorithms. One interest implementation replaced three copy-pasted functions. |
| **Factory** | `domain/games/GameStrategyFactory.ts` | resolves the right game strategy by type — the single registry of game types |
| **Adapter** | `adapters/auth/GoogleAuthAdapter.ts`, `adapters/auth/JwtTokenService.ts` | wrap Google's SDK and `jsonwebtoken` behind `IdentityProvider` / `TokenService` ports so the services don't depend on them |
| **Composite** | `shared/validation/Validator.ts` | a `CompositeValidator` groups leaf rules and is itself a `Validator`, so callers treat one rule and many rules the same way |
| **Repository** | `repositories/*` | services depend on data interfaces, not Mongoose |

## SOLID

- **S**ingle responsibility — controllers do HTTP, services do rules, repositories
  do persistence, strategies do algorithms. Each file has one reason to change.
- **O**pen/closed — a new game = a new `GameStrategy` + one factory line; a new
  reaction to an event = a new `EventBus` subscriber. No existing service is edited.
- **L**iskov — every `GameStrategy`, repository, and adapter is substitutable for
  its interface; the in-memory smoke test swaps the Mongo connection with no code change.
- **I**nterface segregation — ports are tiny (`IdentityProvider.verify`,
  `TokenService.sign/verify`, `Validator.validate`).
- **D**ependency inversion — services depend on abstractions injected by
  `container.ts`; concrete Google/JWT/Mongo classes are chosen only there.

## Commands

```bash
npm run dev     # watch-mode dev server
npm run build   # type-check + emit to dist/
npm start       # run compiled server
npm test        # boot the real app on in-memory Mongo and assert API parity
```
