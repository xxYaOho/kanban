---
kind: test-cases
uuid: <uuid>
tester_worktree: <tester worktree 名>
role: tester
attempt: 1
created: <ISO8601>
updated: <ISO8601>
status: draft # draft | human_reviewed | revised
source_plan: ~/.kanban/<repo>/<uuid>/plan.md
covered_worktrees:
  - dev-serve
related_reports: []
human_reviewed_at: null
---

# Test Cases — attempt 01

## Scope
- 本轮验证目标

## Cases
| ID | Source | Scenario | Expected | Priority | Status |
|----|--------|----------|----------|----------|--------|
| TC-01 | plan / brief | 用户路径、命令或操作 | 期望结果 | must | draft |

## Revision Notes
- 初版基于 plan / brief 设计
- 根据 dev report / review / issue 增补的用例记录在这里
