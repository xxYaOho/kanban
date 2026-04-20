---
kind: integration-report
uuid: <uuid>
worktree: <integrator-worktree>
role: integrator
attempt: 1
created: <ISO8601>
merged_branches:
  - feature/cli-v014-serve
  - feature/cli-v014-gui
conflicts_resolved: 3
conflicts_escalated: []
regression_result: pass # pass | fail
---

# Integration Report — attempt 01

## Merged Branches
- feature/cli-v014-serve: merged (2 conflicts resolved)
- feature/cli-v014-gui: merged (no conflicts)

## Conflict Details
### Resolved
- src/cli/parser.ts: import ordering (auto-resolved)
- ...

### Escalated
- (none)

## Regression Results
- Unit: <pass>/<total>
- Integration: <pass>/<total>
- E2E smoke: <pass>/<total>

## Integration Branch
- Branch: integration/<tag>-attempt-<NN>
- Base: main
