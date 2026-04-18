# Kanban Skill

多 Agent(多 git worktree)协作的状态机 skill。见 `kanban/SKILL.md`。

## 安装(本地开发 → 实际用)

这个仓库是 skill 源码与方案文档。要让 Claude 实际用,得把下列目录软链/拷贝到 Claude 约定位置:

```bash
# 1) 把 skill 放进 ~/.claude/skills/kanban/
ln -s "$(pwd)/skills/kanban" ~/.claude/skills/kanban

# 2) 把 /kanban 命令入口放进 ~/.claude/commands/kanban.md
ln -s "$(pwd)/skills/commands/kanban.md" ~/.claude/commands/kanban.md

# 3) 确保 Bun 可用
bun --version  # 或 curl -fsSL https://bun.sh/install | bash

# 4) 初始化数据层
# 在 Claude 里运行: /kanban --init
```

## 目录

```
skills/
├── commands/kanban.md                  # /kanban 分派入口
└── kanban/
    ├── SKILL.md                        # 主协议
    ├── references/                     # 按需加载的子文档
    │   ├── cmd-init.md
    │   ├── cmd-new.md
    │   ├── cmd-update.md
    │   ├── cmd-query.md
    │   ├── role-developer.md
    │   ├── role-reviewer.md
    │   ├── role-test.md
    │   └── frontmatter-templates.md
    ├── scripts/                        # Bun 执行的 TS 脚本
    │   ├── paths.ts
    │   ├── kanban-io.ts
    │   ├── kanban-lock.ts
    │   ├── init.ts
    │   ├── new-task.ts
    │   ├── update-task.ts
    │   ├── query.ts
    │   └── status.ts
    └── assets/                         # 静态模板
        ├── kanban-template.jsonc
        ├── task-template.jsonc
        ├── draft-template.jsonc
        └── report-skeletons/
            ├── dev-report.md
            ├── review.md
            └── test-report.md
```

## 本地验证(不动 ~/.claude)

可以直接在本仓库跑脚本:

```bash
# 手动测试 init(会真的创建 ~/.kanban/;先备份或改 paths.ts 的 KANBAN_ROOT 做沙盒)
bun run skills/kanban/scripts/init.ts

# 创建草案
bun run skills/kanban/scripts/new-task.ts \
  --mode draft --repo wave --description "测试草案"

# 交互式更新请在 Claude 里走 /kanban --update;快捷形式可命令行直跑
bun run skills/kanban/scripts/update-task.ts <short_uuid> \
  set:status=planned

# 查询
bun run skills/kanban/scripts/query.ts <short_uuid>
```
