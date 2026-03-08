# Gap Detector Agent Memory

## Project: ssampin

- **Architecture**: Clean Architecture (4 layers: domain, usecases, adapters, infrastructure)
- **Path aliases**: `@domain/`, `@usecases/`, `@adapters/`, `@infrastructure/`
- **DI container**: `src/adapters/di/container.ts` (only file allowed to import infrastructure)
- **Known arch exception**: `SyncExternalCalendar` usecase imports `parseICal` from infrastructure (documented/intentional)

## Analysis Patterns

- Plan docs are in `C:\Users\wnsdl\.claude\plans\` directory
- Analysis output goes to `docs/03-analysis/`
- Project uses strict TypeScript (readonly arrays, ReadonlySet, no `any`)
- All UI text is Korean
- Component naming: PascalCase, files: PascalCase.tsx (components), camelCase.ts (utils)

## Previous Analyses

| Date | Feature | Match Rate | Report |
|------|---------|:----------:|--------|
| 2026-03-04 | Schedule extensions (S2/S3/S1) | 98.9% | `docs/03-analysis/ssampin.analysis.md` (overwritten) |
| 2026-03-05 | Google Calendar Integration (6 phases) | 100% | `docs/03-analysis/ssampin.analysis.md` |

## Google Calendar Integration Notes

- 27 new files + 15 modified files across all 4 layers + electron + landing
- Zero architecture violations in new code (usecases import only from @domain/)
- Env vars use VITE_ prefix in .env.example, transformed via vite.config.ts define
- OAuth flow: renderer -> IPC -> main process local HTTP server -> system browser -> callback
- Token storage: Electron safeStorage (DPAPI) with localStorage fallback for dev
- Sync settings (interval, onStart, onFocus, autoResolve) are in-memory only (not persisted)
