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
| 2026-03-16 | Google Drive Sync | 92% | `docs/03-analysis/ssampin-gdrive-sync.analysis.md` |

## Google Calendar Integration Notes

- 27 new files + 15 modified files across all 4 layers + electron + landing
- Zero architecture violations in new code (usecases import only from @domain/)
- Env vars use VITE_ prefix in .env.example, transformed via vite.config.ts define
- OAuth flow: renderer -> IPC -> main process local HTTP server -> system browser -> callback
- Token storage: Electron safeStorage (DPAPI) with localStorage fallback for dev
- Sync settings (interval, onStart, onFocus, autoResolve) are in-memory only (not persisted)

## Google Drive Sync Notes

- 12 new files + 8 modified files across all 4 layers
- Architect pre-analysis: 6 issues all resolved (100%)
- All naming changed from design: "Sync" -> "DriveSync" prefix (to avoid Calendar SyncState collision)
- Infrastructure: separate DriveSyncAdapter class instead of extending GoogleDriveClient
- Checksum: SHA-256 (design said MD5) -- better choice
- 3 MAJOR gaps: autoSyncOnSave not wired, cloud delete TODO, no first-sync confirmation
- container.ts now exports `storage` variable (was previously private)
- reloadStores() utility handles 17 file types via loaded=false -> load() pattern
- computeChecksum duplicated in SyncToCloud.ts and ResolveSyncConflict.ts
- ResolveSyncConflict UseCase exists but store does inline resolution instead
