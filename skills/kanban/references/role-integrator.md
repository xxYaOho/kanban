# Role: Integrator

当 skill 自动触发且当前 cwd 匹配 `task.integrator.<name>.cwd` 或条目 key 时加载此文档。

## 职责

集成是协作链的最后一环。将所有通过测试的功能分支合并回 main,解决冲突,产出可交付的 release candidate,并清理已完成的 git worktree。

`integrator` 是职责名,不要求独立 Agent。若用户指定由 main / owner 兼任主线收尾,仍按本手册执行。

## 触发条件

- 所有 developer 条目已由 tester 置为 `done`
- 测试报告 `verdict = "pass"`

## 工作循环

```
enter(cwd = <repo root>)  # 在主 worktree(仓库根目录)工作
│
├─ 1. 检查前置条件
│   ├─ 所有 developer 条目已完成
│   ├─ 无 blocked 状态的条目
│   └─ 条件不满足 → 汇报哪些条目未完成,退出等待
│
├─ 2. 更新 kanban
│   └─ bun run agent-write.ts --thread <uuid> --worktree <你> --set status=working --set attempt=<current+1>
│
├─ 3. 在主 worktree 创建集成分支
│   └─ git checkout -b integration/<tag>-attempt-<NN> main
│
├─ 4. 逐个合并功能分支
│   ├─ 简单冲突(格式、空白) → 自行解决
│   └─ 语义冲突 → 标记并升级给对应 developer
│       → integrator.conflicts 记录冲突并汇报需要 developer 介入
│
├─ 5. 运行完整回归测试套件
│
├─ 6. 编写集成报告 → integration-<NN>.md
│
├─ 7. 更新 kanban(锁内)
│   ├─ integrator.<你>.merged / conflicts 记录合并结果
│   ├─ integrator.<你>.status = "done"
│   └─ 任务顶层 status 提升为 "done"
│
└─ 8. 清理已完成 worktree
    ├─ git worktree list --porcelain
    ├─ 移除 clean 的 developer/tester worktree
    └─ 跳过 main、当前工作区、reviewer、dirty worktree 和无法定位的条目
```

## 提交 integration report

先遵守 `references/shared-delivery-contract.md` 的固定顺序。

完成一次集成时:

1. **报告文件名**:`~/.kanban/<repo>/<uuid>/integration-<NN>.md`
   - NN 用两位零填充,递增(01, 02, 03)
   - `NN = current_attempt`
2. **frontmatter + 正文**:先读 `references/frontmatter-templates.md` 的 `integration-report` 模板；实际写文件优先使用 `assets/report-skeletons/integration-report.md`
3. **原子提交**(按顺序执行):
   - 自己:
     ```bash
     bun run $SCRIPTS/agent-write.ts \
       --thread <uuid> \
       --worktree <自己> \
       --set status=done \
       --set report=~/.kanban/<repo>/<uuid>/integration-<NN>.md
     ```
   - 若需要记录合并分支或冲突,更新 integrator 自身:
     ```bash
     bun run $SCRIPTS/agent-write.ts \
       --thread <uuid> --worktree <自己> \
       --set merged='["feature/dev-a"]' \
       --set conflicts='[]'
     ```
   - 任务收尾:
     ```bash
     bun run $SCRIPTS/update-task.ts \
       <uuid> set:status=done
     ```
4. **清理已完成 worktree**:
   - 仅在主线合并完成、完整回归通过、integration report 已写入、任务顶层 `status=done` 后执行。
   - 用 `git worktree list --porcelain` 查看真实 worktree 路径；按 kanban 中 developer / tester 条目的 `cwd` 或 `worktree` 名称匹配。
   - 对 clean worktree 执行:
     ```bash
     git worktree remove <path>
     ```
   - 不删除本地分支。
   - 跳过 `main`、当前工作区、reviewer 条目、空 `cwd`、无法定位路径的条目。
   - 若 worktree 有未提交改动,不要 `--force`;汇报给用户确认后再处理。
5. **汇报**:
   ```
   ✅ 集成报告已提交 (attempt 01)
      Report: integration-01.md
      Merged: feature/cli-v014-serve, feature/cli-v014-gui
      Conflicts: 3 resolved / 0 escalated
      Regression: pass
      Cleanup: removed 2 worktrees / skipped 1 dirty worktree
      Status: working → done
   ```

## MANDATORY COMPLETION CHECKLIST

在对话中报告 integration `done` 之前，必须完成 `references/shared-delivery-contract.md`，并额外满足 integrator 的合并要求:

1. **验证前置条件**：所有 developer worktree 测试通过，无 blocked 状态
2. **创建集成分支并合并**：`git checkout -b integration/<tag>-attempt-<NN> main`，逐个合并功能分支
3. **运行完整回归测试套件**
4. **原子更新 kanban 状态**（按上方命令执行：更新自身 done / merged / conflicts，更新任务顶层 done）
5. **清理已完成 worktree**：仅移除 clean 的 developer/tester worktree,不删除分支；dirty 或无法定位的 worktree 必须汇报

> 不写 integration report = 集成未发生。所有证据必须在文件系统中。

## 异常路径

### 语义冲突无法自行判断

在 integration report 中显式声明冲突。若冲突可归属到某个 developer,必须同时创建 issue,让该 developer 进入 `follow_issue`;只写 integrator 自身 `conflicts/error` 不会触发 developer 承接。

1. 记录 integrator 自身冲突:
- ```bash
  bun run $SCRIPTS/agent-write.ts \
    --thread <uuid> \
    --worktree <你> \
    --set conflicts='["<冲突文件与说明>"]' \
    --set 'error=语义冲突需要 developer 介入'
  ```
2. 为对应 developer 创建可承接 issue:
   ```bash
   bun run $SCRIPTS/issue.ts open \
     --thread <uuid> \
     --test <tester-key> \
     --owner <developer-key> \
     --title "<集成冲突标题>" \
     --reproduction "<冲突文件与合并命令>" \
     --expected "<期望的合并语义>" \
     --actual "<实际冲突或失败>" \
     --diagnosis "<初步判断>" \
     --blocker "<为什么阻塞集成>" \
     --retest "<developer 修复后 integrator/tester 的验证步骤>" \
     --related-report integration-<NN>.md
   ```

若无法归属到 developer,必须在汇报中明确这是 Human 手动分派路径,并保持 integrator `status=working`;不要声称 developer 会自动接手。

### 回归测试失败

在 integration report 里显式声明失败原因和指向的具体 worktree,不自行修复。可归属到 developer 时,按上方 issue 流程把 owner developer 转为 `follow_issue`。同时执行:
- ```bash
  bun run $SCRIPTS/agent-write.ts \
    --thread <uuid> \
    --worktree <你> \
    --set status=working \
    --set 'error=回归测试失败: <一句话>'
  ```

等待 developer 修复并重新通过 reviewer / tester 后,再重新触发集成。

## 禁忌

- ❌ 前置条件不满足时强制合并
- ❌ 对语义冲突自行决策(必须升级给对应 developer)
- ❌ 标记 done 前跳过回归测试
- ❌ 在任务顶层 `status=done` 前清理 worktree
- ❌ 对 dirty worktree 执行 `git worktree remove --force`
- ❌ 跳过 `withKanbanLock` 改 kanban.json
