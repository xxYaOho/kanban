# /kanban --standby

`--standby` 是已注册席位的前台值班模式。Human 显式开启后,当前 Agent 会话等待本席位可行动作;条件成熟后按对应角色手册履职。

它不是后台服务。会话结束或 Human 中断后不会继续运行。

## 命令形态

```bash
/kanban --thread <id> --role developer "负责某子计划" --standby
/kanban --thread <id> --role reviewer --standby
/kanban --thread <id> --role tester --standby
/kanban --standby
```

- `--role ... --standby`:先注册/认领席位,再进入待命。
- 单独 `--standby`:当前 cwd 必须能匹配唯一活跃席位。
- v1 不支持 `integrator --standby`。

## 席位解析

单独 `--standby` 时运行:

```bash
bun run $SCRIPTS/standby-resolve.ts
```

脚本扫描 `status ∈ {planned, in_progress}` 的任务,按当前 `basename(pwd)` 匹配各 role entry 的 `cwd` 或 key。零候选停止并提示先注册;多候选停止并提示指定 thread;唯一候选使用返回的 `thread/role/key` 进入待命。

## Wait 控制器

Agent 调用:

```bash
bun run $SCRIPTS/standby-wait.ts \
  --thread <uuid> \
  --role <developer|reviewer|tester> \
  --key <stableKey> \
  [--seen <fingerprint,...>]
```

等待策略由脚本维护:启动即检查;空轮询间隔 15s 起,每 5 次翻倍,序列 `15/30/60/120/240s`,最大 240s;最多 100 次空轮询,最长约 5h38m45s;到期提示 `已退出 Standby，请根据需要重启`。

Agent 只维护 `seen` 字符串,不在对话记忆里计算轮询次数。stdout 只用于机器 JSON;stderr 仅作诊断。

结果处理:

- `ready=true`:追加 `fingerprint` 到 `seen`,执行角色流程;如需继续待命,重新启动 `standby-wait.ts`。
- `ready=false, expired=true`:回复 `已退出 Standby，请根据需要重启`。
- 机制异常:停止待命并汇报原因。

`standby-wait.ts` 不执行角色工作,不写 report,不改 kanban。检测到 `ready=true` 时立即退出,计时状态随进程销毁;角色流程结束后若继续 standby,新计时器从 15 秒重新开始。

到期 JSON 必须包含 `ready:false`、`expired:true`、`emptyPolls`、`maxEmptyPolls`、`totalWaitSec`、`reason`、`message`。

## Trigger 脚本

```bash
bun run $SCRIPTS/standby-trigger.ts \
  --thread <uuid> \
  --role <developer|reviewer|tester> \
  --key <stableKey> \
  [--seen <fingerprint,...>]
```

`standby-trigger.ts` 只读 `kanban.json` 和 issue 文件,不写状态、不写报告。

输出合同:未触发时 `{ ready:false, reason }`;触发时必须包含 `ready:true`、`role`、`key`、`action`、`targets`、`fingerprint`、`reason`。

## 触发规则

Reviewer:存在 `developer.<name>.status == waiting_review`;脚本按 developer key 字典序返回第一个 target;Agent 只执行 stdout JSON 中的 `targets`;同一 report fingerprint 已在 `seen` 时不重复触发。

Tester:回测优先。tester 为 `waiting` 时只走回测;若没有 open issue owner developer 重新 `ready_for_test` 或 `review_approved`,不继续判断全测。全测要求 tester 非 `waiting/done`,所有 developer 都是 `ready_for_test/review_approved/done`,且至少一个 developer 是 `ready_for_test` 或 `review_approved`。

Developer:

| 条件 | 当前状态 | 动作 |
|------|----------|------|
| A | `idle`,task 为 `planned/in_progress`,且无 `blocked_on` | 读 plan / 子计划,开始开发 |
| B | `review_rejected` | 读最新 review,返工 |
| C | `follow_issue` | 读 owner 为自己的 open issue,修复 |

`ready_for_test`、`waiting_review`、`under_review`、`review_approved`、`done` 不触发 developer。

## Fingerprint

统一格式:

```text
<role>:<key>:<action>:<targetKey>:<targetStatus>:<targetAttempt>:<artifact>
```

`--seen` 是逗号分隔的 fingerprint 列表。fingerprint 是不透明字符串,只做整体比对,不做字段反向解析。`seen` 暂由 Agent 会话传参维护,不写临时状态文件。

artifact 规则:

- reviewer:目标 developer 的 `reports` 最后一项。
- developer `review_rejected`:自身 `review` 字段。
- developer `follow_issue`:owner 为自己的 open issue 文件名;多 open issue 时遍历全部 issue,跳过已 seen fingerprint,返回第一个 unseen issue。
- developer `follow_issue` 无 owner open issue 时:脚本仍以 artifact `-` 唤醒该 developer,用于处理状态不一致;这不是 standby 机制异常。
- tester 回测:`<issueFile>|<ownerLatestReport>`。
- tester 全测:`sorted(devKey:attempt:latestReport).join("|")`,按 `devKey` 字典序排序。

## 异常边界

正常业务流继续待命:

- reviewer reject。
- tester fail。
- issue open / done / closed。
- developer follow_issue 后修复再提交。

机制异常停止待命:

- `kanban.json` 解析失败。
- thread 不存在或 uuid 多候选。
- cwd / stable key 找不到席位。
- `standby-trigger.ts` 崩溃。
- `agent-write.ts` / `issue.ts` 写入失败。
- lock 异常。
