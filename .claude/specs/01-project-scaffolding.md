# Spec — Item 1: Project Scaffolding

**Phase**: A (Vertical slice) · **Status**: Draft, awaiting approval

## Goal

Create the bare-bones project structure for Nudge so subsequent items have a place to land. Zero product behavior — this item only sets up the build/dev/run plumbing.

## Deliverables

A working `npm run dev` from the project root that:
- Boots the Vite frontend on `http://localhost:5173`
- Boots the Express backend on `http://localhost:3001`
- Frontend can hit the backend's `GET /api/health` and render "ok"

## File tree after this item ships

```
nudge/
├── .claude/                          # already exists (plans/, specs/)
├── nudge_spec.docx                   # already exists
├── package.json                      # workspaces root
├── package-lock.json
├── tsconfig.base.json                # shared TS config
├── .env.example                      # ANTHROPIC_API_KEY=
├── .gitignore
├── README.md                         # how to run
│
├── shared/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       └── types.ts                  # placeholder export
│
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts                # proxy /api → :3001
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx                   # calls /api/health, renders status
│       └── index.css                 # tailwind base
│
└── backend/
    ├── package.json
    ├── tsconfig.json
    └── src/
        ├── server.ts                 # express bootstrap
        └── routes/
            └── health.ts             # GET /api/health → { status: "ok" }
```

## Tech choices (locked)

| Layer | Choice | Reason |
|---|---|---|
| Package manager | npm workspaces | Built-in, no extra tooling. `pnpm` would also work but npm is one less thing. |
| Frontend build | Vite + React 18 + TS | Per spec §7.1. |
| Styling | Tailwind CSS | Per spec §7.1. Tokens land in `tailwind.config.ts` in Item 2. |
| Backend | Express + TS, run via `tsx` | Express per spec §7.1. `tsx` for fast dev reload, no build step locally. |
| Validation | Zod | For Item 4's request schema; install now. |
| Anthropic SDK | `@anthropic-ai/sdk` | Install now; wire in Item 5. |
| Process orchestration | `npm-run-all` (parallel) | One command runs both servers. |

## Root scripts

```json
{
  "scripts": {
    "dev": "npm-run-all --parallel dev:frontend dev:backend",
    "dev:frontend": "npm --workspace frontend run dev",
    "dev:backend":  "npm --workspace backend run dev",
    "build":        "npm-run-all build:shared build:frontend build:backend",
    "typecheck":    "npm-run-all --parallel typecheck:*"
  }
}
```

## Verification

After running `npm install && npm run dev` from the repo root:
1. `http://localhost:5173` renders a page that says **"Backend: ok"**.
2. `curl http://localhost:3001/api/health` returns `{"status":"ok"}`.
3. `npm run typecheck` passes with zero errors across all workspaces.

## Out of scope for this item

- Anthropic SDK wiring (Item 5)
- MCP integration (Item 5)
- Tailwind tokens beyond Tailwind defaults (Item 2)
- Any UI beyond the health-check display (Item 8 onward)
- Tests / linting setup (deferred — add when first non-trivial logic lands)
- Git initialization (working dir is currently not a git repo per env; ask before `git init`)

## Open question

The working directory is not a git repo. Init now or wait? Recommendation: **init now** so we get diffable history from the very first scaffold commit.
