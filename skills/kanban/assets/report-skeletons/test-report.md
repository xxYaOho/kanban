---
kind: test-report
uuid: <uuid>
test_worktree: <tester worktree 名>
role: tester
attempt: 1
created: <ISO8601>
verdict: pass # pass | fail
related_case_document: test-cases-01.md
covered_worktrees:
  - dev-serve
  - dev-gui
---

# Test Report — attempt 01

## Verdict
pass(或 fail + 失败原因摘要)

## Environment
- OS / runtime 版本
- 测试命令

## Case Document
- Source: test-cases-01.md
- Human review status: draft / human_reviewed / revised

## Test Cases
| Case | Source | Expected | Result | Evidence |
|------|--------|----------|--------|----------|
| 关键路径 1 | plan / brief | 期望结果 | pass / fail | 命令或手工证据 |
| 失败路径 1 | risk / issue | 期望结果 | pass / fail | 命令或手工证据 |

## Results
- Unit: <pass>/<total>
- Integration: <pass>/<total>
- E2E smoke: <pass>/<total>

## Regression
- 抽样场景与结果

## Failures(若 verdict=fail)
- 失败点 1 → 指向 <worktree> 的具体代码位置
- 失败点 2 → ...
