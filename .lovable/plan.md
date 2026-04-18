
## Audit: 20-File Request vs Existing Repo

Your prompt's first rule is **"DO NOT REBUILD EXISTING APP SHELL"** — but the 20-file list largely duplicates what already ships. Honest accounting:

### Already exist (different names)
| Requested | Existing |
|---|---|
| PagesCenterPage | `PageBuilderPage` |
| AssignmentsCenterPage | `AssignmentsPage` |
| FileCenterPage | `FileOrganizerPage` |
| TeacherMemoryPage | `MemoryPage` |
| SystemHealthPage | `HealthMonitorPage` |
| canvasService | `lib/canvas-html.ts` + `lib/edge.ts` |
| contentEngine | `lib/assignment-build.ts` + `lib/announcement-templates.ts` |
| fileEngine | `supabase/functions/canvas-file-rename` + `file-classify` |
| deploy_queue / system_logs | `automation_jobs` / `deploy_log` |
| settings table | `system_config` |

### Already exist (same name)
DashboardPage, AnnouncementCenterPage, SettingsPage, every requested DB table except `deploy_queue` / `system_logs`.

### Genuinely missing
1. `src/components/dashboard/QuickStats.tsx`
2. `src/components/dashboard/UpcomingPosts.tsx`
3. `src/components/files/FileRenameCard.tsx` (logic is currently inline)
4. `src/components/memory/ConfidenceMeter.tsx` (rendered inline in MemoryPage)
5. `src/components/announcements/AnnouncementPreview.tsx` (inline in AnnouncementCenterPage)
6. `src/hooks/useCanvas.ts` — React Query wrappers around `callEdge`
7. `src/hooks/useAnnouncements.ts` — list / draft / post / schedule
8. `src/hooks/useTeacherMemory.ts` — patterns / hits / log
9. `src/types/thales.ts` — curated domain types (Subject, Day, BuiltAssignment, etc.) re-exported from existing modules
10. `DashboardPage` upgrade: mount QuickStats + UpcomingPosts widgets

### Should NOT do
- Rename `PageBuilderPage` → `PagesCenterPage`: breaks `/page-builder` route, sidebar, all internal links
- Add `deploy_queue` / `system_logs` tables: duplicates `automation_jobs` / `deploy_log` and forces dual-writes
- Replace `lib/*` with new `services/*`: identical behavior, two import paths to maintain
- Re-implement Friday cron, retry engine, three-layer enforcement, front-page guard, together logic — already shipped this session

## Plan: Additive Build (10 net-new files, 1 edited)

**New files**
- `src/components/dashboard/QuickStats.tsx` — pulls from `system_health_snapshots`, `pacing_rows`, `automation_jobs`. Cards: Pending Deploys, Failed Jobs, Orphan Files, Health Score.
- `src/components/dashboard/UpcomingPosts.tsx` — `announcements` where `status='SCHEDULED'` ordered by `scheduled_post`. Subject color chips.
- `src/components/files/FileRenameCard.tsx` — single-file rename row, props `{ file, onApprove, onSkip }`. Used by FileOrganizerPage refactor (non-breaking, opt-in).
- `src/components/memory/ConfidenceMeter.tsx` — bar 0-1, color thresholds (red <0.4, amber 0.4-0.6, emerald ≥0.6) matching theme.
- `src/components/announcements/AnnouncementPreview.tsx` — renders title + content + scheduled time + course chip; reusable in AnnouncementCenter and Dashboard.
- `src/hooks/useCanvas.ts` — `useDeployPage`, `useDeployAssignment`, `useFilesSync` (React Query mutations wrapping `callEdge`).
- `src/hooks/useAnnouncements.ts` — `useAnnouncementsList`, `useDraftAnnouncement`, `useScheduleAnnouncement`, `usePostNow`.
- `src/hooks/useTeacherMemory.ts` — `useMemoryPatterns`, `useMemoryHits`, `useEditHistory`.
- `src/types/thales.ts` — `Subject`, `Day`, `AssignmentType`, `PacingRow`, `BuiltAssignment`, `AnnouncementDraft`, `MemoryHit` re-exported from existing modules; single import surface.
- *(no new migration — existing tables cover everything)*

**Edited**
- `src/pages/DashboardPage.tsx` — mount `<QuickStats />` and `<UpcomingPosts />`. Existing copy/structure preserved.

## Subject Color Tokens
Your prompt specifies Math=orange, Reading=blue, ELA=green, Science=purple, History=navy, Homeroom=gray. Current theme uses subject neutral chips. I'll add a `subjectColor(subject)` helper inside `types/thales.ts` returning Tailwind classes from the existing palette (`text-orange-400`, `text-blue-400`, etc.) — used by `UpcomingPosts`, `AnnouncementPreview`, future widgets.

## Verify
- Open `/` → see Pending Deploys, Failed Jobs, Orphan Files, Health Score; see next 5 scheduled announcements with subject colors
- Open `/announcements` → preview component renders identically (visual parity)
- Open `/memory` → confidence bars render with new color thresholds
- TypeScript: zero new errors, all existing routes intact
