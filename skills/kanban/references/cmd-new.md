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
│           - 尝试从文件解析 worktree 划分
│           - 解析成功 → status=planned,填充 worktree
│           - 解析失败 → AskUserQuestion:
│             (a) 手动提供 worktree 划分
│             (b) 先创建空白看板,后续完善
│
├─ 当前对话中有 plan mode 产出的 plan 文件(如 ~/.claude/plans/*.md)?
│   └─ 是 → 【来源 A+: plan 引用】
│           - 脚本传 --plan-ref 指向原始文件
│           - 不拷贝内容,plan 字段存原始路径
│           - status=planned
│
├─ 当前对话中有足够的计划内容可以抽取?
│   └─ 是 → 【来源 A: 对话抽取】
│           - 整理对话内容为 plan.md
│           - 尝试识别 worktree 划分
│           - 识别成功 → status=planned
│           - 识别失败 → AskUserQuestion 同上
│
└─ 对话中没有计划内容
    └─ AskUserQuestion:
       「没有找到计划内容,是否创建空白看板?」
       (a) 是 → 【来源 C: 空白看板】status=draft,worktree={}
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

## 实现脚本

```bash
bun run ~/.claude/skills/kanban/scripts/new-task.ts \
  --mode <extract|fromFile|blank> \
  --repo <repo> \
  --description <desc> \
  [--plan-content-file <path>]   # extract 模式:Agent 把整理好的 plan 写临时文件
  [--plan-file <path>]           # fromFile 模式:原始文件路径
  [--draft-ref <path>]           # 可选:原始需求草稿路径
  [--worktrees-json '<json>']    # 可选:worktree 字典
```

## 汇报模板

**正式任务(planned)**:
```
✅ 任务已创建 [planned]
UUID:   019d9b9f-7c0c-...
Short:  019d9b9f
Repo:   wave
Plan:   ~/.kanban/wave/019d9b9f.../plan.md
Worktrees:
  - dev-serve  (developer)  重构命令解析器
  - review     (reviewer)   统一 review
下一步:在对应 worktree 内启动 Claude 即自动进入角色。
```

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
