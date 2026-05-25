# Kanban Skill

当多个 Claude Agent 各据一个 git worktree 时，协调任务流转、角色分工与写入安全的看板协议。

## 前提条件

- [Bun](https://bun.sh) >= 1.1.0
- Claude Code (或其他 CLI 工具, 例如 Opencode)

## 安装

```bash
cd /path/to/skill_kanban
mkdir -p ~/.claude/skills
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
| `/kanban --thread <uuid>`           | 查询任务视图与下一步建议       |
| `/kanban --issue <open|done|closed>` | 测试问题流转                   |
| `/kanban --role <role> [<context>]` | 当前 worktree 自注册角色       |
| `/kanban --standby`                 | 已注册席位前台待命             |

## 典型工作流

1. **创建任务**

   ```
   /kanban --new @docs/feature-plan.md
   ```

   Claude 从计划文件自动解析 worktree 划分，生成 `kanban.json` 条目与 `plan.md`。

   需要渐进拆分时，可先创建 multi-plan 索引草案：

   ```
   /kanban --new multi-plan
   ```

   每确认一个子计划后，追加 `plan-<slug>.md` 和对应 idle 席位；第一个子计划落盘后即可提升到 `planned`，执行中也可继续追加新子计划。

2. **分配角色**

   在各 worktree 中执行 `/kanban --role developer` 等，Agent 自动登记身份并加载对应角色手册。

   > **席位匹配**：`--new` 创建任务时，Agent 根据 plan 预规划 worktree 名称与角色。执行 `--role` 时，若当前 worktree 名与预规划不同，Agent 会自动检测同角色的空置席位并提供认领选项，避免产生孤儿条目。认领操作会将预分配名替换为你的真实 worktree 名。

   需要让席位持续关注下一步时，可显式开启前台待命：

   ```
   /kanban --thread <id> --role reviewer --standby
   /kanban --standby
   ```

   standby 由等待控制器前台轮询：启动后立即检查，空轮询间隔从 15 秒起每 5 次翻倍，封顶 240 秒，最多 100 次空轮询；触发后由当前 Agent 按角色手册自动履职。

3. **开发与评审循环**

   developer 完成工作 → 写 dev report → `status` 变为 `waiting_review`  
   reviewer 读取报告与 diff → 写 review report → **approve** 或 **reject**  
   reject 时 developer 自动回到 `working` 状态继续修改。若 tester 创建了 open issue，owner developer 会进入 `follow_issue`，修复报告必须引用 `related_issue`。

4. **测试与集成**

   所有 developer 到达 `review_approved` 或 `done` 后进入 tester 阶段。tester 必须在自己的 worktree 合并相关 developer 分支；测试通过后，tester 将本轮通过的 developer 收尾为 `done`。`developer.done` 是 tester pass 后的完成态，不再阻塞后续 tester 判断。

   发现问题时，tester 先定位并创建 issue；owner developer 进入 `follow_issue`，修复后重新提交并通过 review，tester 再回测 issue。最终 integrator 合并并归档任务。

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
