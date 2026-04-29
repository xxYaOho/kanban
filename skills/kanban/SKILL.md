---
name: kanban
description: >
  Multi-agent kanban via git worktrees. Each worktree registers a role, writes progress
  reports, and atomically updates shared task state in `~/.kanban/kanban.json`.
---

# Kanban Skill

多 Agent(多 git worktree)共享一份 `~/.kanban/kanban.json` 状态文件的协作协议。本 skill 约束**写入边界**、**并发安全**、**角色识别**三件事。

## 触发路径与参数分派

### 路径 A:用户显式调用 `/kanban <args>`

解析 `$ARGUMENTS`,按下表分派:

| 形态                                | 行为                          | 加载 reference             |
| ----------------------------------- | ----------------------------- | -------------------------- |
| `--init`                            | 初始化 `~/.kanban/`(检测 Bun) | `references/cmd-init.md`   |
| `--new [<context>]`                 | 从上下文创建任务              | `references/cmd-new.md`    |
| `--update <uuid> [<path>=<value>…]` | 交互式或快捷更新              | `references/cmd-update.md` |
| `--uuid <uuid>`                     | 查询任务视图                  | `references/cmd-query.md`  |
| `--role <role> [<context>]`         | 当前 worktree 自注册          | `references/cmd-role.md`   |
| 空 / `--help`                       | 运行 `help.ts`，print stdout | 内置                       |

**通用规则**:

- UUID 支持短前缀(≥6),精确匹配 ≤1 时直通;多候选时 AskUserQuestion 让用户选
- 所有 TS 脚本通过 `bun run ~/.claude/skills/kanban/scripts/<name>.ts [args…]`
- 写操作必须走 `scripts/kanban-lock.ts` 的 `withKanbanLock()`
- 汇报简明:一行状态 + diff + 下一步建议,不复述全任务

### uuid 解析公共流程

`--role`、`--update`、`--uuid` 三个命令共用以下流程定位目标任务:

1. 用户提供 uuid → 直接使用(支持短前缀 ≥6)
2. 未提供 uuid → 读 kanban.json,筛选活跃任务(`status ∈ {in_progress, planned, draft}`)
3. 恰好一个活跃任务 → 静默选中,执行结果中注明"已自动选择任务 <short>"
4. 多个活跃任务 → AskUserQuestion 列出候选(`<short> — <description> [<status>]`),排序:`in_progress` 优先 > `planned` > `draft`
5. 无活跃任务 → 提示"当前无活跃任务",建议 `--new` 创建或 `--update <uuid> status=planned` 激活
6. 终态任务(`done / archived / aborted`)不列入候选

### 路径 B:自动触发(cwd 在某 worktree 内)

1. `cwdName = basename(pwd)`
2. 遍历 kanban,找 task 满足 `task.status ∈ { planned, in_progress }` 且其 `worktree` 中存在匹配条目:
   - 优先匹配 `worktree` 条目的 `.cwd` 字段等于 `cwdName`(精确匹配物理目录)
   - 若无 `.cwd` 匹配,回退为 `task.worktree[cwdName]` 存在(兼容旧数据,旧数据无 `.cwd` 字段)
3. 多匹配 → 取 `updated` 最新;仍多 → AskUserQuestion 列候选
4. 记录 stable key:`key = <匹配到的 worktree key>`
5. `role = task.worktree[key].role`
6. 加载 `references/role-<role>.md` 进入工作模式
7. 后续 `agent-write.ts` 调用使用 `--worktree <key>`(stable key)

**草案例外**:自动触发时若 `task.status == "draft"`,**不进入工作模式**,提示:

```
当前任务仍是草案(status=draft),请先完善后提升状态:
  /kanban --update <uuid>                  # 交互式完善
  /kanban --update <uuid> status=planned   # 校验并发布
```

## 运行时:Bun

所有 TS 脚本用 Bun 执行:

```bash
bun run ~/.claude/skills/kanban/scripts/<script>.ts [args...]
```

`which bun` 失败时:在 `--init` 环节提示安装(`curl -fsSL https://bun.sh/install | bash`),其他命令直接报缺失后中止,不做降级。

## 数据模型

`~/.kanban/kanban.json` 顶层是 `{ <uuid>: Task }` 字典:

```jsonc
{
  "019d9b9f-7c0c-7e44-8f37-8a77ce1edcf7": {
    "status": "planned", // draft | planned | in_progress | done | archived | aborted
    "repo": "wave",
    "description": "CLI v0.14 优化",
    "draft": null, // 可选。原始需求草稿文件路径(不一定存在),用于追溯最初意图
    "plan": "~/.kanban/wave/019d9b9f.../plan.md",
    "created": "2026-04-18T14:00:00+08:00",
    "updated": "2026-04-18T14:32:00+08:00",
    "worktree": {
      "dev-serve": {
        "role": "developer", // developer | reviewer | test | integrator
        "action": "重构命令解析器",
        "status": "working", // idle | working | waiting_review | review_approved | review_rejected | done | blocked
        "attempt": 1,
        "report": "~/.kanban/wave/019d9b9f.../report-dev-serve-01.md",
        "review": null,
        "test": null,
        "integration": null, // null | "pending" | "merged" | "conflict"
        "error": null,
        "blocked_on": null,
      },
    },
  },
}
```

### `draft` 字段语义

