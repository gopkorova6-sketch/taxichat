# TaxiChat — project guide

Text messenger for ordering private taxi across Russian cities. Concept:
`taxichat-concept-and-prompt.md`. Architecture and API: `README.md`.

## Commands

```bash
npm test                # server tests (jest + supertest + mongodb-memory-server)
npm run seed            # demo geo reference + accounts (needs .env + MongoDB)
npm run smoke:dev       # full dev-workflow check: API + CRA proxy + WS
npm run dev             # API server + sockets + Agenda on :4000
cd client && npm start  # CRA dev server on :3000 (proxies /api to :4000)
cd client && npm run build
```

Server tests run without external services (in-memory MongoDB) and are safe
to run from any state. `smoke:dev` downloads a MongoDB binary on first run.

## Conventions

- Code identifiers and comments: English. UI texts and API answers: Russian.
- Commit style: `feat|fix|test|docs|chore(scope): summary` (small, focused).
- One client request cookie: JWT in httpOnly `telegramToken`; roles live in
  `Membership` per city (`utilities/rbac.js`).
- Every order status change must go through `transition()` in
  `services/orderService.js` (validation, statusLog, bot messages, events).
- Serialize orders through `utilities/orderViews.js`: exact addresses and the
  passenger name are hidden from drivers until ASSIGNED; phones are never in
  lists.
- New models go to `models/`, endpoints to `controllers/` + `routers/`,
  background tasks to `jobs/` (handlers are pure functions, tested without
  Agenda).
- Do not add dependencies without need; allowed extras so far: agenda@4,
  zod, express-rate-limit, socket.io-client (tests only).
