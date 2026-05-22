# 共享交付合同

所有角色在汇报状态变更前,必须先把交付证据写入文件系统,再更新 kanban。对话文本不是交付物。

## 固定顺序

1. 写报告文件到 `~/.kanban/<repo>/<uuid>/`。
2. 通过 `agent-write.ts` 更新对应 role 条目的 Agent 字段。
3. 必要时再用 `update-task.ts` 更新任务级状态。
4. 向 Human 简短汇报文件名、状态变化和下一步。

先写文件,再更新 kanban 指向它。顺序反过来会让其他 Agent 读到不存在的报告。

## 各角色报告

| Role | 报告类型 | 文件名 |
|------|----------|--------|
| developer | `dev-report` | `report-<worktree>-<NN>.md` |
| reviewer | `review` / `plan-review` | `review-<dev>-<NN>.md` / `plan-review-<NN>.md` |
| tester | `test-report` | `test-<NN>.md` |
| integrator | `integration-report` | `integration-<NN>.md` |

报告 frontmatter 统一读 `references/frontmatter-templates.md`。实际写文件时优先使用 `assets/report-skeletons/*.md` 的对应骨架。

## 汇报格式

汇报只保留执行结果:

```text
✅ <role/key> 已提交
Report: <filename>
Status: <before> → <after>
下一步:<动作>
```

不要把完整 plan、报告正文或 kanban 对象贴回对话。

## 禁止

- 未写报告文件就汇报 `waiting_review`、`review_approved`、`done` 或 tester verdict。
- 绕过 `agent-write.ts` / `update-task.ts` 直接改 `kanban.json`。
- 跨 role 或跨 worktree 写别人的正式报告。
