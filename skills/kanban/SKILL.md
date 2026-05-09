---
name: kanban
description: >
  Multi-agent kanban via git worktrees. Each worktree registers a role, writes progress
  reports, and atomically updates shared task state in `~/.kanban/kanban.json`.
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
| `--clear [<id>]` | 归档终态任务 | `references/cmd-clear.md` |
| 空 / `--help` | 运行 `help.ts`，回复简短提示 | 内置 |

**空命令回复模板**（根据对话语言选择，不要逐字输出 help.ts stdout）：

- 中文: 哦呼，不知道做什么好的话，看看上方的 help 输出吧 :)
- English: Oh hey, not sure what to do? Check the help output above :)

**通用规则**：

- UUID 支持短前缀（≥6），精确匹配 ≤1 时直通；多候选时 AskUserQuestion 让用户选
- 所有 TS 脚本通过 `bun run ~/.claude/skills/kanban/scripts/<name>.ts [args…]`
- 写操作必须走 `scripts/kanban-lock.ts` 的 `withKanbanLock()`
- 汇报简明：一行状态 + diff + 下一步建议，不复述全任务

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
   - 遍历 `developer`/`test`/`integrator` 条目，匹配 `.cwd` 字段等于 `cwdName`
   - 若无 cwd 匹配，回退为 key 名等于 `cwdName`（兼容旧数据）
   - `reviewer` 不参与 cwd 匹配（reviewer 不绑定 worktree）
3. 多匹配 → 取 `updated` 最新；仍多 → AskUserQuestion 列候选
4. 记录：`key = <匹配到的条目 key>`，`role = <条目所在 role key>`
5. 加载 `references/data-model.md` + `references/role-<role>.md` 进入工作模式
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

## 运行时：Bun

所有 TS 脚本用 Bun 执行：

```bash
bun run ~/.claude/skills/kanban/scripts/<script>.ts [args...]
```

`which bun` 失败时：在 `--init` 环节提示安装（`curl -fsSL https://bun.sh/install | bash`），其他命令直接报缺失后中止。

## 关键约束

- 所有写操作必须经过 `withKanbanLock` —— 绕过锁会导致并发竞态，两个 Agent 同时写入时其中一个的更新会静默丢失
- `status=draft` 的任务不应自动开工 —— plan 未定稿且条目可能未注册，应先由用户提升到 `planned`
- `/kanban --update` 只改人工领域字段（`status/description/plan/draft/repo` 及各 role 条目的 `brief`）；Agent 领域字段必须通过 `scripts/agent-write.ts` 修改
- `reviewer` 不绑定 worktree，注册时 `cwd = null`；`developer` 需要在 worktree 中注册
- `~/.kanban/.locks/` 下的文件由 `proper-lockfile` 自动管理，手动增删会导致锁库误判 stale lock

## 子命令索引

| 命令 | Reference |
|------|-----------|
| `/kanban --init` | `references/cmd-init.md` |
| `/kanban --new [<context>]` | `references/cmd-new.md` |
| `/kanban --update <id> [ops]` | `references/cmd-update.md` |
| `/kanban --thread <id> [<context>]` | `references/cmd-query.md`（需要数据模型时加载 `references/data-model.md`） |
| `/kanban --clear [<id>]` | `references/cmd-clear.md` |
| `/kanban --role <role> [<context>]` | `references/cmd-role.md` |

## 角色手册索引

路径 B 自动触发时，根据匹配到的 role key 加载对应手册：

| Role | Reference | 加载条件 |
|------|-----------|----------|
| `developer` | `references/role-developer.md` | 条目属于 `task.developer` |
| `reviewer` | `references/role-reviewer.md` | 条目属于 `task.reviewer` |
| `test` | `references/role-test.md` | 条目属于 `task.test` |
| `integrator` | `references/role-integrator.md` | 条目属于 `task.integrator` |

自动触发时同时加载 `references/data-model.md`。

报告 frontmatter 规范：`references/frontmatter-templates.md`，生成报告前读一次。

## 汇报风格

- 一行状态标记（`✅ / 📝 / ❌ / ⚠️`）
- 变更 diff（新增/修改/删除字段）
- 下一步推荐动作
- 不复述整个任务对象或 plan 内容
- **脚本 stdout 逐字输出**：`query.ts`、`status.ts` 等读命令的标准输出已格式化好。将其 stdout 逐字写入回复，不总结、不省略、不重新排版为表格。`help.ts` 除外——空命令时走回复模板
