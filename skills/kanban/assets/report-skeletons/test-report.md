---
kind: test-report
uuid: <uuid>
test_worktree: <test worktree 名>
role: test
attempt: 1
created: <ISO8601>
verdict: pass # pass | fail
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

## Results
- Unit: <pass>/<total>
- Integration: <pass>/<total>
- E2E smoke: <pass>/<total>

## Regression
- 抽样场景与结果

## Failures(若 verdict=fail)
- 失败点 1 → 指向 <worktree> 的具体代码位置
- 失败点 2 → ...