`draft` 是**可选的原始需求草稿路径**,与 `status=draft` 是两个独立概念:

- `draft` 字段:记录讨论阶段产出的需求文稿路径,**不一定存在于磁盘**,仅作追溯用
- `status=draft`:任务占位状态,plan 未定稿、worktree 可能为空
- 两者可以同时存在,也可以各自独立出现
- `draft` 字段在 `--uuid` 视图里低调展示(Plan 行下方),不抢眼
- 最终验收时若发现实现偏离预期,可以翻出 `draft` 文件对照原始意图

### 字段归属

| 字段                                                        | 归属       | 谁可以改                                |
| ----------------------------------------------------------- | ---------- | --------------------------------------- |
| `status`, `description`, `plan`, `draft`, `repo`, `created` | 人工领域   | `/kanban --new` / `--update`            |
| `worktree.<name>.role`, `worktree.<name>.action`            | 人工领域   | `/kanban --new` / `--update` / `--role` |
| `worktree.<name>.cwd`                                       | 系统       | `scripts/role.ts` 认领/注册时自动写入    |
| `worktree.<name>.status/report/review/test/integration/attempt/error/…` | Agent 领域 | `scripts/agent-write.ts`                |
| `updated`                                                   | 系统       | 每次写锁内自动刷新                      |

### 状态机

- `draft`:占位。`plan` 可为占位文件,`worktree` 可为 `{}`。**Agent 不自动开工**
- `planned`:`plan` 已定稿,`worktree` 非空且字段齐全。可以开工
- `in_progress`:任意 worktree `status` 进入 `working`
- `done` / `archived` / `aborted`:终态

**`draft → planned` 提升校验**(`update-task.ts` 内实现):

- `plan` 文件存在且非空
- `worktree` 至少一个条目,每条有合法 `role` 和非空 `action`

## 并发安全

**所有写操作必须走** `scripts/kanban-lock.ts` 的 `withKanbanLock(mutator)`:

- 基于 `proper-lockfile` 的建议性文件锁
- 锁文件:`~/.kanban/.locks/kanban.json.lock`
- 锁内:读 → mutate → 写回 → 刷新 `updated`
- 竞争时最多重试 10 次,退避 ~100ms,全部失败抛错
- 锁过期(stale)阈值 60 秒;写入采用 tmp + rename 原子操作
- `kanban.json` 中的注释在首次脚本写入后会被清除(脚本产出纯 JSON)

读操作不加锁。

## 目录布局

```
~/.kanban/
├── kanban.json
├── .locks/                  # ⚠️ 禁止手动删除
├── <repo>/<uuid>/
│   ├── plan.md
│   ├── report-<worktree>-<NN>.md
│   ├── review-<worktree>-<NN>.md
│   ├── test-<NN>.md
│   └── *-error.md
└── archive/YYYY-MM/

~/.claude/skills/kanban/     # 本 skill(无 commands/ 目录)
```

## 关键约束

- 所有写操作必须经过 `withKanbanLock`——绕过锁会导致并发竞态，两个 Agent 同时写入时其中一个的更新会静默丢失
- `status=draft` 的任务不应自动开工——plan 未定稿且 worktree 可能未注册，应先由用户提升到 `planned`
- `/kanban --update` 只改人工领域字段（`status/description/plan/draft/repo` 及 worktree 的 `role/action`）；Agent 领域字段（`worktree.<name>.status/review/test/report/integration/attempt/error/blocked_on`）必须通过 `scripts/agent-write.ts` 修改，混用会导致人工操作覆盖 Agent 状态
- draft 任务的 `plan` 文件是讨论阶段的占位文档，非权威来源——开始实现前确认 `status` 已提升到 `planned`
- `~/.kanban/.locks/` 下的文件由 `proper-lockfile` 自动管理——手动增删会导致锁库误判 stale lock，引发写冲突

## 子命令索引

用户输入对应 `/kanban` 子命令时加载匹配的 reference:

| 命令                                | Reference                  |
| ----------------------------------- | -------------------------- |
| `/kanban --init`                    | `references/cmd-init.md`   |
| `/kanban --new [<context>]`         | `references/cmd-new.md`    |
| `/kanban --update <uuid> [ops]`     | `references/cmd-update.md` |
| `/kanban --uuid <uuid>`             | `references/cmd-query.md`  |
| `/kanban --role <role> [<context>]` | `references/cmd-role.md`   |

## 角色手册索引

路径 B 自动触发时，根据 worktree 条目的 `role` 字段加载对应手册:

| Role         | Reference                      | 加载条件                                       |
| ------------ | ------------------------------ | ---------------------------------------------- |
| `developer`  | `references/role-developer.md` | `worktree.<key>.role === "developer"`          |
| `reviewer`   | `references/role-reviewer.md`  | `worktree.<key>.role === "reviewer"`           |
| `test`       | `references/role-test.md`      | `worktree.<key>.role === "test"`               |
| `integrator` | `references/role-integrator.md` | `worktree.<key>.role === "integrator"`          |

报告 frontmatter 规范:`references/frontmatter-templates.md`,生成报告前读一次。

## 汇报风格

- 一行状态标记(`✅ / 📝 / ❌ / ⚠️`)
- 变更 diff(新增/修改/删除字段)
- 下一步推荐动作
- 不复述整个任务对象或 plan 内容
