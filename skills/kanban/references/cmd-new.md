# /kanban --new

从上下文创建新任务。Claude 自动判断计划来源,用户无需指定模式。

## 命令形态

```bash
/kanban --new                          # Claude 从当前对话抽取计划
/kanban --new @docs/plan.md            # 用户通过 @ 引用了文件
/kanban --new "~/path/to/plan.md"      # 用户提供了文件路径字符串
/kanban --new                          # 对话里没有计划 → 询问是否创建空白看板
```

用户只需说 `/kanban --new`,Claude 从 `$ARGUMENTS` 和当前对话上下文中理解来源。

## 来源判别逻辑

```
/kanban --new 被触发
│
├─ $ARGUMENTS 或对话中有文件引用(@file)或路径字符串?
│   └─ 是 → 【来源 B: 文件导入】
│           - 读取文件内容作为 plan
│           - 进入「预分配席位智能分析」流程
│
├─ 当前对话中有 plan mode 产出的 plan 文件(如 ~/.claude/plans/*.md)?
│   └─ 是 → 【来源 A+: plan 引用】
│           - 脚本传 --plan-ref 指向原始文件
│           - 不拷贝内容,plan 字段存原始路径
│           - status=planned
│           - 进入「预分配席位智能分析」流程
│
├─ 当前对话中有足够的计划内容可以抽取?
│   └─ 是 → 【来源 A: 对话抽取】
│           - 整理对话内容为 plan.md
│           - status=planned
│           - 进入「预分配席位智能分析」流程
│
└─ 对话中没有计划内容
    └─ AskUserQuestion:
       「没有找到计划内容,是否创建空白看板?」
       (a) 是 → 【来源 C: 空白看板】status=draft,worktree={},跳过席位分析
       (b) 否 → 取消
```

## 必备字段采集

无论来源,最终都要落齐:

| 字段          | 来源                                                              |
| ------------- | ----------------------------------------------------------------- |
| `description` | 对话提炼 / 文件第一行 `# …` / AskUserQuestion                    |
| `repo`        | 对话提到的仓库名 / `basename(pwd)` 作默认建议 / AskUserQuestion   |
| `draft`       | 若用户提供了原始需求草稿路径,记录进去;否则 `null`                |
| `plan`        | 按来源写入 plan.md                                                |
| `worktree`    | 对话划分 / 文件解析 / `{}`(空白看板)                            |

**`draft` 字段采集时机**:若用户在 `/kanban --new` 时提到"这是草稿""参考这个文件"但该文件不是 plan 本身(例如是需求讨论文档),则把该路径记录为 `draft`。不强制询问,有则记,无则 `null`。

## 产物对比

| 来源       | `status`             | `plan` 文件                  | `worktree`            |
| ---------- | -------------------- | ---------------------------- | --------------------- |
| A+ plan 引用 | `planned`          | `--plan-ref` 引用原始路径    | 按对话划分填充        |
| A 对话抽取 | `planned`            | 从对话整理出的完整 plan       | 按对话划分填充        |
| B 文件导入 | `planned` 或 `draft` | 拷贝自引用文件                | 尝试解析,失败则空    |
| C 空白看板 | `draft`              | 占位("# desc\n\n(待完善)")   | `{}`                  |

**文件拷贝策略**:来源 B 将文件**拷贝**进 `~/.kanban/…/plan.md`,不保留软链接。原文件不动,kanban 自足。

## 预分配席位智能分析

plan 就绪后（来源 A+/A/B），在进行席位预分配前，按以下流程严格分析。

### 核心原则

- **默认单 developer 席位**：不轻易拆分为多席位。只有明确满足 ALL 4 条件时，才考虑多席位。
- **模型做推理，脚本做约束**：模型的职责是阅读 plan、判断复杂度与独立性；脚本（new-task.ts）负责校验 blocked_on 链的完整性与无环性。

### 严格 4 条件

多 developer 席位需**同时满足**以下所有条件：

