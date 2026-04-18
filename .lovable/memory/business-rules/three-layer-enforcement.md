---
name: Three-Layer Rule Enforcement
description: Defense-in-depth — Friday/LA/History/Science/Math-Triple rules enforced at builder, edge function, and DB trigger
type: feature
---

Every business rule that gates assignment creation is enforced at THREE layers. Bypassing any one layer must not allow forbidden Canvas writes.

| Layer | File | Behavior |
|-------|------|----------|
| 1. Builder | `src/lib/assignment-build.ts` | Sets `skipReason` on the BuiltAssignment; UI hides/dims and Deploy button skips. |
| 2. Edge Function | `supabase/functions/canvas-deploy-assignment/index.ts` | Hydrates `subject/day/type/is_synthetic` from `pacing_rows` when payload omits them, then rejects with `status: "BLOCKED"` + `deploy_log` row + warn notification. |
| 3. DB Trigger | `enforce_friday_rules()` on `pacing_rows` BEFORE INSERT/UPDATE | Forces `create_assign=false` (and `at_home=NULL` on Friday) for any non-synthetic row that violates Friday / Language Arts / History / Science rules. |

## Synthetic bypass
Math Triple Logic siblings (Fact Test, Study Guide) carry `is_synthetic=true` and bypass all three layers — they are generator-owned, not user-entered.

## Rule matrix
- **Friday**: non-Test → `create_assign=false`, `at_home=NULL`. Builder skip, edge BLOCKED, trigger forced.
- **Language Arts**: `type ∉ {CP, Classroom Practice, Test}` → no assignment at all three layers.
- **History / Science**: `create_assign=false` always. Pages/announcements still render.
- **Math Study Guide**: 0 points, `omit_from_final=true`, `is_synthetic=true`. Monday Test variant injects "distribute Friday prior" note.
- **Reading Test**: required phrases from `system_config.auto_logic.readingTestPhrases` injected into description.

## Edge function payload contract
Callers SHOULD send `day`, `type`, `subject`, `isSynthetic` for fast guard evaluation. If only `rowId` is sent (e.g., `automation-friday-deploy`), the function hydrates from the DB.
