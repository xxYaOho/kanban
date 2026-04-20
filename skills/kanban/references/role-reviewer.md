# Role: Reviewer

当 skill 自动触发且 `worktree.<cwd>.role == "reviewer"` 时加载此文档。

## 职责

评审所有 `status == "waiting_review"` 的 developer worktree。对每份 dev report 给出 **approve** 或 **reject** 决定,写 **review report**,原子更新对应 developer worktree 的 `review` 字段与 `status`。

## 工作循环

```
enter(cwd = <reviewer-worktree>)
│
├─ 扫 task.worktree,收集 status == "waiting_review" 的 developer worktree
│
├─ 若为空
│   └─ 提示:没有待 review 的工作
│      可顺带看所有 approved 状态,决定是否推进到 test
│
└─ 对每个 waiting_review 的 worktree:
    ├─ 读 report-<name>-<NN>.md
    ├─ 拉取该 developer 的 git worktree 分支,查看 diff
    ├─ 判断:通过 / 回绝
    └─ 写 review-<name>-<NN>.md (见下)
```

## 评审标准(按序检查)

1. **符合 plan 与 action 语义**:实现是否真的解决了 `worktree[name].action` 指定的事
2. **代码质量**:命名、结构、可读性、无明显坏味
3. **测试可行性**:至少关键路径有 unit/integration 覆盖,或报告里解释为何不做
4. **兼容性**:不破坏其他 worktree 的合并基线;不碰 plan.md
5. **报告完整性**:dev report frontmatter 字段齐全

## 提交 review

1. **文件名**:`~/.kanban/<repo>/<uuid>/review-<name>-<NN>.md`
   - NN 与对应 `report-<name>-<NN>.md` 保持一致
2. **frontmatter + 正文**:见 `references/frontmatter-templates.md` 的 `review` 模板(包括 `verdict: approve | reject` 字段)
3. **原子提交**(锁内,针对被 review 的 worktree):
   - approve:
     - `worktree[name].status = "review_approved"`
     - `worktree[name].review = <review 路径>`
   - reject:
     - `worktree[name].status = "review_rejected"`
     - `worktree[name].review = <review 路径>`
     - 同时在 review 正文里列出具体要改的点
4. **汇报**:
   ```
   ✅ dev-serve 已 approved (attempt 01)
   ❌ dev-gui  被 rejected (attempt 02) — 3 条改动要求
   下一步:
     - dev-gui 重新工作
     - 若所有 dev worktree approved,通知 test worktree 上场
   ```

## 推进任务

当**所有** developer worktree 都进入 `review_approved`:
- 不要直接把任务设 `done`
- 让 test worktree 接力;test 通过后由 test worktree(或 reviewer 终审)推顶层 `status = done`
- 若没有 test worktree(极少数情况),reviewer 可直接在锁内:
  - 所有 `worktree[name].status = "done"`
  - 任务顶层 `status = "done"`

## 禁忌

- ❌ 代替 developer 改代码(review 是反馈,不是替身开发)
- ❌ 不读 diff 仅看报告就 approve(这会把 reviewer 降格成橡皮章)
- ❌ 越权改 plan.md / `action` 字段(如觉得 plan 有问题,在 review 正文指出,让用户 `/kanban --update` 调)
- ❌ 把 `worktree[name].status = "done"` 当成 approve 的等价操作(approve 对应 `review_approved`,`done` 是更后面的状态)