| 条件 | 要求 | 不满足时的处理 |
| ---- | ---- | -------------- |
| **C1 文件域不重叠** | 各席位涉及的文件/目录路径无交集 | 降级为单席位 |
| **C2 模块独立** | 模块间无共享内部状态或强耦合，关注点清晰分离 | 降级为单席位 |
| **C3 非阻塞** | 无先后依赖；若有显式依赖，必须设置 `blocked_on` 链 | 设置 blocked_on，继续 |
| **C4 足够复杂度** | 每个席位对应 ≥2 个 plan 章节/子任务，避免拆出琐碎任务 | 合并过小的席位 |

C3 是唯一允许"有条件通过"的项——当 plan 中明确描述了 Phase 1 → Phase 2 的依赖关系时，可以为 Phase 2 的席位设置 `blocked_on: "phase-1-seat-name"`。

### 分析流程

1. 模型通读 plan.md，理解章节结构、文件路径引用、模块划分
2. 按 4 条件逐一评估：
   - **单席位合理** → 静默构造 worktree JSON，不向用户提问
   - **多席位可能合理** → 进入步骤 3
3. AskUserQuestion：

```
检测到计划可拆分为 <N> 个独立开发席位：

席位划分:
  - <seat-a>: <brief>（涉及: <files>）
  - <seat-b>: <brief>（涉及: <files>）[阻塞于 <seat-a>]

(a) 接受多席位（共 <N> dev）
(b) 合并为单席位
(c) 自定义调整
```

- 选 (a) → 构造含 blocked_on 链的 worktree JSON，调用 new-task.ts
- 选 (b) → 合并所有 brief，构造单席位 JSON，调用 new-task.ts
- 选 (c) → 让用户描述调整，重新分析

### worktree JSON 中 blocked_on 的格式

```json
{
  "dev-parser": {
    "role": "developer",
    "brief": "重构命令解析器（Phase 1）"
  },
  "dev-rbac": {
    "role": "developer",
    "brief": "实现 RBAC 中间件（Phase 2）",
    "blocked_on": "dev-parser"
  }
}
```

`blocked_on` 的值必须是同任务中另一个 developer 条目的名称。new-task.ts 会在写入前校验：
- 目标存在
- 无自引用
- 无环形依赖

### 无 plan 时

空白看板（来源 C，status=draft）跳过席位分析。worktree 为 `{}`，用户后续通过 `--update` 完善。

## 实现脚本

```bash
bun run ~/.claude/skills/kanban/scripts/new-task.ts \
  --mode <extract|fromFile|blank> \
  --repo <repo> \
  --description <desc> \
  [--plan-content-file <path>]   # extract 模式:Agent 把整理好的 plan 写临时文件
  [--plan-file <path>]           # fromFile 模式:原始文件路径
  [--draft-ref <path>]           # 可选:原始需求草稿路径
  [--worktrees-json '<json>']    # 可选:worktree 字典,developer 可含 blocked_on
```

`--worktrees-json` 中 developer 条目可含 `blocked_on` 字段（值为同任务其他 developer 的名称）。脚本自动校验链完整性（目标存在、无自引用、无环形依赖），校验失败则拒绝写入。

## 汇报模板

**正式任务(planned)**:
```
✅ 任务已创建 [planned]
UUID:   019d9b9f-7c0c-...
Short:  019d9b9f
Repo:   wave
Plan:   ~/.kanban/wave/019d9b9f.../plan.md
Worktrees:
  - dev-parser  (developer)  重构命令解析器
  - dev-rbac    (developer)  实现 RBAC 中间件（阻塞于 dev-parser）
  - review      (reviewer)   统一 review
Blocked-on chain: dev-rbac → dev-parser
下一步:在对应 worktree 内启动 Claude 即自动进入角色。
```

若为单席位，省略 blocked_on 相关行。

**空白看板(draft)**:
```
📝 空白看板已创建 [draft]
UUID:   019d9b9f-...
Short:  019d9b9f
Repo:   wave
Plan:   ~/.kanban/wave/019d9b9f.../plan.md (占位)
提示:
  /kanban --update 019d9b9f               # 逐项完善
  /kanban --update 019d9b9f status=planned # 校验并发布
```

## 边界情况

- 引用文件不存在 → 报错,提示检查路径
- 同仓库同 description 已有 planned 任务 → 不阻塞,汇报末尾追加 `⚠️ 检测到同仓库同名任务 <short>`
- UUID 冲突(极低概率) → 重试最多 3 次
