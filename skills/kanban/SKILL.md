---
name: kanban
description: Kanban 多 Agent 协作协议。管理 `~/.kanban/kanban.jsonc` 中的任务状态机(draft/planned/in_progress/done/archived/aborted),在 git worktree 场景下自动识别当前 agent 身份(developer/reviewer/test)并加载对应角色手册。使用此 skill 当用户运行 `/kanban --xxx` 命令,或当 cwd 是一个已登记在 kanban 里的 worktree 目录且需要推进任务(开发、评审、测试、交付报告)时。即便用户只说"写个 report""走下一步""review 一下改动"等不直接提 kanban 的措辞,只要当前 worktree 已在 kanban 中登记,也要触发本 skill 以正确写入 `report-*.md` / `review-*.md` / `test-*.md` 并原子更新 worktree 字段。
---

# Kanban Skill

多 Agent(多 git worktree)共享一份 `~/.kanban/kanban.jsonc` 状态文件的协作协议。本 skill 约束**写入边界**、**并发安全**、**角色识别**三件事。

## 触发路径

1. **命令触发**:用户输入 `/kanban --xxx`,由 `commands/kanban.md` 分派,加载对应的 `references/cmd-*.md`
2. **自动触发**:当 cwd 等于某 worktree 名(basename),且 `~/.kanban/kanban.jsonc` 中存在该 worktree 的登记,自动按角色身份进入工作模式
3. **草案例外**:自动触发时若 `task.status == "draft"`,**不要**进入工作模式。而是明确提示:
   ```
   当前任务仍是草案(status=draft),请先完善后提升状态:
     /kanban --update <uuid>                  # 交互式完善
     /kanban --update <uuid> status=planned   # 校验并发布
   ```

## 运行时:Bun

所有 TS 脚本用 Bun 执行,避免 Node+tsx 冷启动和编译开销:

```bash
bun run ~/.claude/skills/kanban/scripts/<script>.ts [args...]
```

如果 `which bun` 失败:在 `--init` 环节显式提示用户安装(`curl -fsSL https://bun.sh/install | bash`),其他命令**不做降级**,直接报缺失后中止。降级分支会污染每个脚本的 shebang,代价比收益大。

## 数据模型

`~/.kanban/kanban.jsonc` 结构(顶层是 `{ <uuid>: Task }` 字典):

```jsonc
{
  "019d9b9f-7c0c-7e44-8f37-8a77ce1edcf7": {
    "status": "planned",                         // draft | planned | in_progress | done | archived | aborted
    "repo": "wave",
    "description": "CLI v0.14 优化",
    "plan": "~/.kanban/wave/wave/019d9b9f.../plan.md",
    "created": "2026-04-18T14:00:00Z",
    "updated": "2026-04-18T14:32:00Z",
    "worktree": {
      "dev-serve": {
        "role": "developer",                     // developer | reviewer | test
        "action": "重构命令解析器",
        "status": "working",                     // idle | working | waiting_review | review_rejected | done | blocked
        "attempt": 1,
        "report": "~/.kanban/wave/wave/019d9b9f.../report-dev-serve-01.md",
        "review": null,
        "test": null,
        "error": null,
        "blocked_on": null
      }
    }
  }
}
```

**字段归属**:

| 字段                                                           | 归属        | 谁可以改                                      |
| -------------------------------------------------------------- | ----------- | --------------------------------------------- |
| `status`, `description`, `plan`, `repo`, `created`             | 人工领域    | `/kanban --new` / `--update`                  |
| `worktree.<name>.role`, `worktree.<name>.action`               | 人工领域    | `/kanban --new` / `--update`                  |
| `worktree.<name>.status/report/review/test/attempt/error/...`  | **Agent 领域** | 对应角色的 Agent 在工作过程中自动写入       |
| `updated`                                                      | 系统        | 每次写锁内自动刷新                            |

**状态机语义**:

- `draft`:占位中。允许 `plan` 为占位文件、`worktree` 为 `{}`。**Agent 不应自动开工**
- `planned`:`plan` 已定稿、`worktree` 非空且每条都字段齐全。可以开工
- `in_progress`:任意一个 worktree 的 `status` 进入 `working`
- `done` / `archived` / `aborted`:终态

