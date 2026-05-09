# Kanban 数据模型

`~/.kanban/kanban.json` 顶层是 `{ <uuid>: Task }` 字典。

## JSON Schema

```jsonc
{
  "019d9b9f-7c0c-7e44-8f37-8a77ce1edcf7": {
    "status": "planned", // draft | planned | in_progress | done | archived | aborted
    "repo": "wave",
    "description": "CLI v0.14 优化",
    "draft": null, // 可选。原始需求草稿文件路径，不一定存在
    "plan": "~/.kanban/wave/019d9b9f.../plan.md",
    "created": "2026-04-18T14:00:00+08:00",
    "updated": "2026-04-18T14:32:00+08:00",
    "developer": {
      "dev-serve": {
        "status": "working", // idle | working | waiting_review | under_review | review_approved | review_rejected | done | blocked
        "brief": "重构命令解析器",
        "attempt": 1,
        "blocked_on": null,
        "worktree": "dev-serve",
        "cwd": "dev-serve",
        "reports": ["report-dev-serve-01.md"],
        "review": "review-dev-serve-01.md",
        "error": null
      }
    },
    "reviewer": {
      "review": {
        "status": "done", // idle | working | done
        "brief": "审查 dev-serve 产出",
        "attempt": 1,
        "pass": ["dev-serve", "plan"],
        "report": "review-summary-01.md",
        "error": null
      }
    },
    "test": {
      "full-test": {
        "status": "idle", // idle | working | waiting | done
        "brief": "合并全部 dev 做全量测试",
        "attempt": 0,
        "worktree": null,
        "cwd": null,
        "pass": [],
        "fail": [],
        "report": "",
        "error": null
      }
    },
    "integrator": {
      "merge": {
        "status": "idle", // idle | working | done
        "brief": "合并已通过的 dev 分支",
        "attempt": 0,
        "worktree": null,
        "cwd": null,
        "merged": [],
        "conflicts": [],
        "report": "",
        "error": null
      }
    }
  }
}
```

## `draft` 字段语义

`draft` 是**可选的原始需求草稿路径**，与 `status=draft` 是两个独立概念：

- `draft` 字段：记录讨论阶段产出的需求文稿路径，**不一定存在于磁盘**，仅作追溯用
- `status=draft`：任务占位状态，plan 未定稿、worktree 可能为空
- 两者可以同时存在，也可以各自独立出现
- `draft` 字段在 `--thread` 视图里低调展示（Plan 行下方）
- 最终验收时若发现实现偏离预期，可以翻出 `draft` 文件对照原始意图

## 字段归属

| 字段 | 归属 | 谁可以改 |
|------|------|----------|
| `status`, `description`, `plan`, `draft`, `repo`, `created` | 人工领域 | `/kanban --new` / `--update` |
| `<role>.<name>.brief` | 人工领域 | `/kanban --new` / `--update` / `--role` |
| `<role>.<name>.cwd`, `<role>.<name>.worktree` | 系统 | `scripts/role.ts` 认领/注册时自动写入 |
| `<role>.<name>.status / reports / review / pass / fail / report / merged / conflicts / attempt / error / blocked_on` | Agent 领域 | `scripts/agent-write.ts` |
| `updated` | 系统 | 每次写锁内自动刷新 |

## 状态机

### 任务级

- `draft`：占位。`plan` 可为占位文件，条目可为空。**Agent 不自动开工**
- `planned`：`plan` 已定稿，至少一个角色有非空条目。可以开工
- `in_progress`：任意 role 条目的 `status` 进入 `working`
- `done` / `archived` / `aborted`：终态

**`draft → planned` 提升校验**（`update-task.ts` 实现）：
- `plan` 文件存在且非空
- 至少一个角色有非空条目，每条有非空 `brief`

### 角色级

| 角色 | 状态流转 |
|------|----------|
| Developer | `idle → working → waiting_review → under_review → review_approved / review_rejected`（可 `blocked`） |
| Reviewer | `idle → working → done` |
| Test | `idle → working → waiting`（回测）`→ working → done` |
| Integrator | `idle → working → done` |

## 目录布局

```
~/.kanban/
├── kanban.json
├── .locks/                  # ⚠️ 禁止手动删除
├── <repo>/<uuid>/
│   ├── plan.md
│   ├── report-<worktree>-<NN>.md
│   ├── review-<worktree>-<NN>.md
│   └── test-<NN>.md
└── archive/
    ├── index.json
    └── <uuid>/
        ├── task.json
        └── ...

~/.claude/skills/kanban/     # 本 skill
```

## 并发安全

所有写操作必须走 `scripts/kanban-lock.ts` 的 `withKanbanLock(mutator)`：

- 基于 `proper-lockfile` 的建议性文件锁
- 锁文件：`~/.kanban/.locks/kanban.json.lock`
- 锁内：读 → mutate → 写回 → 刷新 `updated`
- 竞争时最多重试 10 次，退避 ~100ms，全部失败抛错
- 锁过期（stale）阈值 60 秒；写入采用 tmp + rename 原子操作
- 写操作全部走锁，读不加锁
