# Engineering Workflow & Discipline Standard

This project adheres to the Superpowers development lifecycle:

## Stage-to-Skill Mapping
| Stage | Required Skill | Invocable Trigger | Core Discipline |
|---|---|---|---|
| **Clarification** | `brainstorming` | Before proposing or writing code | Ask clarifying questions, explore edge cases, avoid unvalidated assumptions |
| **Architectural Design** | `writing-plans` | Complex features / multi-step tasks | Create phased, test-driven implementation plan with acceptance gates |
| **Execution** | `executing-plans` | Working through implementation plans | Follow steps sequentially, record progress, run tests at each step |
| **Logic Implementation** | `test-driven-development` | Core domain rules, state machines | Write failing test first, implement minimal code to pass, refactor |
| **Root Cause Debugging** | `systematic-debugging` | Bugs, unexpected test failures | Find root cause with evidence before editing; never guess or patch blindly |
| **Code Review** | `requesting-code-review` / `receiving-code-review` | Before merging / closing a task | Verify against requirements, check for regressions, verify test outputs |
| **Workspace Isolation** | `using-git-worktrees` | Feature branches | Work in isolated branch worktrees to protect main |
| **Final Verification** | `verification-before-completion` | End of task | Run full test suite, build, and typecheck; show evidence of passing |
