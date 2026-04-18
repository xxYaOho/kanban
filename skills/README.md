# Kanban Skill

多 Agent(多 git worktree)协作的状态机 skill。见 `kanban/SKILL.md`。

## 安装

```bash
# 1) 把 skill 软链到 ~/.claude/skills/kanban/
ln -s "$(pwd)/skills/kanban" ~/.claude/skills/kanban

# 2) 确保 Bun 可用
bun --version || curl -fsSL https://bun.sh/install | bash

# 3) 在 Claude 里初始化数据层
/kanban --init
```

> **注意**:不再需要 `~/.claude/commands/kanban.md`。Skill 天然支持显式 `/kanban` 调用和 auto-trigger 两条路径,commands 目录已废弃。

## 目录

```
skills/
└── kanban/
    ├── SKILL.md                        # 主协议 + 分派表(单一入口)
    ├── references/
    │   ├── cmd-init.md
    │   ├── cmd-new.md
    │   ├── cmd-update.md
    │   ├── cmd-query.md
    │   ├── cmd-role.md                 # /kanban --role 自注册
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
    │   ├── role.ts                     # --role 脚本
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

## 版本

v3.3:消除双入口 / 更正 draft 概念 / 简化 `--new` / 新增 `--role` 自注册。
