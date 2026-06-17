# Role: Owner

当 skill 自动触发且条目属于 `task.owner` 时加载此文档。

## 职责

Owner 是主线协调和收尾席位。它负责 plan、分配、optional reviewer gate、是否升级 integrator、以及 tester 通过后的 closeout。Owner 不能替代 tester。

## 工作循环

```
enter(cwd = main 或 owner key)
│
├─ 读 task.status / plan / entries
├─ 若任务仍是 draft
│   └─ 完善 plan / multi-plan,再由 Human 确认提升到 planned
├─ 若 developer 仍未 ready_for_test
│   └─ 等待或调整 plan / brief
├─ 若需要独立 gate
│   └─ action-write.ts owner.request-reviewer-gate
├─ 若 tester 未 done
│   └─ 等待 tester
├─ 若需要复杂集成
│   └─ 创建或等待 integrator
└─ tester done 且无未完成 active integrator
    └─ 写 owner-closeout-<NN>.md,执行 owner.closeout
```

## Reviewer Gate

Reviewer gate 是 optional。只有 owner 判断存在独立复核价值时才插入。

```bash
bun run $SCRIPTS/action-write.ts \
  --action owner.request-reviewer-gate \
  --thread <uuid> \
  --key <owner-key> \
  --target <developer-key> \
  --reason "<为什么需要独立 gate>" \
  [--evidence report-<developer-key>-<NN>.md]
```

若 developer 已经 `ready_for_test`,脚本会把该 developer 改为 `waiting_review`。若 developer 仍在 `idle / working / follow_issue / review_rejected`,脚本只记录 gate intent,developer 提交报告时再进入 `waiting_review`。

## Closeout

先遵守 `references/shared-delivery-contract.md` 的固定顺序。

1. **前置条件**
   - developer 全部 `done`
   - tester 全部 `done`
   - 若存在 active integrator,必须 integrator `done` 且有 integration report
   - `owner-closeout-<NN>.md` 已写入任务目录
2. **报告文件名**:`~/.kanban/<repo>/<uuid>/owner-closeout-<NN>.md`
3. **frontmatter + 正文**:见 `references/frontmatter-templates.md` 的 `owner-closeout`;实际写文件优先使用 `assets/report-skeletons/owner-closeout.md`
4. **原子提交**:
   ```bash
   bun run $SCRIPTS/action-write.ts \
     --action owner.closeout \
     --thread <uuid> \
     --key <owner-key> \
     --closeout owner-closeout-<NN>.md
   ```

## 禁忌

- ❌ 跳过 tester 直接 closeout。
- ❌ active integrator 未完成时 closeout。
- ❌ 将 reviewer 作为默认必经环节。
- ❌ 直接手改 `kanban.json`。
