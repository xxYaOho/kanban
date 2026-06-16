# /kanban --role

当前 worktree 自注册入口。在某个 worktree 中声明角色与职责,写入 kanban,并按角色自然承接下一步。

## 命令形态

```bash
/kanban --role developer "负责前端模块的 RBAC 实现"
/kanban --role owner "主线协调、计划和收尾"
/kanban --role reviewer
/kanban --role tester "本轮只跑 boundary 和 security"
/kanban --role integrator
/kanban --thread <id> --role reviewer --standby
```

- `<role>` 合法值:`owner` / `developer` / `reviewer` / `tester` / `integrator`。
- `test` 是 legacy alias;脚本兼容输入,新写入统一为 `tester`。
- `<context>` 可选,作为 `<role>.<name>.brief`。
- `--standby` 仅表示注册后进入前台待命;待命规则见 `cmd-standby.md`。

任务定位、uuid 解析和多候选处理遵循 `SKILL.md` 的任务定位公共流程。终态任务不能注册。

## 注册前检查

### Role 校验

非法 role 不直接写入。Agent 应追问用户选择合法 role;用户取消则中止,kanban 不变。

### 跨角色保护

调用 `role.ts` 前,Agent 必须扫描当前任务所有 role 条目:

- 同 role 且 `cwd == basename(pwd)` 或 key 等于当前 worktree 名:允许幂等刷新 brief。
- 不同 role 已绑定当前 worktree:拒绝跨角色切换,引导用户使用 `/kanban --update <uuid> add:<role>:<name>:'{"brief":"..."}'`。

`role.ts` 只在当前 role 内查已有 key/cwd,不会替 Agent 完成跨角色拦截。

### 预分配席位认领

当当前 cwd 尚未注册时,Agent 可运行 `query.ts <uuid>` 并读取尾部 JSON 的 `idleStations`。

`idleStations[role]` 的筛选条件是:

- `status == "idle"`
- `attempt == 0`

认领合同:

- `--claim-from` 当前仅用于 developer。
- 非 developer 的 `idleStations` 不能传给 `role.ts --claim-from`。
- developer 选择认领后,脚本传 `--claim-from <stationName>`;stable key 保持预分配席位名,cwd/worktree 记录当前目录名。
- 若 `--claim-from` 等于当前 worktree 名,无需认领,走同角色幂等路径。
- 若认领因竞争失败,重新运行 `query.ts`;仍有空置席位则重新展示,否则回退到正常创建。
- developer idle station 可能含 `blockedOn`;展示时必须提示阻塞关系。

Stable key 选择:

- developer 的 `--worktree` 是真实 cwd 名;认领预分配席位时通过 `--claim-from` 保留 station key。
- reviewer 不绑定真实 worktree;`--worktree` 应使用 entry key。优先复用已有 reviewer idle station key,没有预分配时默认使用 `review`。
- tester / integrator 绑定真实 worktree。只有 station key 等于当前 cwd 或已记录的 cwd 时,才可按该 key 幂等刷新。
- tester / integrator 的 station key 与当前 cwd 不同时,不要用 station key 调 `role.ts`;应新建当前 cwd 条目,并用 `/kanban --update` 清理或调整旧 idle station,避免残留 blocker。

## Brief 合同

- 有 `<context>` 时直接作为 brief。
- 无 `<context>` 时,Agent 根据 plan 和角色默认职责追问或生成明确建议。
- brief 必须非空且非占位符。

默认职责可压缩为:

| role | 默认职责 |
|------|----------|
| owner | 主线协调、计划和收尾 |
| developer | 完成 plan 中分配的实现、自测和 self-review |
| reviewer | 审查 developer 交付,确认 plan 对齐、代码质量和测试风险 |
| tester | 执行集成/边界/回归验证 |
| integrator | 合并通过验证的分支并产出 integration report |

## 写入字段

`role.ts` 在 `withKanbanLock` 内写入或刷新条目。

| role | 初始字段 |
|------|----------|
| owner | `status: idle`, `brief`, `attempt: 0`, `worktree/cwd`, `decisions: []`, `closeout: ""`, `error: null` |
| developer | `status: idle`, `brief`, `attempt: 0`, `blocked_on: null`, `worktree`, `cwd`, `reports: []`, `review: null`, `self_review: null`, `review_gate_required: false`, `error: null` |
| reviewer | `status: idle`, `brief`, `attempt: 0`, `pass: []`, `report: ""`, `error: null` |
| tester | `status: idle`, `brief`, `attempt: 0`, `worktree/cwd`, `case_document: ""`, `pass: []`, `fail: []`, `report: ""`, `error: null` |
| integrator | `status: idle`, `brief`, `attempt: 0`, `worktree/cwd`, `merged: []`, `conflicts: []`, `report: ""`, `error: null` |

