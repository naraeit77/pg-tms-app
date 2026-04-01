# CLAUDE.md

## Project Overview

**Narae PG-TMS v1.0** - PostgreSQL SQL Tuning Management System by 주식회사 나래정보기술

Next.js 16 application using React 19, TypeScript, Tailwind CSS, Shadcn UI, and Mantine v8. Built with local PostgreSQL 17 + Drizzle ORM + NextAuth v4.

PostgreSQL 네이티브 모니터링 기반 SQL 튜닝 관리 시스템. pg_stat_statements, pg_stat_activity, EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) 등을 활용하여 성능 모니터링, AI 기반 튜닝 권고, 스냅샷 비교 분석을 제공합니다.

## Development Commands

```bash
npm run dev           # Development server
npm run dev:turbo     # Development with Turbopack
npm run build         # Production build
npm start             # Start production server
npm run lint          # Lint code
npm run db:generate   # Drizzle schema generation
npm run db:push       # Push schema to DB
npm run db:seed       # Seed database
npm run db:studio     # Drizzle Studio
```

## Tech Stack

- **Framework**: Next.js 16 + React 19 + TypeScript
- **UI**: Tailwind CSS 3.4 + Shadcn UI + Mantine v8
- **Database**: PostgreSQL 17 (Drizzle ORM + pg driver)
- **Auth**: NextAuth v4 (JWT + bcrypt credentials)
- **State**: React Query 5 + Zustand 4
- **Charts**: Recharts + D3

## Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── (dashboard)/        # Dashboard layout group
│   ├── api/pg/             # PG connection API routes
│   ├── api/auth/           # NextAuth routes
│   └── auth/               # Auth pages
├── components/
│   ├── ui/                 # Shadcn UI (39 components)
│   ├── dashboard/          # Dashboard layout components
│   └── database/           # Database selector
├── db/
│   ├── schema/             # Drizzle schema (users, connections, reports)
│   ├── index.ts            # PG pool + Drizzle instance
│   └── seed.ts             # Seed data
├── lib/
│   ├── pg/                 # Target PG DB connection library
│   │   ├── client.ts       # Connection pool management
│   │   ├── utils.ts        # Config loading + cache
│   │   └── types.ts        # PG type definitions
│   ├── auth.ts             # NextAuth config
│   ├── crypto.ts           # AES-256-GCM encryption
│   └── stores/             # Zustand stores
└── hooks/                  # Custom React hooks
```

## Key Conventions

- **Use `use client`** for all components (project convention)
- **Page params**: Async `Promise<{ id: string }>` pattern (Next.js 16)
- **Path alias**: `@/*` → `./src/*`
- **Package manager**: npm
- **DB columns**: camelCase in schema, snake_case in DB
- **UUID primary keys** with `gen_random_uuid()`
- **Korean UI text** - verify UTF-8 encoding
- **Target DB vs App DB**: `src/lib/pg/` manages target PG databases to monitor. `src/db/` is the app's own database.
