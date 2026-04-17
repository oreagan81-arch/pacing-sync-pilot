
The user pasted "PROMPT 1" which is an identity/rules setup prompt — not an implementation request. It establishes context for a series of upcoming prompts. No code changes are needed yet; they want me to acknowledge the rules and wait for Prompt 2.

Since this is a system-priming message (not a build request), the right response is a short acknowledgment plan confirming I understand the constraints and am ready for Prompt 2. No exploration or file changes required.

## Acknowledgment — Thales OS Identity Locked In

I understand. Confirming the operating rules before we proceed:

**Project context locked:**
- Existing production app — **not** a rebuild
- Stack: React + Supabase + Canvas LMS + Lovable (already in place)
- Single user: Owen Reagan, Grade 4, Thales Academy

**Non-negotiables I will follow:**
1. No multi-user features (no auth flows, no role tables, no user switching)
2. No rebuilding working systems — extend only
3. All Canvas API calls routed through Supabase Edge Functions (`canvas-deploy-assignment`, `canvas-deploy-page`, `canvas-post-announcement`, `gas-dispatch`, `friday-publish`)
4. Canvas tokens stay in Edge Function secrets (`CANVAS_API_TOKEN`, `CANVAS_BASE_URL`) — never in frontend
5. GAS calls proxied through `gas-dispatch` to bypass CORS

**Mission scope acknowledged** — autonomous management of:
- Weekly Canvas pages · Assignments · Announcements
- File organization · Friendly URLs · Content mapping
- Homeroom newsletter · Daily teacher summaries
- Health monitoring · Teacher memory layer · Autonomous scheduling

**Current foundation already in place** (verified from existing code):
- 8-table schema (`system_config`, `weeks`, `pacing_rows`, `deploy_log`, `files`, `announcements`, `newsletters`, `content_map`)
- Edge functions for Canvas deploy, file classification, GAS dispatch, Friday auto-publish
- Pages: Dashboard, Pacing Entry/Viewer, Page Builder, Assignments, Announcements, Newsletter, File Organizer, Health Monitor, Settings

**Ready for Prompt 2.** No code changes will be made on this message — awaiting your next prompt in the sequence.
