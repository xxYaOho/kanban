# Kanban vNext Loop Runtime Design

本文是 `/kanban` vNext 的设计草案。目标是降低当前 skill 的熵增,同时保留多 worktree 协作最有价值的能力:隔离、可恢复、可审计、可控。

本文不修改当前运行时协议。实现前需要再拆分 plan。

## 目标

vNext 将默认流程从固定的多席位流水线收敛为 owner 主导的循环:

```text
owner -> developer loop -> tester -> owner closeout
```

复杂任务可以按需扩展:

```text
owner -> developer loop -> reviewer gate -> tester -> integrator -> owner final accept
```

核心变化:

- `owner` 成为默认核心席位。
- `developer` 内置强制 self-review loop。
- `tester` 保持默认 gate,owner 不能替代 tester。
- `reviewer` 降级为 owner 决定的 optional gate。
- `integrator` 降级为复杂集成场景的 optional seat。
- 写入入口从字段脚本分裂转向统一 write engine。
- benchmark 独立放在 skill 外部,只在需要评估协议质量时运行。

## 非目标

- 不引入 WebGUI。
- 不把 benchmark 项目放进 `skills/kanban`。
- 不删除当前 reviewer / integrator 协议,先以 vNext 兼容方式演进。
- 不用万能字段 setter 取代权限模型。
- 不把 subagent 输出只留在对话中。
- 不允许 owner 跳过 tester。若 Human 明确豁免 tester,必须另开 waiver 设计,不进入默认 vNext。

## 角色模型

### Owner

`owner` 是主线协调席位,通常在 main / 主 worktree 中工作,也可以是不绑定 worktree 的协调者。

职责:

- 创建任务、制定 `plan.md`、拆分 developer brief。
- 定义验收标准、风险点和是否需要 optional gate。
- 审查 plan 或实现方向时,可以使用 subagent review loop。
- tester 通过后,在简单任务中执行合并、冲突处理和收尾。
- 判断是否创建 `reviewer` 或 `integrator`。

约束:

- owner 不能替代 tester。
- owner 不替 developer 完成隔离开发。
- owner 直接合并时必须写 closeout artifact。
- owner 决定 reviewer gate 是否插入;developer 可以建议,不能自行决定。

`/kanban --new` 创建任务后应提示是否注册当前会话为 owner:

```text
是否将当前会话设为 owner？
(a) 是,注册当前会话为 owner
(b) 否,仅创建任务
```

无效条件:

- 任务已有 owner。
- 任务已有任何席位进入工作状态。
- 当前会话无法形成稳定 owner key。

Owner entry schema:

```jsonc
"owner": {
  "main": {
    "status": "idle", // idle | working | waiting | done | blocked
    "brief": "主线协调、计划和收尾",
    "attempt": 0,
    "worktree": "main",
    "cwd": "main",
    "decisions": [],
    "closeout": "",
    "error": null
  }
}
```

owner 只有一个有效席位。`/kanban --new` 注册 owner 时,默认 key 为当前 cwd basename；若当前 cwd 是 repo 主工作区,使用 `main`。允许 `cwd=null` 的 owner,但同一任务不能同时存在 `cwd=null` owner 和 main owner。

owner decision 初期不新增强制 artifact。是否插入 reviewer gate、是否升级 integrator 等决策写入 owner entry 的 `decisions` 数组。数组元素使用固定对象:

```jsonc
{
  "type": "reviewer_gate" | "integrator_required",
  "target": "developer.dev-api",
  "reason": "权限状态机风险",
  "created": "2026-06-16T12:00:00+08:00",
  "evidence": "report-dev-api-01.md"
}
```

Owner 状态:

- `idle`: 已注册,等待 plan / 分配 / gate 判断。
- `working`: 正在制定计划、调整分配、处理 closeout。
- `waiting`: 等待 developer / tester / reviewer / integrator。
- `done`: closeout 完成。
- `blocked`: 需要 Human 决策或外部状态变化。

### Developer

