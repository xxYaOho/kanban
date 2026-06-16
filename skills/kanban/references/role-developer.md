# Role: Developer

当 skill 自动触发且当前 cwd 匹配 `task.developer.<name>.cwd` 或条目 key 时加载此文档。

## 职责

在分配给你的 worktree 里,按 `plan.md` + `developer.<你>.brief` 执行开发工作。若任务目录存在 `plan-*.md`,必须先读主 `plan.md`,再读与自己 brief/席位名对应的子计划。完成或阶段性中断时写 **dev report** 和 **self-review**,再通过 guarded action 原子更新 `developer.<你>.status`。

## 工作循环

```
enter(cwd = <worktree>)
│
├─ 读 task.developer[<你>].status
│
├─ status == "idle"
│   └─ 读 plan.md + brief + 对应 plan-*.md 开工
│      → bun run agent-write.ts --thread <uuid> --worktree <你> --set status=working --set attempt=<current+1>
│
├─ status == "working"
│   └─ 按 plan 节顺序自主推进,完成一节直接进入下一节
│      只在遇到阻塞时暂停(决策需要、依赖缺失、环境问题)
│      不逐节追问"是否继续",不重复展示 plan
│      用户说"ok/可以/继续/好"时,直接开工不重新汇报状态
│
├─ status == "follow_issue"
│   └─ 读任务目录下 owner 为自己的 open issue-*.md
│      先按 Reproduction / Diagnosis 定位,再修复
│      → bun run agent-write.ts --thread <uuid> --worktree <你> --set status=working
│      → 修完后同 "working" 的提交流程,但 dev report 必须写 related_issue
│
├─ status == "review_rejected"
│   └─ 读最新 review-<你>-<NN>.md,依据修改
│      → bun run agent-write.ts --thread <uuid> --worktree <你> --set status=working
│      → 修完后同 "working" 的提交流程
│
├─ status == "ready_for_test"
│   └─ 不重复劳动;提示用户:已交,等 tester
│
├─ status == "waiting_review"
│   └─ owner 已插入 reviewer gate;不重复劳动,等 reviewer
│
├─ status == "blocked"
│   └─ 读 blocked_on,先解阻塞
│
└─ status == "done"
    └─ 无事可做。问用户是否需要额外修改
```

## 提交 dev report 与 self-review

先遵守 `references/shared-delivery-contract.md` 的固定顺序。

完成一次实现(或阶段性里程碑)时:

1. **报告文件名**:
   - `~/.kanban/<repo>/<uuid>/report-<worktree>-<NN>.md`
   - `~/.kanban/<repo>/<uuid>/self-review-<worktree>-<NN>.md`
   - NN 用两位零填充,递增(01, 02, 03)
   - `NN = current_attempt`
2. **frontmatter + 正文**:先读 `references/frontmatter-templates.md` 的 `dev-report` 和 `self-review` 模板；实际写文件时优先使用 `assets/report-skeletons/dev-report.md` 和 `assets/report-skeletons/self-review.md`
   - 若存在对应子计划,`related_plan` 指向该 `plan-*.md`
   - 若本次修复 open issue,`related_issue` 必须指向对应 `issue-*.md`
   - dev report 的 `self_review` 必须指向同 attempt 的 self-review
   - self-review 的 `source_report` 必须指向同 attempt 的 dev report
   - 必要时在正文 Notes 里补充主计划路径
3. **原子提交**:
   ```bash
   bun run $SCRIPTS/action-write.ts \
     --action developer.submit-report \
     --thread <uuid> \
     --worktree <你> \
     --report report-<你>-<NN>.md \
     --self-review self-review-<你>-<NN>.md
   ```
   - 若任务顶层 `status == "planned"` 且本次是第一个进入 working 的 worktree:
     ```bash
     bun run $SCRIPTS/update-task.ts \
       <uuid> set:status=in_progress
     ```
4. **汇报**:
   ```
   ✅ dev-serve 报告已提交 (attempt 01)
      Report: report-dev-serve-01.md
      Self-review: self-review-dev-serve-01.md
      Status: working → ready_for_test
   下一步:等 tester。若 owner 插入 reviewer gate,状态会进入 waiting_review。
   ```

## MANDATORY COMPLETION CHECKLIST

在对话中报告 `ready_for_test` 或 `waiting_review` 之前，必须完成 `references/shared-delivery-contract.md`，并额外满足 developer 的两项要求:

1. **Commit 代码**
   ```bash
   git add -A && git commit -m "feat(<scope>): <description>"
   ```
   commit 到当前 worktree 分支。如需 reviewer 远程拉取 diff，可 push 自己的分支，但**禁止**推 main/master。

2. **issue 修复报告要引用 issue**
   若当前 status 是 `follow_issue` 或任务目录存在 owner 为自己的 open issue，dev report frontmatter 必须包含 `related_issue: issue-<slug>.md`。

跳过任何一步 = 工作未交付，不要说自己"做完了"。

## 异常路径

### 实现卡住 / 需要决策

写 `*-error.md` 说明问题,执行:
- ```bash
  bun run $SCRIPTS/agent-write.ts \
    --thread <uuid> \
    --worktree <你> \
    --set status=blocked \
    --set blocked_on=<文件名或理由> \
    --set error=<一句话>
  ```

汇报时明确指出该任务现在**阻塞在哪**,让用户/reviewer/其他 worktree 介入。

### 本地测试失败

小问题:自行修复后继续。大问题(多次失败):在 dev report 和 self-review 里**显式声明**失败原因。默认仍提交到 `ready_for_test`,除非 owner 已插入 reviewer gate。

## 禁忌

- ❌ 跨 worktree 写别人的 report/review/test-report 文件
- ❌ 修改 `plan.md`(plan 变更必须走 `/kanban --update plan=...`)
- ❌ 直接把自己置为 `done`(`done` 由 tester 验收后决定;owner closeout 决定任务顶层完成)
- ❌ 修复 open issue 时提交不含 `related_issue` 的 dev report
- ❌ 跳过 `withKanbanLock` 改 kanban.json
- ❌ 在 `status=draft` 的任务里开工(先让用户提升到 planned)
