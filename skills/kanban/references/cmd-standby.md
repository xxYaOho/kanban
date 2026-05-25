# /kanban --standby

`--standby` 是已注册席位的前台值班模式。Human 显式开启后，当前 Agent 会话会持续等待本席位可行动作；条件成熟后按对应角色手册自动履职，完成后继续待命。

它不是后台服务。会话结束或 Human 中断后不会继续运行。

## 命令形态

```bash
/kanban --thread <id> --role developer "负责某子计划" --standby
/kanban --thread <id> --role reviewer --standby
/kanban --thread <id> --role tester --standby
/kanban --standby
```

- `--role ... --standby`：先注册/认领席位，再进入待命。
- 单独 `--standby`：当前 cwd 必须能匹配唯一活跃席位。
- v1 不支持 `integrator --standby`。

## 单独 `--standby` 的席位解析

Agent 运行：

```bash
bun run $SCRIPTS/standby-resolve.ts
```

脚本扫描 `kanban.json` 中 `status ∈ {planned, in_progress}` 的任务，按当前 `basename(pwd)` 匹配各 role entry 的 `cwd` 或 key。

- 零候选 → 停止，提示先注册席位。
- 多候选 → 停止，提示指定 thread。
- 唯一候选 → 使用返回的 `thread`、`role`、`key` 进入待命。

## 前台循环

默认参数：

- 启动后立即检查一次，不先 sleep。
- 初始空轮询间隔：15 秒。
- 每 5 次连续空轮询后翻倍。
- 间隔序列：15s、30s、60s、120s、240s。
- 最大间隔：240 秒。
- 最多空轮询：100 次。
- 最长等待：约 5 小时 38 分 45 秒。
- 到期提示：`已退出 Standby，请根据需要重启`

Agent 维护 `seen` 字符串；等待计时、sleep、空轮询次数和动态间隔由 `standby-wait.ts` 管理。Agent 不在对话记忆里计算轮询次数。

```bash
seen=""

bun run $SCRIPTS/standby-wait.ts \
    --thread <uuid> \
    --role <role> \
    --key <stableKey> \
    --seen "$seen"
```

Agent 解析 stdout JSON：

- `ready=true`：追加 fingerprint 到 `seen`，执行角色流程；如需继续待命，重新启动 `standby-wait.ts`。
- `ready=false, expired=true`：回复 `已退出 Standby，请根据需要重启`。

`--seen` 是逗号分隔的 fingerprint 列表。fingerprint 是不透明字符串，只做整体比对，不做字段反向解析。`seen` 暂由 Agent 会话传参维护，不写临时状态文件。

`standby-wait.ts` 检测到 `ready=true` 时立即退出，计时状态随进程销毁；这是事件触发后的重置时机。角色流程结束后若继续 standby，Agent 启动新的等待控制器，新计时器从 15 秒重新开始。

stdout 只用于机器可解析 JSON。stderr 只用于少量诊断（例如间隔升级、到期、异常）；不要依赖 stderr 实时进入对话，关键状态由 Agent 读取脚本结果后转述。

## Wait 控制器

```bash
bun run $SCRIPTS/standby-wait.ts \
  --thread <uuid> \
  --role <developer|reviewer|tester> \
  --key <stableKey> \
  [--seen <fingerprint,...>]
```

输出 `ready=true` 时，格式与 `standby-trigger.ts` 相同。

输出到期：

```json
{
  "ready": false,
  "expired": true,
  "emptyPolls": 100,
  "maxEmptyPolls": 100,
  "totalWaitSec": 20325,
  "reason": "standby wait reached 100 empty polls",
  "message": "已退出 Standby，请根据需要重启"
}
```

`standby-wait.ts` 不执行角色工作，不写 report、不改 kanban。

## Trigger 脚本

```bash
bun run $SCRIPTS/standby-trigger.ts \
  --thread <uuid> \
  --role <developer|reviewer|tester> \
  --key <stableKey> \
  [--seen <fingerprint,...>]
```

输出 `ready=false`：

```json
{
  "ready": false,
  "reason": "no actionable standby trigger"
}
```

输出 `ready=true`：

```json
{
  "ready": true,
  "role": "reviewer",
  "key": "review",
  "action": "review_waiting_developer",
  "targets": ["motion"],
  "fingerprint": "reviewer:review:review_waiting_developer:motion:waiting_review:3:report-motion-03.md",
  "reason": "developer.motion is waiting_review"
}
```

`standby-trigger.ts` 只读 `kanban.json` 和 issue 文件，不写状态、不写报告。

## 触发规则

### Reviewer

- 条件：任意 `developer.<name>.status == waiting_review`。
- 动作：按 `role-reviewer.md` 审查目标 developer 最新 report。
- 同一 report 的 fingerprint 已在 `seen` 中时不重复触发。

### Tester

- 全测：所有 developer 都是 `review_approved` 或 `done`，至少一个 developer 是 `review_approved`，且 tester 未 `done`。
- 回测：tester 为 `waiting`，存在 open issue，且 issue owner developer 已重新 `review_approved`。
- 动作：按 `role-test.md` 全测或回测。

### Developer

| 条件 | 当前状态 | 动作 |
|------|----------|------|
| A | `idle`，task 为 `planned/in_progress`，且无 `blocked_on` | 读 plan / 子计划，开始开发 |
| B | `review_rejected` | 读最新 review，返工 |
| C | `follow_issue` | 读 owner 为自己的 open issue，修复 |

`waiting_review`、`under_review`、`review_approved`、`done` 不触发。

## Fingerprint

统一格式：

```text
<role>:<key>:<action>:<targetKey>:<targetStatus>:<targetAttempt>:<artifact>
```

artifact 规则：

- reviewer：目标 developer 的 `reports` 最后一项。
- developer `review_rejected`：自身 `review` 字段。
- developer `follow_issue`：owner 为自己的最新 open issue 文件名。
- tester 回测：`<issueFile>|<ownerLatestReport>`。
- tester 全测：`sorted(devKey:attempt:latestReport).join("|")`，按 `devKey` 字典序排序。

## 异常边界

正常业务流继续待命：

- reviewer reject。
- tester fail。
- issue open / done / closed。
- developer follow_issue 后修复再提交。

机制异常停止待命：

- `kanban.json` 解析失败。
- thread 不存在或 uuid 多候选。
- cwd / stable key 找不到席位。
- `standby-trigger.ts` 崩溃。
- `agent-write.ts` / `issue.ts` 写入失败。
- lock 异常。