developer 继续绑定隔离 worktree,按 `plan.md`、brief 和对应子计划执行。

新增强制要求:

- 每次 attempt 必须生成 `self-review-<dev>-<NN>.md`。
- 每次 dev report 必须链接 self-review artifact。
- subagent review 的反馈、采纳、拒绝和最终验证必须落盘。

developer 默认不再等待独立 reviewer。developer 完成 self-review loop 后提交 dev report,状态进入 `ready_for_test`,由 tester 接手。

developer vNext 状态流:

```text
idle -> working -> ready_for_test -> done
                 -> waiting_review -> under_review -> ready_for_test / review_rejected
review_rejected -> working
follow_issue -> working -> ready_for_test
working -> blocked
```

含义:

- `ready_for_test`: developer 已提交 dev report 和 self-review,可以被 tester 验收。
- `waiting_review`: owner 已插入 reviewer gate,等待 reviewer 审查。
- `review_approved`: 仅作为 v1 兼容状态保留。vNext 中 reviewer approve 后将 developer 推进到 `ready_for_test`。
- `done`: tester pass 后的完成态。

Developer entry 新增字段:

```jsonc
{
  "self_review": "self-review-dev-api-01.md",
  "review_gate_required": false
}
```

`review_gate_required=true` 是 gate intent,不表示正在等待 reviewer。只有 developer 提交 report 后,才能根据该 intent 进入 `waiting_review`。

Issue 修复回流:

- tester 创建 owner 为 developer 的 open issue 后,developer 进入 `follow_issue`。
- developer 修复 issue 后提交新 attempt、`self-review-*` 和 dev report,状态进入 `ready_for_test`。
- 若 owner 对 issue 修复插入 reviewer gate,状态先进入 `waiting_review`。

### Tester

tester 保持默认 gate。tester 负责从系统行为、用户验收、回归风险和集成结果角度验证任务。

owner 可以定义测试范围,但不能替代 tester。

tester 前置条件:

- 所有 developer 均处于 `ready_for_test` 或 `done`。
- 若存在 reviewer gate,对应 developer 必须已从 `waiting_review` 推进到 `ready_for_test`。
- 每个待测 developer 的 latest dev report 必须有 `self_review` frontmatter,且目标文件存在。
- open issue 回测时,issue owner 必须重新回到 `ready_for_test`。

### Reviewer

reviewer 降级为 optional gate。它不再默认出现在每个 developer 后面。

触发条件:

- owner 指定需要独立复核。
- plan 或实现存在方向争议。
- 涉及安全、权限、数据迁移、架构边界。
- 多 developer 存在 shared contract 风险。
- developer self-review 结论不足以支撑进入 tester。

reviewer 仍然产出 `review-<dev>-<NN>.md`。该 artifact 表示独立 gate,与 developer 的 self-review 区分。

Gate 时序:

- owner 在 developer attempt 开始前或 developer 交付后都可以插入 reviewer gate。
- 若 developer 仍在 `idle` / `working` / `review_rejected` / `follow_issue`,owner 只写 `review_gate_required=true` 和 owner decision,不改变 developer status。
- developer 提交 report 时,若 `review_gate_required=true`,状态进入 `waiting_review`;否则进入 `ready_for_test`。
- 若 developer 已提交 dev report 且状态为 `ready_for_test`,owner 插入 gate 时把该 developer 状态改为 `waiting_review`。
- reviewer approve 后写 `review-<dev>-<NN>.md`,并将 developer 状态改为 `ready_for_test`。
- reviewer reject 后写 `review-<dev>-<NN>.md`,将 `review_gate_required=false`,并将 developer 状态改为 `review_rejected`；developer 下一轮 attempt 重新生成 self-review 和 dev report。
- reviewer approve 后将 `review_gate_required=false`。
- dev report 的 `gate_review` 不回写。gate 关联由 developer entry 的 `review` 字段和 `review-*` frontmatter 表达。

### Integrator

integrator 降级为复杂集成席位。简单任务由 owner 在 main / 主工作区完成 merge 和 closeout。

