---
kind: review
uuid: <uuid>
worktree: <被 review 的 worktree>
reviewer_worktree: <reviewer worktree 名>
role: reviewer
attempt: 1
created: <ISO8601>
verdict: approve # approve | reject
related_report: report-<worktree>-01.md
---

# Review — <worktree> attempt 01

## Verdict
approve(或 reject,并列要改的点)

## Checklist
- [x] 符合 plan 语义
- [x] 代码质量
- [x] 测试覆盖
- [x] 兼容性

## Plan Alignment
- plan / brief 要求:
- 实现对应证据:
- 偏离或未覆盖:

## Code Health
- 结构、命名、可读性:
- 可维护性风险:

## Testability / Risk
- 已有测试证据:
- 仍需 tester 重点覆盖:

## Findings
- (若 reject)要改的点 1:…… 文件:path:line
- (若 reject)要改的点 2:……

## Notes
- 对整体实现的观察
