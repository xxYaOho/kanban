# Kanban vNext Loop Runtime Implementation Plan

本计划对应 `docs/vnext-loop-runtime-design.md`。它只描述实现顺序,不要求一次性完成全部 vNext。

## 成功标准

- 默认流程支持 `owner -> developer ready_for_test -> tester -> owner closeout`。
- reviewer 和 integrator 可以按需插入,但不再是默认阻塞环节。
- developer 每次 vNext attempt 必须同时提交 dev report 和 self-review。
- owner closeout 不能绕过 active integrator。
- 旧任务继续可读、可查询、可按 v1 流程运行。

## Phase 1: 数据模型与协议常量

修改范围:

- `skills/kanban/scripts/protocol.ts`
- `skills/kanban/scripts/kanban-io.ts`
- `skills/kanban/assets/task-template.json`
- `skills/kanban/references/data-model.md`

工作:

1. 增加 canonical role `owner`。
2. 增加 owner status: `idle | working | waiting | done | blocked`。
3. 增加 developer status `ready_for_test`。
4. 在 developer entry 中增加:
   - `self_review: string | null`
   - `review_gate_required: boolean`
5. 在 task 中增加 `owner` role collection。
6. 定义 owner entry:
   - `status`
   - `brief`
   - `attempt`
   - `worktree`
   - `cwd`
   - `decisions`
   - `closeout`
   - `error`

Active integrator 判定:

```text
active integrator = 存在任意 integrator entry 且 status != done 且 (
  attempt > 0
  或 report 非空
  或 merged/conflicts 非空
  或 owner decisions 中存在 type=integrator_required
)
```

owner closeout guard 必须使用这个判定。

验证:

- `bun run typecheck`
- 更新 regression fixture,确保旧任务没有 owner 时仍可读。

## Phase 2: Artifact 合同与 skeleton

修改范围:

- `skills/kanban/references/frontmatter-templates.md`
- `skills/kanban/assets/report-skeletons/`
- `skills/kanban/scripts/paths.ts`
- `skills/kanban/scripts/query.ts`

工作:

1. 新增 `self-review` frontmatter 合同。
2. 新增 `owner-closeout` frontmatter 合同。
3. 新增 skeleton:
   - `self-review.md`
   - `owner-closeout.md`
4. 扩展 report discovery,识别:
   - `self-review-<dev>-<NN>.md`
   - `owner-closeout-<NN>.md`
5. dev report frontmatter 增加:
   - `self_review`
   - `gate_review_required`

验证:

- query 最近报告能显示新 artifact。
- frontmatter 文档保留字段合同,不塞长示例。

## Phase 3: Write Actions 第一阶段

第一阶段不删除 `agent-write.ts` / `update-task.ts`。新增 action wrapper 或扩展现有脚本,让关键 vNext 写入走 action 语义。

修改范围:

- `skills/kanban/scripts/agent-write.ts`
- 可选新增 `skills/kanban/scripts/action-write.ts`
- `skills/kanban/scripts/regression-test.ts`

必须实现的 action:

1. `owner.register`
   - 前置: task 无 owner,且尚未创建任何 developer / reviewer / tester / integrator 席位。
   - 写入: `owner.<key>`。

2. `owner.request-reviewer-gate`
   - 前置: developer 存在。
   - 写入:
     - append owner decision
     - `developer.<dev>.review_gate_required=true`
     - 若 developer status 为 `ready_for_test`,同时改为 `waiting_review`
   - 不允许把 `idle` / `working` / `follow_issue` developer 直接改成 `waiting_review`。

3. `developer.submit-report`
   - 前置: dev report 和 self-review 文件都存在。
   - 校验:
     - 两个 artifact 的 `uuid/worktree/attempt` 一致。
     - dev report frontmatter 的 `self_review` 指向同 attempt self-review。
     - self-review frontmatter 的 `source_report` 指向同 attempt dev report。
   - 写入:
     - `reports += report`
     - `self_review=<file>`
     - 若 `review_gate_required=true`,status=`waiting_review`
     - 否则 status=`ready_for_test`

