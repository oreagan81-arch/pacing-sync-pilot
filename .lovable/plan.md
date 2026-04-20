
## Phase 2.4 — Wire `hint_override` into Canvas deployment

### Current gap
`generateAssignmentTitle` already accepts a `hintOverride` parameter (Phase 2.3), but `assignment-build.ts` doesn't pass it. The Canvas-deployed title still reflects raw `lessonNum % 2` parity, so a user who picks "None" or flips Evens→Odds in the UI sees their override in the preview but the actual Canvas assignment ignores it.

### One-line fix
**File: `src/lib/assignment-build.ts`** — in `buildAssignmentForCell`, read `cell.hint_override` and pass it as the 5th arg to `generateAssignmentTitle` (inside the `resolveMemory` fallback).

```ts
// before
() => generateAssignmentTitle(subject, type, lessonNum, prefix),

// after
() => generateAssignmentTitle(subject, type, lessonNum, prefix, cell.hint_override),
```

Also update the Math-HW description block in `buildDescription` so the "Evens"/"Odds" text in the body matches the override (currently hardcoded to `parseInt(lessonNum) % 2 === 0`). Add a `hintOverride` param to `buildDescription` and branch:
- `'none'` → omit parity word entirely (`"Complete Lesson N. Show all work."`)
- `'evens'` → force "Evens"
- `'odds'` → force "Odds"
- `null/undefined` → existing parity logic

### Type check
Confirm `PacingCell` (in `src/store/useSystemStore.ts`) exposes `hint_override`. If not, add the optional field there too.

### Files to modify
1. `src/lib/assignment-build.ts` — pass `cell.hint_override` into `generateAssignmentTitle`; thread into `buildDescription` for the body text.
2. `src/store/useSystemStore.ts` — add `hint_override?: HintOverride` to `PacingCell` if missing.

### Out of scope
- No DB / migration changes (column already exists).
- No UI changes (Phase 2.3 already shipped the popover).
- Memory resolver cache: `resolveMemory` keys by `subject:type` — overrides won't poison the cache because the memo only records confirmed user-named titles, but worth a quick read of `memory-resolver.ts` to confirm. Will verify during implementation.

### Verify
- Set Math Lesson 13 → override "None" → save → run a deploy (or inspect `assignment-build` output) → Canvas title is `SM5 HW — Lesson 13` (no Evens/Odds), body says "Complete Lesson 13. Show all work."
- Set Math Lesson 14 (even) → override "Odds" → deployed title becomes `SM5 Odds HW — Lesson 14`, body says "Odds".
- Leave override null on Lesson 15 → behavior unchanged (Odds, parity-derived).
