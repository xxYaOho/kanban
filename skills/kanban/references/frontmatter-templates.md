# Frontmatter 合同

所有报告文件都是 Markdown + YAML frontmatter。生成报告前读本文件确认字段合同；实际正文优先使用 `assets/report-skeletons/*.md` 的骨架。没有骨架的类型按本文列出的正文段落写。

通用字段约束:
- `created` / `updated`: ISO8601,本地时区,精确到秒,如 `2026-04-18T15:20:00+08:00`
- `attempt`: 整数,从 1 开始,每次重新工作递增
- 所有枚举值大小写敏感
- 路径可用 `~/` 或 `~/.kanban/` 相对路径,同一文件内保持一致

## dev-report

文件:`report-<worktree>-<NN>.md`
骨架:`assets/report-skeletons/dev-report.md`

Frontmatter:
- `kind: dev-report`
- `uuid`
- `worktree`
- `role: developer`
- `attempt`
- `created`
- `status_after: waiting_review`
- `related_plan`
- `related_issue`: 无 issue 时为 `null`;修复 open issue 时必须填 `issue-*.md`
- `branch`: 可选,本次对应 git 分支

正文段落:`Summary` / `Changes` / `Tests` / `Notes for Reviewer`。

## review

文件:`review-<worktree>-<NN>.md`,NN 与被 review 的 dev report 一致。
骨架:`assets/report-skeletons/review.md`

Frontmatter:
- `kind: review`
- `uuid`
- `worktree`: 被 review 的 developer worktree
- `reviewer_worktree`
- `role: reviewer`
- `attempt`
- `created`
- `verdict: approve | reject`
- `related_report: report-<worktree>-<NN>.md`

正文段落:`Verdict` / `Checklist` / `Plan Alignment` / `Code Health` / `Testability / Risk` / `Findings` / `Notes`。

## plan-review

文件:`plan-review-<NN>.md`。无 skeleton,按本节结构写。

Frontmatter:
- `kind: plan-review`
- `uuid`
- `reviewer_worktree`
- `role: reviewer`
- `attempt`
- `created`
- `verdict: approve | changes_requested`
- `related_plan`

正文段落:
- `Verdict`: verdict 与需修改点
- `Summary`: 一句话结论
- `Checklist`: 目标、具体动作、对象/边界、不做事项、方案、验收、风险、工作量、依赖
- `Findings`: 发现的问题
- `Suggestions`: 建议的补充或调整

## test-cases

文件:`test-cases-<NN>.md`
骨架:`assets/report-skeletons/test-cases.md`

Frontmatter:
- `kind: test-cases`
- `uuid`
- `tester_worktree`
- `role: tester`
- `attempt`
- `created`
- `updated`
- `status: draft | human_reviewed | revised`
- `source_plan`
- `covered_worktrees`: 数组
- `related_reports`: 数组,可空
- `human_reviewed_at`: 未评审时为 `null`

正文段落:`Scope` / `Cases` / `Revision Notes`。`Cases` 表至少包含 `ID`、`Source`、`Scenario`、`Expected`、`Priority`、`Status`。

## test-report

文件:`test-<NN>.md`
骨架:`assets/report-skeletons/test-report.md`

Frontmatter:
- `kind: test-report`
- `uuid`
- `test_worktree`
- `role: tester`
- `attempt`
- `created`
- `verdict: pass | fail`
- `related_case_document: test-cases-<NN>.md`
- `covered_worktrees`: 数组

正文段落:`Verdict` / `Environment` / `Case Document` / `Test Cases` / `Results` / `Regression` / `Failures`。

## issue

文件:`issue-<slug>.md`。由 `issue.ts` 创建;无 skeleton,按本节结构写。

Frontmatter:
- `kind: issue`
- `uuid`
- `title`
- `status: open | done | closed`
- `type: bug`
- `owner`: developer key;非 developer owner 需 `issue.ts open --force`
- `created`
- `updated`

正文段落:
- `Summary`: 问题摘要和为什么阻塞 tester verdict
- `Reproduction`: 命令、场景、相关 test report
- `Expected / Actual`
- `Diagnosis`
- `Owner`: owner、要求的下一状态、dev report 必须引用的 issue
- `Retest Plan`
- `Resolution`: open 时为 `Pending.`

## integration-report

文件:`integration-<NN>.md`
骨架:`assets/report-skeletons/integration-report.md`

Frontmatter:
- `kind: integration-report`
- `uuid`
- `worktree`
- `role: integrator`
- `attempt`
- `created`
- `merged_branches`: 数组
- `conflicts_resolved`: 数字
- `conflicts_escalated`: 数组
- `regression_result: pass | fail`

正文段落:`Merged Branches` / `Conflict Details` / `Regression Results` / `Integration Branch`。

## error-note

文件:`<worktree>-<NN>-error.md` 或 `test-<NN>-error.md`。无 skeleton,按本节结构写。

Frontmatter:
- `kind: error-note`
- `uuid`
- `worktree`
- `role`
- `attempt`
- `created`
- `status_after`
- `blocked_on`

正文段落:
- `What happened`
- `What I tried`
- `What I need`
