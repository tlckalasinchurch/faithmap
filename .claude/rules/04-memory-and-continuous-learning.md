# Memory, Continuous Learning & Skill Governance

## 1. Claude-Mem Integration
- **FaithMap Context Scope:** All persistent memory for FaithMap must cite specific architecture IDs (`FM-01` through `FM-12`) and decision IDs (`CD-01`–`CD-10`, `DEC-01`–`DEC-14`).
- **Context Query:** Before initiating architectural refactors or schema changes, query memory with `npx claude-mem search "faithmap <topic>"`.
- **Exclusion of Secrets:** Never write credentials, API keys, database connection strings, or personal member data to memory.

## 2. Task Observer Protocol
- **Pinned Workspace:** `C:\Users\Administrator\Desktop\Faithmap\skill-observations`
- **Trigger:** Activate before making the first tool call of any session; run Session Start Protocol anchored to `skill-observations`.
- **Continuous Logging:** When an agent command fails, when the user corrects an assumption, or when a workflow pattern repeats, log an observation under `skill-observations/observation-log/`.
- **Human Approval Gate:** Never generate, alter, or install new skills without explicit human review and approval.
- **Weekly Review:** Consolidate observations into workflow refinements without altering project business logic.

## 3. Skills Discovery via Skills.sh
- When adding external capabilities (e.g. Drizzle ORM optimization, Vercel edge functions, LINE LIFF SDK), query Skills.sh (`npx skills find <keyword>`).
- Always inspect the skill's source repository and obtain user consent before installation.
