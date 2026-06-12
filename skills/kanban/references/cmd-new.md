# /kanban --new

从上下文创建新任务。Agent 自动判断计划来源,用户无需指定模式。

## 命令形态

```bash
/kanban --new                          # 从当前对话抽取计划
/kanban --new @docs/plan.md            # 用户通过 @ 引用了文件
/kanban --new "~/path/to/plan.md"      # 用户提供了文件路径字符串
/kanban --new multi-plan               # 创建可渐进扩展的 multi-plan 索引草案
/kanban --new                          # 对话里没有计划 → 询问是否创建空白看板
```

## 来源判别

按顺序判断:

1. `$ARGUMENTS` 明确包含 `multi-plan` 且没有实际计划文件 → 创建 multi-plan 索引草案:
   - `status=draft`
   - `worktree={}`
   - 只创建主 `plan.md`;后续每确认一个子计划再追加 `plan-<slug>.md` 和 idle role 条目
2. `$ARGUMENTS` 或对话中有 `@file` / 路径字符串 → 文件导入:
   - 读取文件内容作为 plan
   - 进入预分配席位分析
3. 当前对话中有 plan mode 产出的 plan 文件(如 `~/.claude/plans/*.md`) → plan 引用:
   - 脚本传 `--plan-ref` 指向原始文件
   - 不拷贝内容,`plan` 字段存原始路径
   - `status=planned`
   - 进入预分配席位分析
4. 当前对话中有足够计划内容 → 对话抽取:
   - 整理为 `plan.md`
   - `status=planned`
   - 进入预分配席位分析
5. 没有计划内容 → AskUserQuestion:
   - 是:创建空白看板,`status=draft`,`worktree={}`,跳过席位分析
   - 否:取消

## 字段合同

无论来源,最终都要落齐:

| 字段 | 来源 |
|------|------|
| `description` | 对话提炼 / 文件第一行 `# ...` / AskUserQuestion |
| `repo` | 对话提到的仓库名 / `basename(pwd)` 作默认建议 / AskUserQuestion |
| `draft` | 原始需求草稿路径;没有则 `null` |
| `plan` | 按来源写入或引用 plan |
| `worktree` | 对话划分 / 文件解析 / `{}` |

`draft` 只记录原始需求草稿路径。若用户提到"这是草稿""参考这个文件"且该文件不是 plan 本身,记录该路径;不强制询问。

## 产物合同

| 来源 | `status` | `plan` | `worktree` |
|------|----------|--------|------------|
| plan 引用 | `planned` | `--plan-ref` 引用原始路径 | 按对话划分填充 |
| 对话抽取 | `planned` | 从对话整理出的完整 plan | 按对话划分填充 |
| 文件导入 | `planned` 或 `draft` | 拷贝自引用文件 | 尝试解析,失败则空 |
| 空白看板 | `draft` | 占位 `# desc\n\n(待完善)` | `{}` |
| multi-plan 索引草案 | `draft` | 索引式主 `plan.md`,暂不含实际子计划 | `{}` |

文件导入必须把文件拷贝进 `~/.kanban/.../plan.md`,不保留软链接。原文件不动,kanban 目录必须自足。

索引式 multi-plan 合同:

- 导入的 `plan.md` 含同目录相对链接 `./plan-*.md`,或主计划明确标记 `multi-plan`,即视为索引式计划结构。
- thread 目录中的 `plan.md` 与同层 `plan-*.md` 是运行时真源。
- 脚本复制主计划时同步复制同目录一层 `plan-*.md` 到任务目录。
- 链接指向的子计划不存在时先报错,不得创建半残任务。
- 不递归复制其他 Markdown 链接。

## Multi-plan 渐进扩展

multi-plan thread 不是"全部子计划完成后才 planned":

- `draft`: 只有主索引或讨论内容,尚无实际 `plan-*.md` 子计划。
- `planned`: 至少一个实际 `plan-*.md` 子计划已确认并落盘,且有对应 idle role 条目。
- `in_progress`: 至少一个 developer 席位被认领/开工。

新增子计划流程:

1. 写入 `~/.kanban/<repo>/<uuid>/plan-<slug>.md`。
2. 更新主 `plan.md` 索引,追加 `./plan-<slug>.md` 链接、目标、执行顺序或依赖说明。
3. 通过 `/kanban --update <uuid> add:<role>:<name>:'{"brief":"..."}'` 添加对应 idle 席位。
4. 若这是第一个子计划,再执行 `/kanban --update <uuid> set:status=planned`。
5. 若 thread 已是 `in_progress`,仍允许执行第 1-3 步继续追加；`in_progress` 不是计划冻结状态。

