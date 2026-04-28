# Kanban Skill

当多个 Claude Agent 各据一个 git worktree 时，协调任务流转、角色分工与写入安全的看板协议。

## 前提条件

- [Bun](https://bun.sh) >= 1.0
- Claude Code (或其他 CLI 工具, 例如 Opencode)

## 安装

```bash
cd kanban # 或你的项目目录名
ln -s "$(pwd)/skills/kanban" ~/.claude/skills/kanban # 或 ~/.agents/skills
bun --version || curl -fsSL https://bun.sh/install | bash
```

安装完成后，在 Claude 中初始化数据层：

```
/kanban --init
```

## 子命令

| 命令                                | 说明                           |
| ----------------------------------- | ------------------------------ |
| `/kanban --init`                    | 初始化 `~/.kanban/` 数据层     |
| `/kanban --new [<context>]`         | 从上下文创建任务(自动判别来源) |
| `/kanban --update <uuid> [ops]`     | 交互式或快捷更新任务字段       |
| `/kanban --uuid <uuid>`             | 查询任务视图与下一步建议       |
| `/kanban --role <role> [<context>]` | 当前 worktree 自注册角色       |

## 典型工作流

1. **创建任务**

   ```
   /kanban --new @docs/feature-plan.md
   ```

   Claude 从计划文件自动解析 worktree 划分，生成 `kanban.json` 条目与 `plan.md`。

2. **分配角色**

   在各 worktree 中执行 `/kanban --role developer` 等，Agent 自动登记身份并加载对应角色手册。

   > **席位匹配**：`--new` 创建任务时，Agent 根据 plan 预规划 worktree 名称与角色。执行 `--role` 时，若当前 worktree 名与预规划不同，Agent 会自动检测同角色的空置席位并提供认领选项，避免产生孤儿条目。认领操作会将预分配名替换为你的真实 worktree 名。

3. **开发与评审循环**

   developer 完成工作 → 写 dev report → `status` 变为 `waiting_review`  
   reviewer 读取报告与 diff → 写 review report → **approve** 或 **reject**  
   reject 时 developer 自动回到 `working` 状态继续修改

4. **测试与集成**

   全部 approved 后进入 test 阶段，最终 integrator 合并并归档任务。

## 目录结构

```
skills/kanban/
├── SKILL.md              # 主协议与触发分派表
├── references/           # 命令与角色参考手册
├── scripts/              # TypeScript 执行脚本
└── assets/               # 模板与报告骨架
```

详细协议见 [skills/kanban/SKILL.md](skills/kanban/SKILL.md)。

## 本地验证

```bash
# 1) 初始化数据目录
bun run skills/kanban/scripts/init.ts

# 2) 创建一条空白任务（控制台会输出 uuid）
bun run skills/kanban/scripts/new-task.ts --mode blank --repo wave --description "测试草案"

# 3) 用输出的 uuid 查询任务
bun run skills/kanban/scripts/query.ts <short_uuid>
```
