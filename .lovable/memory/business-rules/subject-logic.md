---
name: Subject Specific Logic & Exceptions
description: Business rules and daily logic for Math, LA, Spelling, History, and Science
type: feature
---
Subject Logic:
- History/Science: `historyScienceNoAssign=true` → never deploy assignments. Pages/announcements still render.
- Math Triple Logic: A 'Test' row deploys 3 assignments — (1) Written Test (same day), (2) Fact Test (same day, synthetic), (3) Study Guide (due previous weekday, synthetic, omit_from_final). Monday Test → Study Guide clamps to Monday with note "distribute Friday prior".
- Math Even/Odd: regular Lesson rows auto-title by parity — even → "Evens HW — Lesson N", odd → "Odds HW — Lesson N". Prefix `SM5:`. Course `21957`.
- Math Investigation: type `Investigation` does NOT follow even/odd and NEVER creates its own HW assignment (`assignDisabled=true` in pacing card; builder skips). Default resources auto-seeded when lesson_num is set: `Investigation {n} Student Book`, `Study Guide {n} (Blank)`, `Study Guide {n} (Completed)`. URLs auto-link from `content_map` lesson_refs `INV{n}` / `SG{n}-blank` / `SG{n}-completed` / `SG{n}`. When the next school day is a Math Test, the existing Triple Logic on the Test row already produces the SG (due day-1) — so the day-before-Test SG ride-along is automatic, no extra wiring on the Investigation row. Helper `isInvestigationBeforeTest(day, rows)` in `assignment-logic.ts` exposes this for UI hints.
- Language Arts: ONLY `CP` (Classroom Practice) and `Test` rows create Canvas assignments. `Lesson` rows are skipped at build time AND forced to `create_assign=false` by the `enforce_friday_rules` DB trigger. Titles: Test → `ELA4A Shurley Test`; CP → `ELA4A Classroom Practice N`. Prefix `ELA4A`. Course `21944`.
- Spelling: Routes to Reading course (`21919`, Together Logic) but keeps separate assignments. Spelling Test N expands to words 1..N×5 from the bank.

Synthetic rows (Fact Test, Study Guide):
- Mirrored to `pacing_rows` with `is_synthetic=true` and `parent_row_id` linking to source.
- Bypass Friday + LA rules in trigger so Tests/Study Guides can be any day.
- Display "AUTO" badge in Assignments preview.

Global Friday Exception:
- Friday column muted in UI; no At Home, no homework (Tests OK). See `mem://business-rules/friday-rules`.
