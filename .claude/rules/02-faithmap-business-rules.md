# FaithMap Core Business Rules (`CD-01`–`CD-10` & `DEC-01`–`DEC-14`)

Every line of code and schema must respect these non-negotiable rules:

1. **Option C — 100% Full Replacement (`CD-09`):**
   - Zero reuse of legacy Puntakit code, database schemas, auth, or endpoints.
2. **Draft Autosave Safety (`CD-01`):**
   - Background autosave updates draft state only. Autosave must NEVER submit or advance the state machine.
3. **Approval Authority & Fallback (`CD-02`, `CD-03`, `DEC-04`):**
   - Body Leader is the sole final approver.
   - If a group has an assigned Care Leader/Coordinator, Supervisor review precedes Body Leader approval.
   - If no Care Leader/Coordinator is assigned, report routes directly to Body Leader fallback (`CD-03`).
4. **Approval Integrity (`CD-08`, `DEC-05`):**
   - Self-approval is strictly prohibited (`DEC-05`). A leader cannot approve a report they submitted.
   - Auto-approval is strictly forbidden under all circumstances (`CD-08`).
5. **Cadence & Deadlines (`CD-04`, `CD-05`, `DEC-01`, `DEC-02`):**
   - Canonical Timezone: `Asia/Bangkok` (UTC+7).
   - Reporting Week: Monday 00:00 ICT to Sunday 23:59 ICT.
   - Deadline: Sunday 20:00 ICT (`DEC-01`).
   - Immutable Meeting Brief: Generated automatically at Sunday 20:30 ICT (`DEC-01`).
6. **Leadership Flexibility:**
   - Never force every group to use an identical leadership structure. Groups may have a Group Leader, Care Leader, Coordinator, or direct Body Leader supervision.
7. **Privacy & PDPA (`DEC-06`, `DEC-10`):**
   - Member personal information (phone, address, absence notes) is restricted to direct stewards and Body Leader.
   - Explicit consent (`consent_for_contact = true`) is mandatory before capturing visitor contact info.
