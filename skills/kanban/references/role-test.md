# Role: Test

当 skill 自动触发且 `worktree.<cwd>.role == "test"` 时加载此文档。

## 职责

在所有 developer worktree 都到达 `review_approved` 后,拉取各分支进行**集成测试 / 端到端验证**,写 **test report**,决定任务是否可以推到 `done`。

## 前置条件

```
enter(cwd = <test-worktree>)
│
├─ 检查 task 状态
│   ├─ 所有 developer worktree.status == "review_approved"? 否 → 等待,提示原因
│   ├─ 所有 reviewer worktree 无 pending 工作? 是 → 继续
│   └─ 任务顶层 status ∈ { in_progress, planned }? 是 → 继续
│
└─ 进入测试阶段
```

如任一前置不满足,不要开工。清楚地汇报当前阻塞项,列出:
- 哪些 dev worktree 还不是 approved(及其当前 status)
- 哪些 reviewer 还在干活

## 测试过程

1. **拉 diff**:在 test worktree 里 merge / rebase 各 dev 分支,解决冲突(冲突大时反向提 review 回绝,并说明)
2. **跑测试套件**:项目级测试脚本 + 手工验证关键路径
3. **覆盖三个层面**:
   - 自动化测试(unit + integration + e2e 按项目有什么跑什么)
   - 手工 smoke test(至少把 action 指定的功能走一遍)
   - 回归快照(若项目维护)

## 提交 test report

1. **文件名**:`~/.kanban/wave/<repo>/<uuid>/test-<NN>.md`
   - NN 递增(第一次 01,第二次 02)
   - 每次全量测试一轮写一份
2. **frontmatter + 正文**:见 `references/frontmatter-templates.md` 的 `test-report` 模板,包含 `verdict: pass | fail`
3. **原子提交**(锁内):
   - pass:
     - 所有 dev worktree `status = "done"`
     - reviewer worktree `status = "done"`
     - 自己 `status = "done"`
     - 任务顶层 `status = "done"`
   - fail:
     - 自己 `status = "idle"`(等下一轮)
     - 把需要重做的 developer worktree `status = "review_rejected"`,并在 test report 里指向对应改动点
     - 任务顶层保持 `in_progress`
4. **汇报**:
   ```
   ✅ Test 通过 (attempt 01)
      Report: test-01.md
      任务顶层 status: in_progress → done
   ```
   或:
   ```
   ❌ Test 失败 (attempt 01)
      2 个 dev worktree 需重做:dev-serve, dev-gui
      Report: test-01.md
   ```

## 禁忌

- ❌ 在前置条件不满足时开工(产生噪声,浪费一轮)
- ❌ 自己修代码(发现 bug → 通过 test fail 反馈给 dev worktree)
- ❌ 跳过 `withKanbanLock` 改 kanban.jsonc
- ❌ 任务顶层 `status = done` 的前提除了本次 test pass 还**必须**所有 worktree 状态为 `review_approved`(跳过 review 直接 done 违反协议)
