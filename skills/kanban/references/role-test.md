# Role: Tester

当 skill 自动触发且当前 cwd 匹配 `task.tester.<name>.cwd` 或条目 key 时加载此文档。

## 职责

在所有 developer 条目都到达 `review_approved` 或 `done` 后,在 tester worktree 合并相关 developer 分支，进行**集成测试 / 端到端验证**,写 **test cases** 与 **test report**,决定任务是否可以推到 `done`。`done` 是 tester pass 后的完成态,不再阻塞后续 tester / integrator 判断。若发现 bug，tester 必须先定位并创建 issue，不靠口头判断把 developer 直接打回。

## 前置条件

```
enter(cwd = <tester-worktree>)
│
├─ 检查 task 状态
│   ├─ 所有 developer 条目 status ∈ { "review_approved", "done" }? 否 → 等待,提示原因
│   ├─ 所有 reviewer 条目无 pending 工作? 是 → 继续
│   └─ 任务顶层 status ∈ { in_progress, planned }? 是 → 继续
│
└─ 进入测试阶段
```

如任一前置不满足,不要开工。清楚地汇报当前阻塞项,列出:
- 哪些 developer 条目还不是 approved / done(及其当前 status)
- 哪些 reviewer 还在干活

## 测试过程

1. **检查测试用例文档**:若 `tester.<name>.case_document` 为空,先写 `test-cases-<NN>.md` 并用 `agent-write.ts --set case_document=test-cases-<NN>.md` 记录
2. **设计/修订测试用例**:初版基于 plan / brief;developer 提交后,根据 dev report、review report 和 open issue 补充或调整
3. **提交 Human review**:Human review 的对象是用例设计是否覆盖真实验收意图,不是逐条判定测试结果
4. **合并分支**:在 tester worktree 里 merge / rebase 需要验证的 developer 分支,解决冲突(冲突大时创建 issue 或反向提 review 回绝,并说明)
5. **跑测试套件**:项目级测试脚本 + 手工验证关键路径
6. **覆盖三个层面**:
   - 自动化测试(unit + integration + e2e 按项目有什么跑什么)
   - 手工 smoke test(至少把 brief 指定的功能走一遍)
   - 回归快照(若项目维护)

## 履职原则

Tester 在执行测试前,必须先读 plan、dev report、review report 和 open issue。
先设计测试用例,再执行测试;不能只按最终目标随手 smoke。
测试用例必须覆盖 plan 目标、关键路径、失败路径、集成边界和主要回归风险。
测试用例设计需要提交 Human review;未记录 review 状态时只可准备和预跑,不得给出最终 pass。
每个 pass 都必须能追溯到具体用例、命令或手工验证证据。
大量自动化测试通过不等于可用;若真实用户路径不可用,verdict 仍应 fail。

## Issue 流程

发现失败时不要只写"测试失败"。先完成最小定位，再创建 issue：

```bash
bun run $SCRIPTS/issue.ts open \
  --thread <uuid> \
  --test <自己> \
  --owner <developer-name> \
  --title "<问题标题>" \
  --reproduction "<复现命令/场景>" \
  --expected "<期望>" \
  --actual "<实际>" \
  --diagnosis "<初步定位>" \
  --blocker "<为什么阻塞 tester verdict>" \
  --retest "<回测步骤>" \
  --related-report test-<NN>.md
```

脚本会：
- 写入 `issue-<slug>.md`
- 将 owner developer 置为 `follow_issue`
- 将 tester 自身置为 `waiting`

非 developer 责任的问题可以传 `--force --owner <tester|human|integrator>`，这类 issue 不会强行设置 developer 的 `follow_issue`。

## 回测 open issue

回测前必须读 open issue，并检查 owner developer 是否已经重新回到 `review_approved`。未满足时保持 `waiting`，不要执行回测。

回测步骤：
1. 在 tester worktree 合并 owner developer 的最新分支。
2. 优先执行 issue 的 Retest Plan。
3. 再跑必要回归，确认没有影响 changed 路径。
4. 回测通过：
   ```bash
   bun run $SCRIPTS/issue.ts done \
     --thread <uuid> \
     --issue issue-<slug>.md \
     --test <自己> \
     --resolution "<回测通过证据>"
   ```