## 预分配席位分析

plan 就绪后(来源 plan 引用 / 对话抽取 / 文件导入),先分析是否需要预分配 developer 席位。

核心原则:

- 默认单 developer 席位。只有明确满足全部 4 条件时,才考虑多席位。
- Agent 负责阅读 plan、判断复杂度与独立性;`new-task.ts` 负责校验 `blocked_on` 链完整性与无环性。

多 developer 席位需同时满足:

| 条件 | 要求 | 不满足时的处理 |
|------|------|----------------|
| C1 文件域不重叠 | 各席位涉及的文件/目录路径无交集 | 降级为单席位 |
| C2 模块独立 | 模块间无共享内部状态或强耦合 | 降级为单席位 |
| C3 非阻塞 | 无先后依赖;若有显式依赖,必须设置 `blocked_on` 链 | 设置 `blocked_on`,继续 |
| C4 足够复杂度 | 每个席位对应 ≥2 个 plan 章节/子任务 | 合并过小席位 |

C3 是唯一允许有条件通过的项。当 plan 明确描述 Phase 1 → Phase 2 依赖时,可为 Phase 2 设置 `blocked_on: "phase-1-seat-name"`。

分析流程:

1. 通读 `plan.md`;若存在 `./plan-*.md` 子计划索引,继续逐个读取子计划。
2. 按 4 条件逐一评估:
   - 单席位合理 → 静默构造 worktree JSON
   - 多席位可能合理 → AskUserQuestion 让用户选择接受、合并或自定义
3. 用户接受多席位时,构造含 `blocked_on` 链的 worktree JSON 并调用 `new-task.ts`。

多 developer 席位优先对应具体子计划;主 `plan.md` 只负责总目标、索引、执行顺序和依赖说明。

`blocked_on` 的值必须是同任务中另一个 developer 条目的名称。`new-task.ts` 写入前校验目标存在、无自引用、无环形依赖。

示例:

```json
{
  "dev-parser": {
    "role": "developer",
    "brief": "重构命令解析器（Phase 1，对应 plan-parser.md）"
  },
  "dev-rbac": {
    "role": "developer",
    "brief": "实现 RBAC 中间件（Phase 2，对应 plan-rbac.md）",
    "blocked_on": "dev-parser"
  }
}
```

空白看板(`status=draft`)跳过席位分析。`worktree` 为 `{}`,用户后续通过 `--update` 完善。

## 实现脚本

```bash
bun run $SCRIPTS/new-task.ts \
  --mode <extract|fromFile|blank> \
  --repo <repo> \
  --description <desc> \
  [--plan-content-file <path>] \
  [--plan-file <path>] \
  [--plan-ref <path>] \
  [--draft-ref <path>] \
  [--multi-plan] \
  [--worktrees-json '<json>']
```

`--worktrees-json` 中 developer 条目可含 `blocked_on` 字段,值必须是同任务其他 developer 名称。脚本自动校验目标存在、无自引用、无环形依赖;失败则拒绝写入。

fromFile 模式若识别到索引式 multi-plan,stdout JSON 包含 `subPlans: ["~/.kanban/.../plan-a.md", ...]`。`--multi-plan --mode blank` 创建 `draft` 索引草案,stdout 的 `isMultiPlan` 为 `true`。

## 汇报模板

正式任务(`planned`):

```text
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

若为单席位,省略 blocked_on 相关行。

空白看板(`draft`):

```text
📝 空白看板已创建 [draft]
UUID:   019d9b9f-...
Short:  019d9b9f
Repo:   wave
Plan:   ~/.kanban/wave/019d9b9f.../plan.md (占位)
提示:
  /kanban --update 019d9b9f
  /kanban --update 019d9b9f status=planned
```

multi-plan 索引草案(`draft`):

```text
📝 Multi-plan 索引已创建 [draft]
UUID:   019d9b9f-...
Short:  019d9b9f
Repo:   wave
Plan:   ~/.kanban/wave/019d9b9f.../plan.md
下一步:
  1. 写入 ~/.kanban/wave/019d9b9f.../plan-<slug>.md
  2. 在 plan.md 索引中添加 ./plan-<slug>.md
  3. /kanban --update 019d9b9f add:developer:<name>:'{"brief":"对应 plan-<slug>.md"}'
  4. /kanban --update 019d9b9f status=planned
```

## 边界情况

- 引用文件不存在 → 报错,提示检查路径
- 同仓库同 description 已有 planned 任务 → 不阻塞,汇报末尾追加 `⚠️ 检测到同仓库同名任务 <short>`
- UUID 冲突(极低概率) → 重试最多 3 次
