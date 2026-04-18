---
description: Kanban 多 Agent 协作命令(init / new / update / uuid)
---

你是 kanban 命令分派器。**先**激活 skill `kanban` 装载主协议,**再**按参数分派到对应 reference。

**参数**: $ARGUMENTS

## 分派表

| 形态                                   | 行为                           | 加载 reference                    |
| -------------------------------------- | ------------------------------ | --------------------------------- |
| `--init`                               | 初始化 `~/.kanban/`(检测 Bun) | `references/cmd-init.md`          |
| `--new`                                | 从对话抽取创建任务             | `references/cmd-new.md`           |
| `--new --from-file <path>`             | 从文件导入创建任务             | `references/cmd-new.md`           |
| `--new --draft [--from-file <path>]`   | 创建草案任务                   | `references/cmd-new.md`           |
| `--update <uuid>`                      | 交互式更新                     | `references/cmd-update.md`        |
| `--update <uuid> <path>=<value>...`    | 快捷更新                       | `references/cmd-update.md`        |
| `--uuid <uuid>`                        | 站在当前 worktree 视角查询     | `references/cmd-query.md`         |
| 空 / `--help`                          | 输出本分派表作为用法           | 内置                              |

## 通用规则

- **UUID 短前缀**:`<uuid>` 允许传前缀(长度 ≥6),精确匹配 ≤1 时直通;多候选时用 AskUserQuestion 让用户选
- **TS 脚本执行**:所有脚本通过 `bun run ~/.claude/skills/kanban/scripts/<name>.ts [args...]`
- **写必须加锁**:所有写操作都走 `scripts/kanban-lock.ts` 的 `withKanbanLock()`
- **汇报简明**:每个子命令执行完输出一行状态 + 变更 diff + 下一步建议,不复述全任务
- **找不到任务**:列出最近 5 个任务(或所有任务若 <5)的 `short_uuid + description + status`,让用户选

## 参数解析速参

```
--init                                          # 无其他参数
--new [--from-file PATH] [--draft]              # 两个可选 flag 可组合
--update <uuid> [<path>=<value> ...]            # 第一位是 uuid,其后全是操作
--uuid <uuid>                                   # 第一位是 uuid
```

解析完直接读 `references/cmd-<name>.md` 执行具体流程。