Owner 默认 key 为 `main`,同一任务只能存在一个 owner。Reviewer 不绑定真实 worktree;`role.ts` 不写 `cwd/worktree`,后续用 entry key / `stableKey` 识别。Tester 和 integrator 在主 worktree 注册时 `worktree/cwd` 为 `null`。

若任务仍为 `draft`,注册后不自动提升到 `planned`。

## Developer auto-start

developer 注册或认领后,脚本会按状态决定是否自动开工:

| 条件 | 脚本行为 | Agent 行为 |
|------|----------|------------|
| task 为 `draft` | 保持 idle,输出 `autoStartReason` | 汇报需先提升到 `planned` |
| `blocked_on` 有值 | 保持 `status=idle`,输出阻塞原因;claim-from 时已写入 `cwd/worktree` 且 `attempt=1` | 汇报阻塞项,并说明该席位已认领、不再出现在 `idleStations` |
| task 为 `planned/in_progress` 且无 `blocked_on` | `status=working`, `attempt=1` 或至少为 1 | 读取 plan / 子计划并直接开始第一项工作 |
| task 为 `planned` 且 developer 开工 | task 提升为 `in_progress` | 汇报状态变化 |
| developer 为 `follow_issue` | 自动转 `working` | 先读 owner 为自己的 open issue 再修复 |

注册成功后,若 `autoStarted=true`,Agent 不再追问"是否开始"、"从哪里开始"。用户后续回复"ok"、"可以"、"继续"等,视为推进信号。

## 角色承接判断

注册后运行 `query.ts <uuid>` 并读取尾部 JSON。`recommendedNextAction` 只作短提示,不能替代角色手册。

关键字段定义:

| 字段 | 定义 |
|------|------|
| `currentEntry` | 当前 cwd 匹配到的 role/key/status/brief;先按 `cwd`,再按 key 回退 |
| `idleStations` | 每个 role 下 `status=idle && attempt=0` 的条目;developer 项可带 `blockedOn` |
| `eligibleReviewTargets` | 所有 `developer.status == waiting_review` 的条目 |
| `readyForTestTargets` | 所有 `developer.status == ready_for_test 或 review_approved` 的条目 |
| `testerBlockedBy` | 所有尚未 `ready_for_test / review_approved / done` 的 developer 条目 |
| `integratorBlockedBy` | 所有 developer / tester 中 `status != done` 的条目;reviewer 仅在存在 `waiting_review` developer 时阻塞;owner 不阻塞 integrator |
| `canReview` / `canTest` / `canIntegrate` / `canOwnerCloseout` | 机器可读 gate 判断;表示正式承接该 gate 的前置状态和必要 artifact 都已满足 |
| `blockedReasons` | gate 阻塞原因,用于等待或向 Human 汇报 |
| `requiredArtifacts` | 当前 gate 需要且必须有效的 report/self-review/test/integration artifact;可带 `missing` / `valid` / `problem` |
| `nextCommandHints` | 下一步短命令提示,只作辅助 |

承接规则:

- reviewer:若 `canReview=true`,按 `role-reviewer.md` 审查 `eligibleReviewTargets`;否则读取 `blockedReasons` / `requiredArtifacts` 并等待或向 Human 汇报缺失证据。
- owner:按 `role-owner.md` 做计划协调和 gate decision;只有 `canOwnerCloseout=true` 时才能执行 closeout。
- tester:若 `canTest=true`,按 `role-test.md` 测试 `readyForTestTargets`;否则读取 `blockedReasons` / `requiredArtifacts` 并等待。
- integrator:若 `canIntegrate=true`,按 `role-integrator.md` 合并;否则读取 `blockedReasons` / `requiredArtifacts` 并等待。

## 输出格式

注册成功至少汇报:

```text
✅ <worktree> 已注册 [<role>]
Task: <short-uuid> (<description>)
Brief: <brief>
Stable key: <stableKey>
Status: <idle 或 working>
```

若认领预分配席位,补充 `claimedFrom`。若脚本输出 `autoStarted` 或 `autoStartReason`,必须转述。若能匹配 plan 节或子计划,补充对应标题。

## 实现脚本

```bash
bun run $SCRIPTS/role.ts \
  --worktree <name> \
  --role <role> \
  --brief <brief> \
  --thread <uuid> \
  [--claim-from <presetName>]
```

stdout 关键字段:

- `stableKey`:后续 `agent-write.ts --worktree <stableKey>` 的参数。
- `autoStarted`:developer 是否已自动进入 working。
- `autoStartReason`:未自动开工的原因。
- `claimedFrom`:认领的预分配席位名。

若用户在 `/kanban --thread <id> --role <role> ...` 后追加 `--standby`,注册成功后读取 `stableKey`,再加载 `cmd-standby.md`。v1 拒绝 `integrator --standby`。
