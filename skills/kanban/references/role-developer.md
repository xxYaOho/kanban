# Role: Developer

当 skill 自动触发且 `worktree.<cwd>.role == "developer"` 时加载此文档。

## 职责

在分配给你的 worktree 里,按 `plan.md` + `worktree.<你>.action` 执行开发工作。完成或阶段性中断时写 **dev report**,原子更新 `worktree.<你>.status`。

## 工作循环

```
enter(cwd = <worktree>)
│
├─ 读 task.worktree[<你>].status
│
├─ status == "idle"
│   └─ 读 plan.md + action 开工
│      → bun run agent-write.ts --uuid <uuid> --worktree <你> --set status=working --set attempt=<current+1>
│
├─ status == "working"
│   └─ 继续未完成的工作;若退出前未收尾,保持 "working"
│
├─ status == "review_rejected"
│   └─ 读最新 review-<你>-<NN>.md,依据修改
│      → bun run agent-write.ts --uuid <uuid> --worktree <你> --set status=working
│      → 修完后同 "working" 的提交流程
│
├─ status == "waiting_review"
│   └─ 不重复劳动;查看 plan 有无补充,否则提示用户:已交,等 reviewer
│
├─ status == "blocked"
│   └─ 读 blocked_on,先解阻塞
│
└─ status == "done"
    └─ 无事可做。问用户是否需要额外修改
```

## 提交 dev report

完成一次实现(或阶段性里程碑)时:

1. **报告文件名**:`~/.kanban/<repo>/<uuid>/report-<worktree>-<NN>.md`
   - NN 用两位零填充,递增(01, 02, 03)
   - `NN = current_attempt`
2. **frontmatter + 正文**:见 `references/frontmatter-templates.md` 的 `dev-report` 模板
3. **原子提交**(两条命令,顺序执行):
   - ```bash
     bun run ~/.claude/skills/kanban/scripts/agent-write.ts \
       --uuid <uuid> \
       --worktree <你> \
       --set status=waiting_review \
       --set report=~/.kanban/<repo>/<uuid>/report-<你>-<NN>.md \
       --set error=null
     ```
   - 若任务顶层 `status == "planned"` 且本次是第一个进入 working 的 worktree:
     ```bash
     bun run ~/.claude/skills/kanban/scripts/update-task.ts \
       <uuid> set:status=in_progress
     ```
4. **汇报**:
   ```
   ✅ dev-serve 报告已提交 (attempt 01)
      Report: report-dev-serve-01.md
      Status: working → waiting_review
   下一步:等 reviewer。可切到其他 worktree 继续。
   ```

## 异常路径

### 实现卡住 / 需要决策

写 `*-error.md` 说明问题,执行:
- ```bash
  bun run ~/.claude/skills/kanban/scripts/agent-write.ts \
    --uuid <uuid> \
    --worktree <你> \
    --set status=blocked \
    --set blocked_on=<文件名或理由> \
    --set error=<一句话>
  ```

汇报时明确指出该任务现在**阻塞在哪**,让用户/reviewer/其他 worktree 介入。

### 本地测试失败

小问题:自行修复后继续。大问题(多次失败):在 dev report 里**显式声明**失败原因,status 依然走 `waiting_review`(让 reviewer 判断策略)。

## 禁忌

- ❌ 跨 worktree 写别人的 report/review/test 文件
- ❌ 修改 `plan.md`(plan 变更必须走 `/kanban --update plan=...`)
- ❌ 直接把自己置为 `done`(`done` 由 reviewer approve + test 通过后联合决定,见 role-reviewer.md)
- ❌ 跳过 `withKanbanLock` 改 kanban.json
- ❌ 在 `status=draft` 的任务里开工(先让用户提升到 planned)
