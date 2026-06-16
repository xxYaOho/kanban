---
kind: dev-report
uuid: <uuid>
worktree: <worktree-name>
role: developer
attempt: 1
created: <ISO8601>
status_after: ready_for_test
related_plan: ~/.kanban/<repo>/<uuid>/plan.md
related_issue: null
self_review: self-review-<worktree-name>-01.md
gate_review_required: false
branch: <git-branch>
---

# Dev Report — <worktree-name> attempt 01

## Summary
- 一句话:做了什么

## Changes
- 关键文件 + 改动说明
- 必要时贴关键 diff 片段

## Tests
- 跑了什么,结果如何
- 已知未覆盖的风险

## Notes for Reviewer
- 重点看 X
- 有意为之的取舍 Y