创建 integrator 的条件:

- 多 developer 分支冲突明显。
- 需要独立 integration worktree。
- 合并过程本身需要代码调整。
- 主线风险高,需要隔离回归。
- owner 不希望 main 承担集成实验。

owner merge 边界:

- owner 只做 clean merge、fast-forward、普通文本冲突或低风险版本号/lockfile 冲突处理。
- owner 不做语义修复、不改业务逻辑、不补测试。
- 如果合并需要代码判断、重构、迁移调整或测试修复,必须升级为 integrator。
- 如果 owner merge 后回归失败,不得直接修 main；应回退到 developer issue 或升级 integrator。
- owner closeout 可以记录物理 worktree cleanup,但只清理 clean 且已合并的 developer/tester worktree。

## Artifact 合同

vNext 保持“正式交付必须落盘”的原则。对话不是交付物。

### Developer Report

developer report 继续使用 attempt 编号:

```text
report-dev-api-01.md
self-review-dev-api-01.md
review-dev-api-01.md
```

`report-*` frontmatter 增加:

```yaml
self_review: self-review-<dev>-<NN>.md
gate_review_required: false
```

若 owner 在 developer attempt 前已经要求 reviewer gate:

```yaml
self_review: self-review-<dev>-<NN>.md
gate_review_required: true
```

`self_review` 每次 attempt 必填。dev report 不写未来的 `review-*` 文件名。若后续插入 reviewer gate,关联写在 developer entry 的 `review` 字段和 `review-*` frontmatter。

dev report 与 self-review 必须同一次 developer submit action 一起提交。Agent 可以先在磁盘写两个文件,再一次性调用写入 action；write engine 在锁内同时校验两个文件存在、frontmatter 互相匹配、attempt 一致。

### Self Review

`self-review-*` 记录 developer 发起的 subagent review loop。它不是 reviewer gate,也不改变 developer 之外的席位状态。

frontmatter:

```yaml
---
kind: self-review
uuid: <uuid>
worktree: <dev-name>
role: developer
attempt: <NN>
created: <ISO8601>
source_report: report-<dev-name>-<NN>.md
verdict: pass | needs_changes
reviewer: subagent
---
```

正文结构:

```md
# Self Review

## Scope
- 本次审查覆盖的 plan / brief / diff / tests

## Feedback
- Critical
- Important
- Minor

## Resolution
- Accepted
- Rejected with reason
- Deferred

## Final Check
- Tests
- Remaining risk
```

`source_report` 可引用同 attempt 的 dev report,因为两个文件在同一次 submit action 中被校验。

### Owner Closeout

owner 执行合并和收尾时写:

```text
owner-closeout-01.md
```

frontmatter:

```yaml
---
kind: owner-closeout
uuid: <uuid>
owner: <owner-key>
role: owner
attempt: <NN>
created: <ISO8601>
status_after: done
test_report: test-<NN>.md
integration_report: null
merged: []
conflicts: []
---
```

closeout 应记录:

- 合并对象和 commit。
- 是否有冲突,如何处理。
- tester report。
- integration report;未启用 integrator 时写 `null` 和原因。
- 最终验证命令。
- 任务关闭状态。

如果启用了 integrator,owner closeout 引用 integration report,不重复完整集成过程。

### Report Discovery

vNext report discovery 必须识别:

- `report-<dev>-<NN>.md`
- `self-review-<dev>-<NN>.md`
- `review-<dev>-<NN>.md`
- `test-cases-<NN>.md`
- `test-<NN>.md`
- `integration-<NN>.md`
- `owner-closeout-<NN>.md`

## Unified Write Engine

vNext 需要统一 write engine,但不应把 `update-task.ts` 和 `agent-write.ts` 简单合并成万能字段 setter。

设计方向:

```text
actor + action + target -> allowed writes
```

示例 action:

- `owner.create-task`
- `owner.update-plan`
- `owner.assign-seat`
- `owner.request-reviewer-gate`
- `owner.merge-after-test`
- `owner.closeout`
- `developer.start-attempt`
- `developer.submit-report`
- `tester.submit-cases`
- `tester.submit-report`
- `reviewer.submit-gate-review`
- `integrator.submit-integration-report`

