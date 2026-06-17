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
        "status": "working", // idle | working | follow_issue | ready_for_test | waiting_review | under_review | review_approved | review_rejected | done | blocked
        "brief": "重构命令解析器",
        "attempt": 1,
        "blocked_on": null,
        "worktree": "dev-serve",
        "cwd": "dev-serve",
        "reports": ["report-dev-serve-01.md"],
        "review": "review-dev-serve-01.md",
        "self_review": "self-review-dev-serve-01.md",
        "review_gate_required": false,
        "error": null
      }
    },
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
    "tester": {
      "full-test": {
        "status": "idle", // idle | working | waiting | done
        "brief": "合并全部 dev 做全量测试",
        "attempt": 0,
        "worktree": null,
        "cwd": null,
        "case_document": "",
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
| `<role>.<name>.status / reports / review / self_review / review_gate_required / case_document / pass / fail / report / merged / conflicts / decisions / closeout / attempt / error / blocked_on` | Agent 领域 | `scripts/agent-write.ts` 或 `scripts/action-write.ts` |
| `updated` | 系统 | 每次写锁内自动刷新 |

## 状态机

### 任务级

- `draft`：占位或 multi-plan 索引草案。普通任务可只有占位 `plan`；multi-plan 表示尚无实际 `plan-*.md` 子计划。**Agent 不自动开工**
- `planned`：已有可执行计划。普通任务要求 `plan` 已定稿且至少一个角色有非空条目；multi-plan 要求至少一个实际 `plan-*.md` 子计划已确认并落盘,且有对应角色条目。可以开工
- `in_progress`：任意 developer 席位被认领/开工。multi-plan 在此状态下**不是冻结状态**,仍可继续追加新的子计划和对应 idle 席位
- `done` / `archived` / `aborted`：终态

**`draft → planned` 提升校验**（`update-task.ts` 实现）：
- `plan` 文件存在且非空
- 至少一个角色有非空条目，每条有非空 `brief`
- 若 `plan.md` 是 multi-plan 索引（含 `multi-plan` 标记或 `./plan-*.md` 链接）：
  - 至少一个实际 `plan-*.md` 子计划存在于任务目录
  - `plan.md` 中引用的 `./plan-*.md` 必须真实存在
  - 至少一个 role 条目对应某个子计划（单子计划+单席位时视为对应）

### Multi-plan 语义

multi-plan 是可渐进扩展的 thread，而不是一次性冻结的大计划：

1. `/kanban --new multi-plan` 创建 `draft` 索引任务，只落主 `plan.md`。
2. 每确认一个子计划，写入 `plan-<slug>.md`，并在主 `plan.md` 索引中追加 `./plan-<slug>.md` 链接。
3. 第一个实际子计划落盘且有对应 role 条目后，可将 thread 从 `draft` 提升为 `planned`。
4. 任意 developer 认领席位后，thread 提升为 `in_progress`。
5. `in_progress` 期间仍允许继续追加新的 `plan-*.md` 和新的 idle role 条目；不得删除已有条目，也不得改写已认领条目的 `brief`。

### 角色级

| 角色 | 状态流转 |
|------|----------|
| Owner | `idle → working / waiting → done`（可 `blocked`） |
| Developer | `idle → working → ready_for_test → done`；可选 reviewer gate: `ready_for_test → waiting_review → under_review → ready_for_test / review_rejected`；tester 创建 open issue 后进入 `follow_issue → working → ready_for_test`（可 `blocked`） |
| Reviewer | `idle → working → done` |
| Tester | `idle → working → waiting`（回测）`→ working → done` |
| Integrator | `idle → working → done` |

`developer.ready_for_test` 表示 developer 已提交 dev report 和 self-review,可由 tester 接手。`review_approved` 是 v1 兼容状态,在 tester/query/standby 中等价于 `ready_for_test`。`developer.done` 表示该 developer 已被 tester pass 收尾。

#### Issue 状态流

- `follow_issue` 只用于 tester 已定位并分配给 developer 的 open issue。
- `ready_for_test / review_approved → follow_issue`：tester 创建 owner 为该 developer 的 open issue。
- `follow_issue → working`：developer 接手 issue 修复。
- `working → ready_for_test / follow_issue`：developer 提交修复 report 和 self-review，frontmatter 必须包含 `related_issue: issue-*.md`；仍有未被该 developer 历史 dev reports 覆盖的 owner open issue 时继续 `follow_issue`。
- 若 owner 插入 reviewer gate:`ready_for_test → waiting_review → under_review → ready_for_test / follow_issue / review_rejected`。
- `under_review → follow_issue`：issue 修复审查未通过，developer 继续跟进同一 issue。
- tester 只有在相关 developer 重新回到 `ready_for_test` 或 `review_approved` 后，才允许回测 issue。

### Issue 文件

Issue 文件放在 `~/.kanban/<repo>/<uuid>/issue-<slug>.md`，完成或关闭后移动到 `~/.kanban/<repo>/<uuid>/archive/`。

Issue 文件只记录问题事实和最终 resolution，不维护 timeline。进度由 `kanban.json` 的 role status、dev report、review 和 test report 表达。

必填内容：
- 复现方式
- Expected / Actual
- 初步 diagnosis
- owner
- 阻塞原因
- retest plan
- resolution（open 时为 `Pending.`）

Issue 状态：
- `open`：仍需 owner 修复或 tester 回测。
- `done`：tester 合并 owner 分支并按 retest plan 回测通过。
- `closed`：无效、重复、取消或不再追踪。

## 目录布局

```
~/.kanban/
├── kanban.json
├── .locks/                  # ⚠️ 禁止手动删除
├── <repo>/<uuid>/
│   ├── plan.md
│   ├── report-<worktree>-<NN>.md
│   ├── self-review-<worktree>-<NN>.md
│   ├── review-<worktree>-<NN>.md
│   ├── test-cases-<NN>.md
│   ├── test-<NN>.md
│   ├── owner-closeout-<NN>.md
│   ├── issue-<slug>.md
│   └── archive/
│       └── issue-<slug>.md
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