**`draft → planned` 提升校验**(在 `update-task.ts` 中实现):
- `plan` 文件存在且非空
- `worktree` 至少一个条目,每个 worktree 对象必须有 `role`(枚举)和 `action`(非空字符串)

## 身份识别(仅对非 draft 任务)

当 skill 自动触发(cwd 在某 worktree 内)时:

1. `worktreeName = basename(pwd)`
2. 遍历 kanban,找 task 满足:
   - `task.worktree[worktreeName]` 存在
   - `task.status ∈ { planned, in_progress }`
3. 多匹配 → 取 `updated` 最新;仍多 → 用 AskUserQuestion 列候选让用户选
4. `role = task.worktree[worktreeName].role`
5. 读取并加载 `references/role-<role>.md` 作为工作手册

## 并发安全

多个 Claude 进程同时写 `kanban.jsonc` 会导致覆盖。**所有写操作必须走** `scripts/kanban-lock.ts` 的 `withKanbanLock(mutator)`:

- 基于 `proper-lockfile` 实现建议性文件锁
- 锁文件在 `~/.kanban/.locks/kanban.jsonc.lock`
- 锁内执行:读 → 传给 mutator → 写回 → 触发 `updated` 刷新
- 锁竞争时最多重试 10 次,每次退避 ~100ms,全部失败抛错

**读操作不加锁**(JSONC 解析失败时报告错误即可,不会破坏文件)。

## 目录布局

```
~/.kanban/                              # 数据层
├── kanban.jsonc                        # 状态总表
├── .locks/                             # ⚠️ 锁文件,禁止手动删除
├── package.json                        # Bun 依赖清单
├── bun.lockb
├── node_modules/
├── wave/<repo>/<uuid>/                 # 每任务工作目录
│   ├── plan.md
│   ├── report-<worktree>-<NN>.md
│   ├── review-<worktree>-<NN>.md
│   ├── test-<NN>.md
│   └── *-error.md
└── archive/YYYY-MM/                    # 归档

~/.claude/
├── commands/kanban.md                  # /kanban 分派入口
└── skills/kanban/                      # 本 skill
```

## ⛔ 禁止清单

- ❌ **绕过 `withKanbanLock` 直接写 `kanban.jsonc`**(会造成并发丢失)
- ❌ **在 `status=draft` 任务上自动进入工作模式**(plan 可能不完整)
- ❌ **通过 `/kanban --update` 改 Agent 领域字段**(`worktree.<name>.status/review/test/report/attempt/error/blocked_on`)
- ❌ **把 draft 任务的 `plan` 文件当权威来源直接开工**(先让用户提升到 planned)
- ❌ **在 `~/.kanban/.locks/` 下手动增删文件**

## 子命令索引

每个子命令详细规格放在 `references/cmd-<name>.md`,按需加载:

| 命令                                  | Reference                      |
| ------------------------------------- | ------------------------------ |
| `/kanban --init`                      | `references/cmd-init.md`       |
| `/kanban --new [--from-file/--draft]` | `references/cmd-new.md`        |
| `/kanban --update <uuid> [ops]`       | `references/cmd-update.md`     |
| `/kanban --uuid <uuid>`               | `references/cmd-query.md`      |

## 角色手册索引

自动触发后按 role 加载一份:

| Role        | Reference                          |
| ----------- | ---------------------------------- |
| `developer` | `references/role-developer.md`     |
| `reviewer`  | `references/role-reviewer.md`      |
| `test`      | `references/role-test.md`          |

报告 frontmatter 规范集中放在 `references/frontmatter-templates.md`,生成报告前读一次。

## 汇报风格

每个子命令和每次状态跃迁后**简明汇报**:

- 用一行成功/失败标记(`✅ / 📝 / ❌ / ⚠️`)
- 列出变更 diff(新增/修改/删除的字段)
- 指出下一步推荐动作(例:下一个命令、切到哪个 worktree)
- **不要**复述整个任务对象或 plan 内容