4. `reviewer.submit-gate-review`
   - 前置: developer status=`waiting_review`,review 文件存在。
   - approve 写入:
     - `review=<file>`
     - `review_gate_required=false`
     - `status=ready_for_test`
   - reject 写入:
     - `review=<file>`
     - `review_gate_required=false`
     - `status=review_rejected`

5. `owner.closeout`
   - 前置:
     - tester done。
     - closeout file exists。
     - 若存在 active integrator,必须 integrator done 且 integration report 非空。
   - 写入:
     - `owner.closeout=<file>`
     - task `status=done`

验证:

- 每个 action 补正向和负向 regression。
- open issue 场景仍要求 related_issue。
- action 内所有写入走锁。

## Phase 4: Query / Standby / Tester 流转

修改范围:

- `skills/kanban/scripts/query.ts`
- `skills/kanban/scripts/standby-trigger.ts`
- `skills/kanban/scripts/standby-resolve.ts`
- `skills/kanban/references/cmd-query.md`
- `skills/kanban/references/cmd-standby.md`
- `skills/kanban/references/role-test.md`

工作:

1. tester blocker 将 `ready_for_test | review_approved | done` 视为不阻塞。
2. tester standby 在所有 developer 为 `ready_for_test | review_approved | done` 时触发。
3. reviewer standby 只针对 `waiting_review` developer。
4. developer standby 支持 `review_rejected` 和 `follow_issue` 旧路径不变。
5. query JSON 增加:
   - `readyForTestTargets`
   - `reviewGateTargets`
   - `ownerCloseoutBlockedBy`
6. query 的推荐动作同步 vNext 语义。

验证:

- regression 覆盖 tester full trigger。
- regression 覆盖 reviewer optional gate。
- regression 覆盖 owner closeout 被 active integrator 阻塞。

## Phase 5: 命令与角色文档

修改范围:

- `skills/kanban/SKILL.md`
- `skills/kanban/references/cmd-new.md`
- `skills/kanban/references/cmd-role.md`
- `skills/kanban/references/role-developer.md`
- `skills/kanban/references/role-reviewer.md`
- `skills/kanban/references/role-test.md`
- 新增 `skills/kanban/references/role-owner.md`
- `skills/kanban/references/role-integrator.md`
- `skills/kanban/references/shared-delivery-contract.md`

工作:

1. `/kanban --new` 后提示是否注册 owner。
2. `/kanban --role owner` 支持 main / cwd=null 规则。
3. developer 文档改为默认 self-review + `ready_for_test`。
4. reviewer 文档改为 optional gate。
5. tester 文档改为接 `ready_for_test`。
6. owner 文档定义 plan、gate decision、closeout。
7. integrator 文档定义 optional integration seat。
8. shared delivery contract 增加 self-review 和 owner-closeout。

验证:

- 文档示例命令全部对齐脚本字段。
- 不复制完整协议到多个 role 文档。

## Phase 6: Benchmark 资产

修改范围:

- `benchmarks/replica-blenderhunt/`
- `benchmarks/approval-platform/` 仅保留历史 smoke baseline,不再扩展为主 benchmark

工作:

1. 以 `benchmarks/replica-blenderhunt/PRD.md` 作为主 benchmark 需求真源。
2. 保持 `AGENTS.md` 只说明目标、约束、交付物和时间打点,不复制 kanban 角色职责或任务拆分规则。
3. 保持每次 run 复用同一 PRD / DESIGN / token 资源,对比完成时长、交付质量、截图和 kanban artifact。
4. 记录从 owner 创建 thread、multi-plan、席位推进、tester 验收到 owner closeout 的关键时间点。
5. 保留 approval-platform 已有 run 作为历史单 Agent smoke baseline,但不作为 vNext 主对比项目。

验证:

- 能手工创建一次 replica-blenderhunt run 目录并填表。
- benchmark 不依赖 `skills/kanban` 运行时加载。

## 阶段提交建议

推荐分 3 个 PR / commit group:

1. Model + artifacts: Phase 1-2。
2. Runtime flow: Phase 3-4。
3. Docs + benchmark: Phase 5-6。

每个 runtime group 必跑:

```bash
cd skills/kanban
bun run typecheck
bun run test
```