每个 action 定义:

- 可执行 actor。
- 可写 target。
- 必填 artifact。
- 允许状态转移。
- 允许字段集合。
- 前置条件。

这样可以保留 lock、原子写入和字段边界,同时减少脚本职责分裂。

最小 action table:

| Action | Actor | Preconditions | Required artifact | Writes |
|--------|-------|---------------|-------------------|--------|
| `owner.register` | owner | task has no owner and no active entries | none | `owner.<key>` |
| `owner.request-reviewer-gate` | owner | developer exists | decision entry | append owner decision, set `review_gate_required=true`; if developer is `ready_for_test`, also set `status=waiting_review` |
| `developer.submit-report` | developer | report and self-review exist; frontmatter attempt matches | `report-*` + `self-review-*` | `reports += <file>`, `self_review=<file>`, `status=waiting_review` if `review_gate_required`, else `ready_for_test` |
| `reviewer.submit-gate-review` | reviewer | developer is `waiting_review`, review file exists | `review-*` | `developer.review=<file>`, `review_gate_required=false`, `status=ready_for_test` or `review_rejected` |
| `tester.submit-cases` | tester | test-cases file exists | `test-cases-*` | `tester.case_document=<file>` |
| `tester.submit-report` | tester | test report exists | `test-*` | `tester.report=<file>`, `pass/fail`, developer `done` or `follow_issue` |
| `owner.closeout` | owner | tester done; if integrator exists and is active, integrator done and integration report exists; closeout file exists | `owner-closeout-*` | `owner.closeout=<file>`, task `status=done` |
| `integrator.submit-integration-report` | integrator | integration report exists | `integration-*` | `integrator.report=<file>`, `merged/conflicts/status` |

write engine 必须在锁内校验 artifact 已存在、frontmatter 与 action 参数一致、状态转移合法。数组字段只允许通过 action append,不暴露裸 set。

## 状态与迁移

vNext 初期应兼容现有数据模型。新增 owner、self-review 和 closeout artifact 时,不要一次性重写所有状态。

建议迁移顺序:

1. 加 owner role 和 `/kanban --new` owner 提示。
2. 加 `ready_for_test` developer 状态,并让 query / standby / tester blocker 识别 `ready_for_test`。
3. 加 `self_review` 字段、self-review skeleton 和 dev report frontmatter。
4. 让 developer 强制生成 self-review。
5. 让 tester 默认接 `ready_for_test` developer report,不依赖 reviewer approve。
6. 加 owner closeout artifact。
7. 将 reviewer / integrator 改为 optional gate。
8. 引入 unified write engine,逐步接管现有写脚本。

v1 兼容规则:

- `review_approved` 在 query / tester / standby 中等价于 `ready_for_test`。
- 旧任务没有 owner 时,不强制回填 owner。
- 旧 dev report 没有 `self_review` 时,只对 vNext action 强制。

## Benchmark

benchmark 不属于 skill 运行时。它放在 repo 根部的 `benchmarks/approval-platform/`,用于需要时验证 vNext 设计。

benchmark 不需要每次改 skill 都运行。它用于高风险协议调整,例如:

- 降级 reviewer 或 integrator。
- 改 developer 完成语义。
- 改 tester gate。
- 改 write engine。

成功标准:

- vNext 减少默认席位和 artifact 数量。
- vNext 不明显降低高风险缺陷发现率。
- 文件系统记录仍能恢复完整过程。
- Human 介入点保持清晰。

## 实施决策

- tester 以 `ready_for_test | review_approved | done` 判断 developer 不再阻塞；vNext 新 report 必须有 `self_review`。
- owner decision 初期使用 owner entry 的 `decisions` 数组；不强制新增 `decision-*` artifact。
- unified write engine 第一阶段应包裹现有脚本和锁,待 action table 稳定后再替代裸字段写入。
