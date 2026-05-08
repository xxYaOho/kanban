# Role: Reviewer

当 skill 自动触发且条目属于 `task.reviewer` 时加载此文档。

## 职责

评审所有 `status == "waiting_review"` 的 developer 条目。对每份 dev report 给出 **approve** 或 **reject** 决定,写 **review 文档**,原子更新对应 developer 条目的 `review` 字段与 `status`。

Reviewer 不绑定 worktree，可在任意目录注册后工作。注册示例：

```
/kanban --role reviewer "审查 dev-login 和 dev-payment"
```

## 工作循环

```
enter
│
├─ 扫 task.developer,收集 status == "waiting_review" 的条目
│
├─ 若为空
│   └─ 提示:没有待 review 的工作
│      可顺带看所有 approved 状态,决定是否推进到 test
│
└─ 对每个 waiting_review 的条目:
    ├─ 读 report-<name>-<NN>.md (任务目录下)
    ├─ 拉取该 developer 的 git worktree 分支,查看 diff
    ├─ 判断:通过 / 回绝
    └─ 写 review-<name>-<NN>.md (见下)
```

## 评审标准(按序检查)

1. **符合 plan 与 brief 语义**:实现是否真的解决了 brief 指定的事
2. **代码质量**:命名、结构、可读性、无明显坏味
3. **测试可行性**:至少关键路径有 unit/integration 覆盖,或报告里解释为何不做
4. **兼容性**:不破坏其他 developer 的合并基线;不碰 plan.md
5. **报告完整性**:dev report frontmatter 字段齐全

## 提交 review

1. **文件名**:`~/.kanban/<repo>/<uuid>/review-<name>-<NN>.md`
   - NN 与对应 `report-<name>-<NN>.md` 保持一致
2. **frontmatter + 正文**:见 `references/frontmatter-templates.md` 的 `review` 模板(包括 `verdict: approve | reject` 字段)
3. **原子更新**:
   - approve（更新 developer 状态 + 写入 review 路径）:
     ```bash
     bun run ~/.claude/skills/kanban/scripts/agent-write.ts \
       --thread <uuid> \
       --worktree <dev-name> \
       --set status=review_approved \
       --set review=review-<dev-name>-<NN>.md
     ```
   - 同时更新 reviewer 自己的 `pass` 和 `report`:
     ```bash
     bun run ~/.claude/skills/kanban/scripts/agent-write.ts \
       --thread <uuid> \
       --worktree <reviewer-name> \
       --set pass='["<dev-name>"]' \
       --set report=review-summary-<NN>.md
     ```
   - reject（更新 developer 状态 + 写入 review 路径）:
     ```bash
     bun run ~/.claude/skills/kanban/scripts/agent-write.ts \
       --thread <uuid> \
       --worktree <dev-name> \
       --set status=review_rejected \
       --set review=review-<dev-name>-<NN>.md
     ```
     - 同时在 review 正文里列出具体要改的点
4. **汇报**:
   ```
   ✅ dev-serve 已 approved (attempt 01)
   ❌ dev-gui  被 rejected (attempt 02) — 3 条改动要求
   下一步:
     - dev-gui 重新工作
     - 若所有 dev worktree approved,通知 test 上场
   ```

## 推进任务

当**所有** developer 条目都进入 `review_approved`:
- 不要直接把任务设 `done`
- 让 test 接力;test 通过后由 test(或 reviewer 终审)推顶层 `status = done`
- 若没有 test 条目(极少数情况),reviewer 可将各 developer 设为 `done`:
  ```bash
  bun run ~/.claude/skills/kanban/scripts/agent-write.ts \
    --thread <uuid> --worktree <dev-name> --set status=done
  ```
  然后更新 reviewer 自身:
  ```bash
  bun run ~/.claude/skills/kanban/scripts/agent-write.ts \
    --thread <uuid> --worktree <reviewer-name> --set status=done
  ```
  最后收尾任务:
  ```bash
  bun run ~/.claude/skills/kanban/scripts/update-task.ts \
    <uuid> set:status=done
  ```

## 禁忌

- ❌ 代替 developer 改代码(review 是反馈,不是替身开发)
- ❌ 不读 diff 仅看报告就 approve
- ❌ 越权改 plan.md / `brief` 字段(如觉得 plan 有问题,在 review 正文指出,让用户 `/kanban --update` 调)
