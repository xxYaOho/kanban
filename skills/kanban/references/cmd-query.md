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

`query.ts` 负责最终 plain text,Agent 逐字转发,不重排。输出必须保留这些区域:

- 顶部横幅:task short id、status、description、repo、plan、created、updated;`draft` 额外提示先提升到 `planned`;终态只换状态图标。
- Entries 矩阵:所有 owner / developer / reviewer / tester / integrator 条目的 `Entry / Role / Status / Attempt / CWD / Reports`。
- 当前身份视角:若 cwd 匹配席位,高亮当前 role/key/status/brief 并输出 `recommendedNextAction`。
- Plan 与子计划索引:列出 `plan-*.md`;当前 cwd 能匹配席位名时追加 `Current SubPlan`。
- Open Issues 摘要:列 open `issue-*.md`,不展开正文。
- 最近报告列表:按时间倒序列 `report-*`、`self-review-*`、`review-*`、`test-*`、`integration-*`、`owner-closeout-*`。

下一步建议由脚本生成,语义需保持:

| 身份      | entry.status       | 建议                                                   |
| --------- | ------------------ | ------------------------------------------------------ |
| owner     | idle / working     | 计划、分配、gate decision 或 closeout                     |
| developer | idle               | 读 plan,依 brief 开工,完成后写 report + self-review       |
| developer | working            | 继续,未完则保存进度                                    |
| developer | follow_issue       | 读 owner 为自己的 open issue,修复后写 related_issue report |
| developer | ready_for_test     | 等 tester;可切别的 worktree                            |
| developer | waiting_review     | owner 已插入 reviewer gate;等 reviewer                  |
| developer | review_rejected    | 读最新 review-<name>-NN.md,依据修改,attempt+1         |
| reviewer  | idle               | 检查 waiting_review 且 artifact 有效的 developer,拉取报告 review |
| reviewer  | working            | 继续 review                                            |
| tester    | idle               | `canTest=true` 时拉分支跑测,写 test-NN.md |
| integrator | idle              | `canIntegrate=true` 时合并分支,写 integration-NN.md |
| 任意      | blocked            | 读 `blocked_on` 字段,先解阻塞                         |

## 实现脚本

```bash
bun run $SCRIPTS/query.ts <uuid>
```

脚本负责:
1. 解析短前缀 → 完整 UUID,多候选时打印候选(Agent 层再问用户)
2. 不加锁读 kanban + 扫任务目录
3. 输出最终 plain text。Agent 对 `query.ts` / `status.ts` stdout 逐字转发,不总结、不省略、不重排；尾部 `\0JSON` 块仅供 `cmd-role.md` 等内部流程读取。`/kanban` 空参数走 help 模板例外。

尾部 JSON 字段:

| 字段 | 用途 |
|------|------|
| `currentEntry` | 当前 cwd 命中的 `{ role, key, status, brief }`，未命中时为 `null` |
| `idleStations` | 可认领的空置席位，保留给 `--role` 席位认领流程 |
| `eligibleReviewTargets` | `developer` 中所有 `waiting_review` 条目 |
| `readyForTestTargets` | `developer` 中所有 `ready_for_test` 或 `review_approved` 条目 |
| `testerBlockedBy` | tester 开工前仍未 `ready_for_test / review_approved / done` 的 developer 条目 |
| `integratorBlockedBy` | integrator 开工前所有未 `done` 的 developer / tester 前置条目;reviewer 仅在存在 `waiting_review` developer 时阻塞;owner 不阻塞 integrator |
| `canReview` / `canTest` / `canIntegrate` / `canOwnerCloseout` | 机器可读 gate 判断;表示正式承接该 gate 的前置状态和必要 artifact 都已满足 |
| `blockedReasons` | gate 不能推进时的结构化原因,包含 `gate` / `reason` / 可选 `entries` |
| `requiredArtifacts` | 当前 gate 需要的报告文件;可带 `missing` / `valid` / `problem` |
| `nextCommandHints` | 基于 `can*` 的短命令提示;Agent 仍需按角色手册履职 |
| `recommendedNextAction` | 一句话动作提示，只做引导，不替代角色手册 |

## 边界情况

- UUID 找不到 → 列最近 5 个任务供用户重选
- 短前缀多候选 → 列所有候选供选
- 任务目录丢失(`~/.kanban/<repo>/<uuid>/` 不存在) → 顶部标红警告,提示 `kanban.json` 与文件系统不一致,建议 `/kanban --update <uuid>` 修正 plan 字段或手工恢复目录
