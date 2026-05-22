---
name: kanban
description: >
  Explicit `/kanban` task orchestration for multi-agent git worktrees. Use when the
  user invokes `/kanban`, mentions kanban/thread/task/role work, asks a
  developer/reviewer/tester/integrator seat to continue, or the current worktree is
  already registered. Do not treat ordinary code review requests as kanban review
  unless kanban context is explicit.
---

# Kanban Skill

多 Agent（多 git worktree）共享一份 `~/.kanban/kanban.json` 状态文件的协作协议。约束**写入边界**、**并发安全**、**角色识别**三件事。

数据模型、状态机、字段归属、目录布局、并发安全详见 `references/data-model.md`。

## 触发路径与参数分派

### 路径 A：用户显式调用 `/kanban <args>`

解析 `$ARGUMENTS`，按下表分派：

| 形态 | 行为 | 加载 reference |
|------|------|---------------|
| `--init` | 初始化 `~/.kanban/` | `references/cmd-init.md` |
| `--new [<context>]` | 从上下文创建任务 | `references/cmd-new.md` |
| `--update <id> [<path>=<value>…]` | 交互式或快捷更新 | `references/cmd-update.md` |
| `--thread <id> [<context>]` | 查询任务视图 | `references/data-model.md` + `references/cmd-query.md` |
| `--role <role> [<context>]` | 当前 worktree 自注册 | `references/cmd-role.md` |
| `--thread <id> --role <role> [<context>] --standby` | 注册后进入席位待命 | `references/cmd-role.md` + `references/cmd-standby.md` |
| `--standby` | 已注册席位进入待命 | `references/data-model.md` + `references/cmd-standby.md` |
| `--clear [<id>]` | 归档终态任务 | `references/cmd-clear.md` |
| 空 / `--help` | 运行 `help.ts`，回复简短提示 | 内置 |

**空命令回复模板**（根据对话语言选择，不要逐字输出 help.ts stdout）：

- 中文: 哦呼，不知道做什么好的话，看看上方的 help 输出吧 :)
- English: Oh hey, not sure what to do? Check the help output above :)

`$SCRIPTS` = `~/.claude/skills/kanban/scripts`

**通用规则**：

- UUID 支持短前缀（≥6），精确匹配 ≤1 时直通；多候选时 AskUserQuestion 让用户选
- 所有 TS 脚本通过 `bun run $SCRIPTS/<name>.ts [args…]`
- 写操作必须走 `scripts/kanban-lock.ts` 的 `withKanbanLock()`
- 汇报简明：一行状态 + diff + 下一步建议，不复述全任务
- Canonical role key 是 `tester`；旧输入 `test` 仅作为 legacy alias 兼容。报告类型 `test-report` 与文件名 `test-<NN>.md` 保持历史命名。

### 任务定位公共流程

`--role`、`--update`、`--thread` 三个命令共用：

1. 用户提供 uuid → 直接使用（支持短前缀 ≥6）
2. 未提供 uuid → 读 kanban.json，筛选活跃任务（`status ∈ {in_progress, planned, draft}`）
3. 恰好一个活跃任务 → 静默选中，注明"已自动选择任务 <short>"
4. 多个活跃任务 → AskUserQuestion 列出候选（`<short> — <description> [<status>]`），排序：`in_progress` 优先 > `planned` > `draft`
5. 无活跃任务 → 提示"当前无活跃任务"，建议 `--new` 创建或 `--update <uuid> status=planned` 激活
6. 终态任务（`done / archived / aborted`）不列入候选

### 路径 B：自动触发（cwd 在某 worktree 内）

1. `cwdName = basename(pwd)`
2. 遍历 kanban，找 task 满足 `task.status ∈ { planned, in_progress }`：
   - 遍历 `developer`/`tester`/`integrator` 条目，匹配 `.cwd` 字段等于 `cwdName`
   - 若无 cwd 匹配，回退为 key 名等于 `cwdName`（兼容旧数据）
   - `reviewer` 不参与 cwd 匹配（reviewer 不绑定 worktree）
3. 多匹配 → 取 `updated` 最新；仍多 → AskUserQuestion 列候选
4. 记录：`key = <匹配到的条目 key>`，`role = <条目所在 role key>`
5. 按下方「角色手册索引」加载 `references/data-model.md` + 对应角色手册进入工作模式（`tester` 仍使用 `references/role-test.md`）
6. 后续 `agent-write.ts` 调用使用 `--worktree <key>`

**草案例外**：自动触发时若 `task.status == "draft"`，**不进入工作模式**，提示：

```
当前任务仍是草案(status=draft)，请先完善后提升状态:
  /kanban --update <uuid>                  # 交互式完善
  /kanban --update <uuid> status=planned   # 校验并发布
```

### 路径 C：`/kanban --clear [<uuid>]`

1. Agent 运行 `bun run clear.ts [<uuid>]`（扫描模式）
2. 若 `candidates` 为空，回复"无待归档任务"
3. 若 `candidates` 非空，展示清单并请用户文本确认
4. 用户确认后，运行 `bun run clear.ts --commit [<uuid>]` 执行归档
5. 汇报结果（归档数量、清理的 repo 目录）

### 路径 D：`/kanban --standby`

