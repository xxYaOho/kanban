# /kanban --update

更新任务的人工领域字段。支持交互式和快捷形态;快捷形态跳过候选推荐与容错,校验失败直接报错。

## 命令形态

```bash
/kanban --update <uuid>
/kanban --update <uuid> <path>=<value> [<path>=<value>...]
```

UUID 解析、活跃任务筛选和多候选处理遵循 `SKILL.md` 的任务定位公共流程。终态任务不列入默认候选。

## 字段合同

允许 `/kanban --update` 修改:

| 范围 | 字段 / 操作 | 规则 |
|------|-------------|------|
| 顶层 | `status` / `description` / `plan` / `draft` / `repo` | 人工领域字段 |
| role brief | `<role>.<name>.brief` | 仅未认领条目可改 |
| 新增条目 | `add:<role>:<name>:<json>` | `draft/planned` 可新增;`in_progress` 只允许追加 idle 条目 |
| 删除条目 | `del:<role>:<name>` | 仅 `draft/planned` 且条目未认领时可删 |

未认领条目定义:`status=idle && attempt=0`。已认领条目(`attempt > 0` 或 `status != idle`)禁止通过 `--update` 修改 brief 或删除。

新增条目必须满足:

- role 合法;`test` alias 归一为 `tester`。
- name 非空,且同 role 下不存在。
- JSON 是对象,且包含非空 `brief`。
- `blocked_on` 仅 developer 可带,并执行下方最终 developer 图预校验。

拒绝 `/kanban --update` 修改:

| 类型 | 字段 |
|------|------|
| Agent 字段 | `<role>.<name>.status` / `attempt` / `error` / `blocked_on` / `reports` / `review` / `pass` / `fail` / `report` / `merged` / `conflicts` / `cwd` / `worktree` / `case_document` |
| 系统字段 | `created` / `updated` |

这类字段必须由角色脚本、`agent-write.ts` 或系统锁内逻辑维护。越权时拒绝,不要建议直接编辑 `kanban.json` 作为正常路径。收尾字段有额外 guard:`developer.status=done`、tester case/report/pass/fail/status、integrator report/merged/conflicts/status 必须通过对应 `action-write.ts` action 写入。

## `blocked_on` 预校验

`add:developer:<name>:{"brief":"...","blocked_on":"<other-dev>"}` 可创建带依赖的 developer 条目。

`update-task.ts` 当前只透传 `blocked_on`,不校验依赖图。Agent 调脚本前必须基于本次 ops 应用后的最终 developer 图检查:

- `blocked_on` 仅允许出现在 developer 条目。
- 值必须指向同任务内另一个 developer。
- 禁止自引用。
- 禁止环形依赖。

校验失败时中止 update,不要调用脚本。

## Plan 变更与席位重评估

当本次 update 修改 `plan`,且任务状态为 `draft` 或 `planned` 时,写入前必须重评估 developer 席位是否仍适配新 plan。评估标准复用 `cmd-new.md` 的预分配席位 4 条件。

处理规则:

- 席位仍适配:保存 plan,在 diff 中提示席位仍适配。
- 需要调整:让用户选择重建 developer 席位、保留当前席位并提示可能不匹配、或仅保存 plan。
- 已认领 developer 不能通过 `del` / `add` 重建;此时只能让用户选择仅保存 plan 或取消 update。
- 非 developer 角色不参与重建。
- `in_progress` 不做整体席位重评估;multi-plan 执行中追加子计划时,只允许追加新的 idle 条目。

交互式 plan 输入应先校验文件存在且非空。快捷形态不做交互容错,但仍要执行字段、状态和依赖校验。

## `status → planned` 校验

提升到 `planned` 时必须通过 `validatePromotableTask()` 的完整校验:

- `plan` 文件存在且非空。
- 至少一个 role 条目存在。
- 每个 role 条目有非空 `brief`。
- 若 `plan.md` 是 multi-plan 索引:
  - 至少一个实际 `plan-*.md` 子计划存在。
  - 主 `plan.md` 中引用的 `./plan-*.md` 必须存在。
  - 至少一个 role 条目对应某个子计划。

不满足则拒绝写入并列出缺失项。

状态更新还需遵守脚本限制:`in_progress` 不允许回退到 `planned`。

## 交互式流程

1. 定位任务:按 `SKILL.md` 公共流程解析 uuid 或选择唯一活跃任务。
2. 回显当前人工字段:`status`、`description`、`plan`、`draft`、`repo`、所有 role brief。
3. 采集要改的字段:
   - `status`:推荐合理转移,但只写合法 task status。
   - `description`:可基于 plan/repo/brief 生成候选,避免空泛描述。
   - `plan`:探测对话路径、当前 worktree Markdown、任务目录 Markdown;输入后校验存在且非空。
   - `draft`:原始需求草稿路径,可为空。
   - `repo`:可从 `~/.kanban/` 现有目录选择或手动输入。
   - `<role>.<name>.brief`:必须非空,且条目未认领。
   - 新增 / 删除 role 条目:按字段合同限制。
4. 展示 diff 并二次确认;用户可确认、取消或回到修改。
5. 将交互结果翻译为脚本 op,通过 `update-task.ts` 原子提交。

diff 至少展示字段前后值和新增/删除条目:

```text
以下改动将提交,确认?
  status: draft -> planned
  description: "旧描述" -> "新描述"
  + developer.dev-serve: { brief: "重构命令解析器" }
  - developer.obsolete
```

## 快捷形态

用户形态示例:

```bash
/kanban --update 019d9b9f description="CLI v0.14 优化" status=planned
/kanban --update 019d9b9f developer.dev-serve.brief="重构命令解析器"
/kanban --update 019d9b9f add:developer:plan-export:'{"brief":"实现 plan-export 子计划","blocked_on":"dev-core"}'
/kanban --update 019d9b9f add:tester:tester-main:'{"brief":"集成验证"}'
/kanban --update 019d9b9f del:developer:obsolete
```

reviewer 不作为默认拆分项。只有 owner 决定需要独立 gate 时,才添加 reviewer 席位或执行 `owner.request-reviewer-gate`。

Agent 将用户快捷形态翻译为脚本 op:

```bash
bun run $SCRIPTS/update-task.ts <uuid> <op>...
```

脚本 op:

- `set:<path>=<value>`
- `add:<role>:<name>:<json>`
- `del:<role>:<name>`

多个 op 在锁内原子提交;任一非法则全部不生效。

## 删除条目边界

- 删除 `status=idle, attempt=0` 的条目是删除未认领预分配席位。
- 删除已认领条目会断开 kanban 状态追踪,因此禁止。
- `in_progress` 下禁止删除任何已有条目。
- 若目的是将预分配席位映射到真实 cwd,优先使用 `/kanban --role` 的认领机制。

## 汇报模板

```text
✅ 任务 <short> 已更新
变更:
  status: draft -> planned
  + developer.dev-serve: { brief: "..." }
当前 status: planned
下一步:在对应 worktree 内启动 Agent。
```

## 撤销

不支持命令级撤销。依赖提交前 diff 和二次确认防误操作;需要历史恢复时,建议对 `~/.kanban` 使用 git 管理。
