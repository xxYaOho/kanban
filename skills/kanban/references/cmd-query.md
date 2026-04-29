# /kanban --thread

站在当前 worktree(若在)的视角,展示任务全貌与下一步建议。纯查询部分不加锁。

## 命令形态

```bash
/kanban --thread <id>                  # 支持短前缀 (≥6)
/kanban --thread <id> <context>        # 附带自然语言指令
/kanban --thread                        # 未提供时走任务定位公共流程
```

**任务定位**：若未提供 thread id，遵循 SKILL.md 中的"任务定位公共流程"——筛选活跃任务，唯一则静默选中，多个则 AskUserQuestion 让用户选。

**context 处理**：若有 `<context>`，先展示任务视图，再根据语义自行判断意图（如更新状态、调整分配等）。涉及写操作时，加载 `references/cmd-update.md` 获取正确的脚本调用格式后执行。不确定意图时向用户确认。

## 展示布局

### 顶部横幅(按 status 变体)

**planned / in_progress**:
```
📋 Task 019d9b9f  [planned]  (CLI v0.14 优化)
Repo:    wave
Plan:    ~/.kanban/wave/019d9b9f.../plan.md
Created: 2026-04-18 14:00
Updated: 2026-04-18 14:32
```

**draft**(加警告):
```
📋 Task 019d9b9f  [DRAFT]  (CLI v0.14 优化)
⚠️  此任务仍在草案阶段,worktree 可能未分配。
    完善后运行:/kanban --update 019d9b9f status=planned
...
```

**done / archived / aborted**:同 planned 风格,但图标换成 `✅ / 📦 / ❌`

### Worktree 矩阵

以表格展示所有 worktree 当前状态:

```
Worktree      Role       Status         Attempt  Latest Report
------------  ---------  -------------  -------  --------------------------------
dev-serve     developer  working        1        report-dev-serve-01.md
dev-gui       developer  review_rejected 2       report-dev-gui-02.md (被 review)
review        reviewer   idle           -        -
test          test       idle           -        -
```

### 当前身份视角(若 cwd 是某个 worktree)

在 Worktree 矩阵下方高亮**当前 worktree 行**,并给出下一步建议:

```
📍 当前身份: dev-serve (developer)
   你刚交了 report-dev-serve-01.md,status=waiting_review
   下一步:等 reviewer 处理。可以切到其他 worktree,或 /kanban --thread <id> 重查。
```

下一步建议的决策表:

| 身份      | worktree.status    | 建议                                                   |
| --------- | ------------------ | ------------------------------------------------------ |
| developer | idle               | 读 plan,依 action 开工,完成后写 report 并转 waiting_review |
| developer | working            | 继续,未完则保存进度                                    |
| developer | waiting_review     | 等 reviewer;可切别的 worktree                          |
| developer | review_rejected    | 读最新 review-<name>-NN.md,依据修改,attempt+1         |
| reviewer  | idle               | 检查所有 developer waiting_review 的 worktree,拉取报告 review |
| reviewer  | working            | 继续 review                                            |
| test      | idle               | 所有 dev worktree 都 approved 时,拉分支跑测,写 test-NN.md    |
| integrator | idle              | 所有 dev worktree test 通过时,合并分支,写 integration-NN.md |
| 任意      | blocked            | 读 `blocked_on` 字段,先解阻塞                         |

### Plan 正文预览

默认**折叠**,只列 outline(plan.md 里的二级标题)。用户需要查看全文时,Agent 直接用 Read 工具读取 plan 文件路径。

### 最近报告列表

按时间倒序列该任务 `~/.kanban/<repo>/<uuid>/` 下的所有 `report-*.md` / `review-*.md` / `test-*.md`,带相对时间:

```
最近报告:
  5分钟前   report-dev-serve-01.md          (dev-serve 提交)
  20分钟前  review-dev-gui-02.md            (reviewer 回绝)
  1小时前   report-dev-gui-02.md            (dev-gui 重试)
```

## 实现脚本

```bash
bun run ~/.claude/skills/kanban/scripts/query.ts <uuid>
```

脚本负责:
1. 解析短前缀 → 完整 UUID,多候选时打印候选(Agent 层再问用户)
2. 不加锁读 kanban + 扫任务目录
3. 输出结构化 JSON(由 Agent 渲染为上述格式),或直接输出渲染好的 plain text(推荐后者,减少 Agent 工作)

## 边界情况

- UUID 找不到 → 列最近 5 个任务供用户重选
- 短前缀多候选 → 列所有候选供选
- 任务目录丢失(`~/.kanban/<repo>/<uuid>/` 不存在) → 顶部标红警告,提示 `kanban.json` 与文件系统不一致,建议 `/kanban --update <uuid>` 修正 plan 字段或手工恢复目录
