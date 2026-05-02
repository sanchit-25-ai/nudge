# Nudge

A smart food decision assistant built on Swiggy's MCP. Full product spec lives in `nudge_spec.docx`. Build plan is at `.claude/plans/nudge-build-plan.md` and per-item specs are in `.claude/specs/`.

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

```bash
npm install
cp .env.example .env   # then add your ANTHROPIC_API_KEY
```

## Run

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:3001/api/health

## Structure

```
nudge/
├── frontend/    Vite + React 18 + TS + Tailwind (mobile web, 390px)
├── backend/     Express + TS proxy to Anthropic + Swiggy MCP
└── shared/      TS types shared by both
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Boots frontend + backend in parallel |
| `npm run build` | Production builds for both |
| `npm run typecheck` | Type-checks both workspaces |

## Status

Personal-use prototype. Public deployment requires Swiggy Builders Club approval (see spec §7.5).
