# Frontmatter 模板

所有报告文件都是 Markdown + YAML frontmatter。本文档集中所有模板,生成报告前读一次,照抄结构。

## dev-report

文件:`report-<worktree>-<NN>.md`

```markdown
---
kind: dev-report
uuid: 019d9b9f-7c0c-7e44-8f37-8a77ce1edcf7
worktree: dev-serve
role: developer
attempt: 1
created: 2026-04-18T15:20:00+08:00
status_after: waiting_review      # 本次提交后 worktree 的 status
related_plan: ~/.kanban/wave/019d9b9f.../plan.md
related_issue: null               # 修复 open issue 时必须填 issue-*.md
branch: feature/cli-v014-serve    # 可选,本次对应的 git 分支
---

# Dev Report — dev-serve attempt 01

## Summary
- 一句话:做了什么

## Changes
- 关键文件改动列表,带简短说明
- 必要时贴关键 diff 片段

## Tests
- 跑了什么,结果
- 已知未覆盖的风险

## Notes for Reviewer
- 重点看 X
- 有意为之的取舍 Y
```

## review

文件:`review-<worktree>-<NN>.md`(NN 与被 review 的 dev report 一致)

```markdown
---
kind: review
uuid: 019d9b9f-...
worktree: dev-serve                # 被 review 的 worktree
reviewer_worktree: review
role: reviewer
attempt: 1
created: 2026-04-18T15:40:00+08:00
verdict: approve                   # approve | reject
related_report: report-dev-serve-01.md
---

# Review — dev-serve attempt 01

## Verdict
approve(或 reject,并列要改的点)

## Checklist
- [x] 符合 plan 语义
- [x] 代码质量
- [x] 测试覆盖
- [x] 兼容性

## Findings
- (若 reject)要改的点 1:…… 文件:path:line
- (若 reject)要改的点 2:……

## Notes
- 对整体实现的观察
```

## plan-review

文件:`plan-review-<NN>.md`

```markdown
---
kind: plan-review
uuid: 019d9b9f-...
reviewer_worktree: review
role: reviewer
attempt: 1
created: 2026-04-18T14:30:00+08:00
verdict: approve                      # approve | changes_requested
related_plan: ~/.kanban/wave/019d9b9f.../plan.md
---

# Plan Review — attempt NN

## Verdict
approve（或 changes_requested，并列需修改的点）

## Summary
- 一句话结论

## Checklist
- [ ] 目标明确，范围合理
- [ ] 技术方案可行
- [ ] 风险已识别并有缓解措施
- [ ] 工作量估算合理
- [ ] 依赖与前置条件已列明

## Findings
- 发现 1：……
- 发现 2：……

## Suggestions
- 建议 1：……
- 建议 2：……
```

## test-report

文件:`test-<NN>.md`

```markdown
---
kind: test-report
uuid: 019d9b9f-...
test_worktree: test
role: tester
attempt: 1
created: 2026-04-18T16:30:00+08:00
verdict: pass                      # pass | fail
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
- Unit: 120 pass / 0 fail
- Integration: 18 pass / 0 fail
- E2E smoke: 5/5 pass

## Regression
- 抽样场景与结果

## Failures(若 verdict=fail)
- 失败点 1 → 指向 dev-serve 的具体代码位置
- 失败点 2 → 指向 dev-gui 的具体代码位置
```

## issue

文件:`issue-<slug>.md`

```markdown
---
kind: issue
uuid: 019e4b5a-9e79-76e2-a29c-d22087b39063
title: "压缩预览在 unchanged 场景下没有保留 receipt"
status: open                         # open | done | closed
type: bug
owner: mainline                      # developer key;非 developer owner 需 issue.ts open --force
created: 2026-05-22T14:30:00+08:00
updated: 2026-05-22T14:30:00+08:00
---

# Issue - 压缩预览在 unchanged 场景下没有保留 receipt

## Summary

测试 `wave compress <path>` 的 unchanged 场景时发现没有输出 receipt。该问题阻塞 tester verdict，因为验收要求 unchanged 文件也必须保留 receipt，并显示 savedPercent。

## Reproduction

- Command: `bun test tests/compress-preview.test.ts`
- Scenario: unchanged 文件进入 compress preview
- Related test report: `test-02.md`

## Expected / Actual

Expected: unchanged 文件输出 receipt，包含 savedPercent。
Actual: unchanged 文件被跳过，没有 receipt。

## Diagnosis

初步定位到 `mainline` 的 compress preview 结果生成逻辑。changed 文件路径行为正常，问题集中在 unchanged 分支的 receipt 生成。

## Owner

- Developer: `mainline`
- Required next state: `mainline` 修复后提交 dev report，并重新进入 reviewer 审查。
- Dev report must include: `related_issue: issue-mainline-bug-2f02a011.md`

## Retest Plan

1. 合并 `mainline` 修复分支到 tester worktree。
2. 重跑 unchanged compress preview 场景。
3. 确认 receipt 与 savedPercent 存在。
4. 抽查 changed 文件路径，确认没有回归。

## Resolution

Pending.
```

## integration-report

文件:`integration-<NN>.md`

```markdown
---
kind: integration-report
uuid: 019d9b9f-...
worktree: integration
role: integrator
attempt: 1
created: 2026-04-18T17:00:00+08:00
merged_branches:
  - feature/cli-v014-serve
  - feature/cli-v014-gui
conflicts_resolved: 3
conflicts_escalated: []
regression_result: pass               # pass | fail
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
- Unit: 150 pass / 0 fail
- Integration: 25 pass / 0 fail
- E2E smoke: 8/8 pass

## Integration Branch
- Branch: integration/v0.14-attempt-01
- Base: main
```

## error-note(异常说明)

文件:`<worktree>-<NN>-error.md` 或 `test-<NN>-error.md`

```markdown
---
kind: error-note
uuid: 019d9b9f-...
worktree: dev-serve
role: developer
attempt: 1
created: 2026-04-18T15:25:00+08:00
status_after: blocked
blocked_on: "plan 未说明 X 的错误处理语义"
---

# Error — dev-serve attempt 01

## What happened
一句话事件描述

## What I tried
- 尝试 1
- 尝试 2

## What I need
- 需要用户/reviewer/其他 worktree 的什么决策或信息
```

## 字段约束

- `created`:ISO8601,本地时区,精确到秒(如 `2026-04-18T15:20:00+08:00`)
- `attempt`:整数,从 1 开始,每次重新工作递增
- 所有枚举值大小写敏感,严格匹配文档
- 路径可以用 `~/` 或相对 `~/.kanban/` 的相对路径,保持全局一致
