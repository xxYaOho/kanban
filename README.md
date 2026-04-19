# Kanban Skill

多 Agent(多 git worktree)协作的状态机 skill。

## 安装

```bash
# 1) 把 skill 软链到 ~/.claude/skills/kanban/
ln -s "$(pwd)/skills/kanban" ~/.claude/skills/kanban

# 2) 确保 Bun 可用
bun --version || curl -fsSL https://bun.sh/install | bash

# 3) 在 Claude 里初始化数据层
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

## 目录结构

```
skills/
└── kanban/
    ├── SKILL.md                        # 主协议 + 分派表
    ├── references/
    │   ├── cmd-init.md
    │   ├── cmd-new.md
    │   ├── cmd-update.md
    │   ├── cmd-query.md
    │   ├── cmd-role.md
    │   ├── role-developer.md
    │   ├── role-reviewer.md
    │   ├── role-test.md
    │   └── frontmatter-templates.md
    ├── scripts/
    │   ├── paths.ts
    │   ├── kanban-io.ts
    │   ├── kanban-lock.ts
    │   ├── init.ts
    │   ├── new-task.ts
    │   ├── update-task.ts
    │   ├── query.ts
    │   ├── role.ts
    │   └── status.ts
    └── assets/
        ├── kanban-template.jsonc
        ├── task-template.jsonc
        ├── draft-template.jsonc
        └── report-skeletons/
            ├── dev-report.md
            ├── review.md
            └── test-report.md
```

## 本地验证

```bash
bun run skills/kanban/scripts/init.ts
bun run skills/kanban/scripts/new-task.ts --mode blank --repo wave --description "测试草案"
bun run skills/kanban/scripts/query.ts <short_uuid>
```
