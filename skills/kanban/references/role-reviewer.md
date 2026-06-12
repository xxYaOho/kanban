# Role: Reviewer

当 skill 自动触发且条目属于 `task.reviewer` 时加载此文档。

## 职责

评审所有 `status == "waiting_review"` 的 developer 条目。对每份 dev report 给出 **approve** 或 **reject** 决定,写 **review 文档**,原子更新对应 developer 条目的 `review` 字段与 `status`。若 dev report 含 `related_issue`,reject 时 developer 回到 `follow_issue`,不是普通 `review_rejected`。

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
│      可顺带看所有 approved 状态,决定是否推进到 tester
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
   - 修复 open issue 的 report 必须包含 `related_issue: issue-*.md`

## 履职原则

Reviewer 的目标不是只找 bug,而是判断 developer 是否忠实完成 plan / brief。
必须同时检查需求符合度、实现完整性、代码健康、测试可行性和回归风险。
如果实现偏离 plan,即使代码能跑,也应 reject 或记录为阻塞风险。
如果 report、diff、测试证据三者无法互相印证,不得 approve。
Approve 必须说明为什么当前实现可以交给 tester,而不只是"未发现问题"。
Reject 必须给出 developer 可执行的修改点,而不是抽象评价。

## 提交 review

先遵守 `references/shared-delivery-contract.md` 的固定顺序。

1. **文件名**:`~/.kanban/<repo>/<uuid>/review-<name>-<NN>.md`
   - NN 与对应 `report-<name>-<NN>.md` 保持一致
2. **frontmatter + 正文**:见 `references/frontmatter-templates.md` 的 `review` 模板(包括 `verdict: approve | reject` 字段)
3. **原子更新**:
   - approve（更新 developer 状态 + 写入 review 路径）:
     ```bash
     bun run $SCRIPTS/agent-write.ts \
       --thread <uuid> \
       --worktree <dev-name> \
       --set status=review_approved \
       --set review=review-<dev-name>-<NN>.md
     ```
   - 同时更新 reviewer 自己的 `pass` 和 `report`:
     ```bash
     bun run $SCRIPTS/agent-write.ts \
       --thread <uuid> \
       --worktree <reviewer-name> \
       --set pass='["<dev-name>"]' \
       --set report=review-summary-<NN>.md
     ```
   - reject（普通实现回绝:更新 developer 状态 + 写入 review 路径）:
     ```bash
     bun run $SCRIPTS/agent-write.ts \
       --thread <uuid> \
       --worktree <dev-name> \
       --set status=review_rejected \
       --set review=review-<dev-name>-<NN>.md
     ```
   - reject（若对应 dev report 含 `related_issue`）:
     ```bash
     bun run $SCRIPTS/agent-write.ts \
       --thread <uuid> \
       --worktree <dev-name> \
       --set status=follow_issue \
       --set review=review-<dev-name>-<NN>.md
     ```
     - 同时在 review 正文里列出具体要改的点
4. **汇报**:
   ```
   ✅ dev-serve 已 approved (attempt 01)
   ❌ dev-gui  被 rejected (attempt 02) — 3 条改动要求
   下一步:
     - dev-gui 重新工作
    - 若所有 dev worktree approved,通知 tester 上场
   ```

## MANDATORY COMPLETION CHECKLIST (Standard Review)

对于每个 `waiting_review` 的 developer 条目，在对话中汇报 verdict 之前，必须完成 `references/shared-delivery-contract.md`，并额外满足 review 的检查要求:

1. **读 dev report 文件**：`~/.kanban/<repo>/<uuid>/report-<dev>-<NN>.md`
2. **拉取该 developer 的分支代码，查看 diff**
3. **写 review 文件到磁盘并更新 kanban**（approve 或 reject，按上方命令执行）

> 对话中的评审意见不是交付。磁盘上的 review 文件才是正式记录。
> 其他 Agent（developer、tester、integrator）只能通过文件系统读取你的评审结果。

## 推进任务

当**所有** developer 条目都进入 `review_approved`:
- 不要直接把任务设 `done`
- 让 tester 接力；tester 通过后将各 developer 设为 `done`
- 若没有 tester 条目(极少数情况),reviewer 可直接将各 developer 设为 `done`:
  ```bash
  bun run $SCRIPTS/agent-write.ts \
    --thread <uuid> --worktree <dev-name> --set status=done
  ```
  然后更新 reviewer 自身:
  ```bash
  bun run $SCRIPTS/agent-write.ts \
    --thread <uuid> --worktree <reviewer-name> --set status=done
  ```

## 非标准评审：Plan Review

当被要求评审 `plan.md`、设计文档或其他不在 `waiting_review` 标准流程中的内容时，按以下协议操作。

### 流程

1. **读取目标文档**：定位并读取 plan.md（路径在任务对象的 `plan` 字段中）
2. **分析评审**：评估可行性、完整性、清晰度、风险点
3. **写 plan review 文件到磁盘**：
   - 文件名：`~/.kanban/<repo>/<uuid>/plan-review-<NN>.md`
   - NN 递增（01, 02, 03），与 developer review 序列独立
   - 模板：`references/frontmatter-templates.md` 的 `plan-review` 模板
4. **原子更新 kanban 状态**（更新 reviewer 自身）：
   ```bash
   bun run $SCRIPTS/agent-write.ts \
     --thread <uuid> \
     --worktree <reviewer名> \
     --set status=done \
     --set report=plan-review-<NN>.md
   ```
5. **汇报**：标准模板 + verdict

### 注意事项

- 计划评审不影响任何 developer 条目的 `status`
- `plan-review-<NN>.md` 的 NN 编号独立于 `review-<dev>-<NN>.md`
- 若 reviewer 的 `report` 字段已有值（如之前的 review-summary），本次更新会覆盖。旧文件仍在磁盘上

### Plan Review 原则

Plan Review 的目标是判断计划能否指导 developer 实施,不是只判断方向是否正确。
计划必须说明目标、范围、具体动作、涉及对象、验收方式和主要风险。
对"整理文件"、"优化体验"、"完善逻辑"这类泛化动作,必须要求拆成可执行行为。
每个关键动作应能回答:改哪里、怎么改、不改哪里、完成后如何验证。
如果计划允许 developer 做出多种互相冲突的解释,应要求修改计划。
Approve 必须说明该计划为什么已经足以开工;changes_requested 必须给出具体补充项。

## 禁忌

- ❌ 代替 developer 改代码(review 是反馈,不是替身开发)
- ❌ 不读 diff 仅看报告就 approve
- ❌ 越权改 plan.md / `brief` 字段(如觉得 plan 有问题,在 review 正文指出,让用户 `/kanban --update` 调)