5. 回测未通过：保持 issue `open`，并再次将 owner developer 置为 `follow_issue`：
   ```bash
   bun run $SCRIPTS/agent-write.ts \
     --thread <uuid> \
     --worktree <developer-name> \
     --set status=follow_issue
   ```

## 提交 test report

先遵守 `references/shared-delivery-contract.md` 的固定顺序。

`test-report` 是报告类型名，`test-<NN>.md` 是历史文件名前缀，`issue.ts --test` 是保留参数名；role key 仍是 `tester`。

1. **文件名**:`~/.kanban/<repo>/<uuid>/test-<NN>.md`
   - NN 递增(第一次 01,第二次 02)
   - 每次全量测试一轮写一份
2. **frontmatter + 正文**:见 `references/frontmatter-templates.md` 的 `test-report` 模板,包含 `verdict: pass | fail`
3. **原子提交**(按顺序执行):
   - pass:
     - 对每个 developer worktree `<dev>`:
       ```bash
       bun run $SCRIPTS/agent-write.ts \
         --thread <uuid> --worktree <dev> --set status=done
       ```
     - 对每个 reviewer worktree `<rev>`:
       ```bash
       bun run $SCRIPTS/agent-write.ts \
         --thread <uuid> --worktree <rev> --set status=done
       ```
     - 自己:
       ```bash
       bun run $SCRIPTS/agent-write.ts \
         --thread <uuid> --worktree <自己> --set status=done \
         --set report=~/.kanban/<repo>/<uuid>/test-<NN>.md
       ```
   - fail:
     - 自己:
       ```bash
       bun run $SCRIPTS/agent-write.ts \
         --thread <uuid> --worktree <自己> --set status=idle \
         --set report=~/.kanban/<repo>/<uuid>/test-<NN>.md
       ```
     - 对每个已定位且需重做的 developer worktree `<dev>`，优先用 `issue.ts open` 创建 issue；如必须直接回退：
       ```bash
       bun run $SCRIPTS/agent-write.ts \
         --thread <uuid> --worktree <dev> --set status=follow_issue
       ```
     - 任务顶层保持 `in_progress`(不需调 update-task.ts)
4. **汇报**:
   ```
   ✅ Tester 通过 (attempt 01)
      Report: test-01.md
   ```
   或:
   ```
   ❌ Tester 失败 (attempt 01)
      2 个 dev worktree 需重做:dev-serve, dev-gui
      Report: test-01.md
   ```

## MANDATORY COMPLETION CHECKLIST

在对话中汇报 tester verdict 之前，必须完成 `references/shared-delivery-contract.md`，并额外满足 tester 的验证要求:

1. **验证前置条件**：所有 developer worktree 处于 `review_approved` 或 `done` 状态
2. **维护测试用例文档**：写入或更新 `test-cases-<NN>.md`,并在 `tester.<name>.case_document` 记录
3. **运行集成测试**：merge / rebase 各 dev 分支，按测试用例运行测试套件和手工验证
4. **失败时创建 issue**：必须写清 reproduction、expected / actual、diagnosis、owner、blocker、retest plan
5. **原子更新 kanban 状态**（pass / fail / issue done，按上方命令执行）

> 不写 test report 文件 = 测试结果不存在。对话中的结论不能替代文件记录。

## 禁忌

- ❌ 在前置条件不满足时开工(产生噪声,浪费一轮)
- ❌ 自己修代码(发现 bug → 通过 tester fail 反馈给 dev worktree)
- ❌ 未合并 developer 分支就在 tester worktree 下结论
- ❌ 没有测试用例文档或未记录 `case_document` 就给最终 pass
- ❌ 只写"测试失败"但没有定位、owner 和回测标准
- ❌ 跳过 `withKanbanLock` 改 kanban.json
- ❌ 任务顶层 `status = done` 的前提除了本次 tester pass 还**必须**所有 developer 条目状态为 `review_approved` 或 `done`(跳过 review 直接 done 违反协议)
