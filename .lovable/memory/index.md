# Memory: index.md
Updated: just now

# Project Memory

## Core
- Thin Client React (Zustand) frontend, GAS backend via `VITE_GOOGLE_APPS_SCRIPT_URL`, Supabase proxy (`gas-dispatch`) for deployment POSTs.
- Supabase anonymous auth. Single-user teacher environment.
- Canvas base URL: `thalesacademy.instructure.com`. Sanitize trailing slashes in Edge Functions.
- Dark theme ('Command Center' slate) with blue accents, DM Sans font. Statuses: Emerald (success), Amber (sync), Red (alerts/orphans).
- Friday Rules (mandatory): no At Home, no homework assignments (Tests OK), `create_assign=false`; reminder announcements may post Friday 4 PM ET.
- All deployments MUST include `published: true` on PUT if page is `front_page: true`.
- Math Test rows always deploy as Triple: Written Test + Fact Test (same day) + Study Guide (due day-1, synthetic, omit_from_final).
- Language Arts: only `CP` and `Test` rows create assignments; prefix `ELA4A`; course `21944`. DB trigger enforces.
- History/Science: never create assignments. Per-week `weeks.active_hs_subject` toggle; inactive subject's Canvas page deploys a redirect to the active one.

## Memories
- [Canvas Course Routing Logic](mem://integrations/canvas/routing-logic) — Course IDs and Reading/Spelling Together Logic
- [Subject Specific Logic](mem://business-rules/subject-logic) — Exceptions and automation for Math Triple Logic, LA, and Science/History
- [Application Theme](mem://design/application-theme) — Token details for Command Center aesthetic, typography, and status colors
- [Canvas HTML Standards](mem://integrations/canvas/html-output-standards) — Required DesignPLUS containers, color hexes, and Brevity Mandate
- [Risk Evaluation Model](mem://business-rules/risk-evaluation-model) — Point-based weekly risk calculator determining High/Medium/Low workload
- [Deployment Optimization](mem://integrations/canvas/deployment-optimization) — Skip redundant Canvas deployments via SHA-256 content hashing
- [Automated Publishing](mem://business-rules/automated-publishing) — `friday-publish` edge function cron job for auto-publishing
- [Newsletter AI](mem://business-rules/newsletter-ai) — Gemini tool calling for extracting and polishing homeroom notes
- [File Organizer](mem://features/file-organizer) — Multi-tier classification, AI vision MIME detection, and strict renaming
- [Google Drive Integration](mem://integrations/canvas/google-drive-integration) — Dynamic embedded download links and 'At Home' section rules
- [System Architecture](mem://architecture/system-logic-engine) — GAS data fetch, Supabase `pacing_rows` metadata merge, and CORS proxy proxying
- [Pacing Entry](mem://features/pacing-entry) — Gemini-powered Smart Paste shorthand parsing and specific UI highlights
- [Assignment Logic](mem://business-rules/assignment-logic) — Naming conventions, points, and weighting rules across subjects
- [Page Management](mem://integrations/canvas/page-management) — Q#W# naming constraints and strict front_page deployment stability rules
- [Content Map Registry](mem://db/content-map-registry) — Auto-linking lesson identifiers to Canvas files and Orphan detection
- [Reading + Spelling Together Logic](mem://business-rules/together-logic) — Shared course/page/announcement, separate assignments, Spelling Test N=1..N×5
- [Friday Rules](mem://business-rules/friday-rules) — Mandatory: no At Home, no homework, create_assign=false, DB trigger enforced; 4 PM ET reminder exception
