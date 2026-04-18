# /kanban --new

创建一个新任务。支持三种输入源:对话抽取、从文件导入、空草案。

## 命令形态

```bash
/kanban --new                               # 模式 A:从对话抽取
/kanban --new --from-file <path>            # 模式 B:从文件导入(默认 planned)
/kanban --new --draft                       # 模式 C:空草案
/kanban --new --draft --from-file <path>    # 草案 + 种子文件(内容进 plan.md,status=draft)
```

## 模式判别树

```
/kanban --new 被触发
├─ 有 --from-file <path>?
│   ├─ 是 → 【模式 B: 文件导入】
│   │       - 读取文件内容作为 plan
│   │       - 若同时有 --draft → status=draft
│   │       - 否则 → 尝试从文件解析 worktree 划分
│   │         * 解析成功 → status=planned,worktree 填充
│   │         * 解析失败 → AskUserQuestion:让用户选 (a) 手动提供 worktree 划分 / (b) 创建为草案
│   └─ 否 → 继续
├─ 有 --draft?
│   ├─ 是 → 【模式 C: 空草案】
│   │       - 问 description, repo
│   │       - plan.md 写占位("# <description>\n\n(草案,待完善)")
│   │       - worktree = {},status=draft
│   └─ 否 → 【模式 A: 对话抽取】
│           - 扫描当前对话上下文,尝试抽取 plan 与 worktree 划分
│           - 无法抽取 → AskUserQuestion 三选项:
│             (a) 继续从对话整理 plan(我来起草,你确认)
│             (b) 你指定一个 plan 文件路径 → 转 --from-file
│             (c) 创建空草案 → 转 --draft
```

## 必备字段与交互采集

无论模式,最终都要落齐这些字段:

| 字段              | 来源                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------ |
| `description`     | 对话提炼 / AskUserQuestion 问一次 / 从文件第一行 `# ...` 提取                         |
| `repo`            | 对话里提到的仓库名 / AskUserQuestion / `basename(pwd)` 作默认建议                    |
| `plan` (文件内容) | 按模式来                                                                             |
| `worktree`        | 对话划分 / 文件解析 / 空字典(draft)                                                 |

## 三模式产物对比

| 模式       | `status`             | `plan` 文件                  | `worktree`              | 典型场景               |
| ---------- | -------------------- | ---------------------------- | ----------------------- | ---------------------- |
| A 对话抽取 | `planned`            | 从对话整理出的完整 plan       | 按对话里的划分填充      | 已在 CC 里讨论完       |
| B 文件导入 | `planned` 或 `draft` | 拷贝自 `--from-file`          | 尝试解析,解析不出则空   | 从其他工具转入         |
| C 空草案   | `draft`              | 占位(标题 + "(草案,待完善)") | `{}`                    | 先占 UUID,后续完善     |

## 实现脚本

```bash
bun run ~/.claude/skills/kanban/scripts/new-task.ts \
  --mode <extract|fromFile|draft> \
  --repo <repo> \
  --description <desc> \
  [--plan-file <path>] \
  [--worktrees-json '<json>'] \
  [--draft]
```

**`--worktrees-json` 示例**:
```json
{"dev-serve":{"role":"developer","action":"重构命令解析器"},
 "dev-gui":{"role":"developer","action":"重构 Electron 端"},
 "review":{"role":"reviewer","action":"统一 review"}}
```

脚本职责:
1. 生成 UUIDv7(若环境不支持则 v4,记录在 note 里)
2. 创建 `~/.kanban/wave/<repo>/<uuid>/`
3. 写入 plan.md(内容按模式来源)
4. `withKanbanLock` 原子插入任务条目
5. 输出 `{ uuid, short, dir, planTarget, status }`(JSON 到 stdout)

## UUID 拷贝策略(决策)

`--from-file` 模式**拷贝**文件进 `~/.kanban/.../plan.md`,不保留软链接。理由:原文件可能被外部工具移动/删除,kanban 作为状态真源必须自足。用户原文件保留不动,可作为参考版本。

## 汇报模板

**模式 A / B(正式任务)**:
```
✅ 任务已创建 [planned]
UUID:   019d9b9f-7c0c-7e44-8f37-8a77ce1edcf7
Short:  019d9b9f
Repo:   wave
Plan:   ~/.kanban/wave/wave/019d9b9f.../plan.md
Worktrees:
  - dev-serve   (developer)  重构命令解析器
  - dev-gui     (developer)  重构 Electron 端
  - review      (reviewer)   统一 review
下一步:在对应 worktree 内启动 Claude 即自动进入角色。
```

**模式 C(草案)**:
```
📝 草案任务已创建 [draft]
UUID:   019d9b9f-7c0c-...
Short:  019d9b9f
Repo:   wave
Plan:   ~/.kanban/wave/wave/019d9b9f.../plan.md (占位)
提示:
  - 在对话中继续梳理,随时:
      /kanban --update 019d9b9f               # 逐项完善
  - 完善后发布:
      /kanban --update 019d9b9f status=planned # 触发校验
```

**UUID 冲突**(极低概率):重跑,最多重试 3 次。

## 边界情况

- `--from-file <path>` 不存在 → 报错,提示检查路径
- 同仓库同 description 已有 planned 任务 → 不阻塞,但在汇报末尾追加 `⚠️ 检测到同仓库同名任务 <short_uuid>,请确认非重复`
- 用户在纯空白对话中跑 `/kanban --new`(无 --draft / --from-file) → 自动走模式 A 的"无法抽取"分支,弹三选项