待命是 Human 显式开启的**前台值班模式**。它不创建后台服务，不跨会话运行。当前 Agent 每 30 秒检查一次本席位是否有可行动作，最多持续 6 小时；到期回复 `已退出 Standby，请根据需要重启`。

1. 若命令同时包含 `--role <role>`，先按 `references/cmd-role.md` 完成注册/认领，记录 `stableKey`。
2. 若命令只有 `--standby`，运行 `bun run $SCRIPTS/standby-resolve.ts`，从当前 cwd 解析唯一活跃席位。
3. 进入待命循环：调用 `standby-trigger.ts --thread <uuid> --role <role> --key <stableKey> --seen <seen>`。
4. `ready=false` → `sleep 30` 后继续。
5. `ready=true` → 将 `fingerprint` 追加到本会话 `seen`，按对应角色手册自动履职；完成后继续待命。
6. 机制异常（找不到席位、脚本失败、写入失败等）→ 停止待命并汇报原因。

`standby-trigger.ts` 是纯读脚本，不写 report、不改 kanban。所有正式交付仍必须遵守角色手册与共享交付合同。

## 运行时：Bun

所有 TS 脚本用 Bun 执行：

```bash
bun run $SCRIPTS/<script>.ts [args...]
```

`which bun` 失败时：在 `--init` 环节提示安装（`curl -fsSL https://bun.sh/install | bash`），其他命令直接报缺失后中止。

## 关键约束

- 所有写操作必须经过 `withKanbanLock` —— 绕过锁会导致并发竞态，两个 Agent 同时写入时其中一个的更新会静默丢失
- `status=draft` 的任务不应自动开工 —— plan 未定稿且条目可能未注册，应先由用户提升到 `planned`
- `/kanban --update` 只改人工领域字段（`status/description/plan/draft/repo` 及各 role 条目的 `brief`）；Agent 领域字段必须通过 `scripts/agent-write.ts` 修改
- `reviewer` 不绑定 worktree，注册时 `cwd = null`；`developer` 需要在 worktree 中注册
- `~/.kanban/.locks/` 下的文件由 `proper-lockfile` 自动管理，手动增删会导致锁库误判 stale lock

## 持久化原则

所有工作产出必须持久化到文件系统。对话文本是临时的，不视为交付。

- 代码变更必须 `git commit`（本地提交到 worktree 分支）。push 行为按角色：
  - Developer：push 限自己的 feature 分支，禁止推 main/master
  - Integrator：唯一有权合并分支并 push 到 main/master
  - Reviewer / Tester：不产生代码变更，只拉取 diff 阅读
- 报告文件必须写入 `~/.kanban/<repo>/<uuid>/`：
  - dev report → `report-<worktree>-<NN>.md`
  - review → `review-<dev>-<NN>.md`
  - plan review → `plan-review-<NN>.md`
  - test report → `test-<NN>.md`
  - integration report → `integration-<NN>.md`
- Kanban 状态更新必须经过 `agent-write.ts`（Agent 领域字段）或 `update-task.ts`（人工领域字段）
- 仅靠对话告知"做完了"不够 —— 其他 Agent 和工作流环节只能通过文件系统读取结果

任何 Agent 在报告状态变更（`waiting_review`、`done` 等）之前，必须先完成对应的文件写入和 kanban 状态更新。

## 子命令索引

| 命令 | Reference |
|------|-----------|
| `/kanban --init` | `references/cmd-init.md` |
| `/kanban --new [<context>]` | `references/cmd-new.md` |
| `/kanban --update <id> [ops]` | `references/cmd-update.md` |
| `/kanban --thread <id> [<context>]` | `references/cmd-query.md`（需要数据模型时加载 `references/data-model.md`） |
| `/kanban --issue <open|done|closed>` | `references/data-model.md` + `references/role-test.md` |
| `/kanban --clear [<id>]` | `references/cmd-clear.md` |
| `/kanban --role <role> [<context>]` | `references/cmd-role.md` |
| `/kanban --standby` | `references/cmd-standby.md` |

## 角色手册索引

路径 B 自动触发时，根据匹配到的 role key 加载对应手册：

| Role | Reference | 加载条件 |
|------|-----------|----------|
| `developer` | `references/role-developer.md` | 条目属于 `task.developer` |
| `reviewer` | `references/role-reviewer.md` | 条目属于 `task.reviewer` |
| `tester` | `references/role-test.md` | 条目属于 `task.tester` |
| `integrator` | `references/role-integrator.md` | 条目属于 `task.integrator` |

自动触发时同时加载 `references/data-model.md`。

共享交付顺序：`references/shared-delivery-contract.md`。报告 frontmatter 规范：`references/frontmatter-templates.md`，生成报告前读一次。实际写文件时优先使用 `assets/report-skeletons/*.md` 的对应骨架。

## 汇报风格

- 一行状态标记（`✅ / 📝 / ❌ / ⚠️`）
- 变更 diff（新增/修改/删除字段）
- 下一步推荐动作
- 不复述整个任务对象或 plan 内容
- **脚本 stdout 逐字输出**：`query.ts`、`status.ts` 等读命令的标准输出已格式化好。将其 stdout 逐字写入回复，不总结、不省略、不重新排版为表格。`help.ts` 除外——空命令时走回复模板
