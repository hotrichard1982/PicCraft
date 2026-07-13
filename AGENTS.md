# Agent 规则

## 强制入口

- 先读 [`docs/index.md`](docs/index.md)，再运行 `python tools/project_docs.py context ...`；只读返回的分类索引和任务相关具体文档。
- 涉及框架或第三方库，先读 [`docs/technology/index.md`](docs/technology/index.md)，再用 `knowledge show/find/topics` 查询本地知识。
- 代码定位优先使用 codegraph / codebase-memory-mcp；图谱不足或查字符串、配置、非代码文件时才文本搜索。

## 开发门禁

- 功能/重构：`ADR + PRD -> PLAN -> context/知识/图谱 -> start -> TDD -> 测试 -> 文档 -> close`。
- Bug：`BUG -> PLAN -> context/知识/图谱 -> start -> TDD -> 回归 -> 文档 -> close`。
- 未成功 `python tools/project_docs.py start PLAN-ID`，不得实施中大型任务；未成功 `close`，不得声明完成。
- 新增、替换、升级、绕过框架，或改变架构/数据/权限边界，必须先确认 ADR。

## 实施规则

- 框架优先，复用已有组件、函数和项目封装；禁止重复实现框架已有核心能力。
- 功能和 Bug 采用 TDD：失败测试 -> 最小实现 -> 重构。
- 修改前确认调用方、被调用方和受影响测试；不改无关代码，不顺手扩范围。
- 出现需求不清、文档冲突、计划外中高风险改动时停止并汇报，不得猜测。

## 收口与安全

- 更新 PLAN、来源 PRD/BUG、受影响文档及分类索引；运行测试和 `project_docs.py validate`。
- 根索引只做导航；索引过长运行 `index check`，由低成本 Agent 执行 `index compact`，必要时 `index rebuild`；归档只移动索引记录，不移动原文档。
- 未授权不删除或大范围移动文件；临时产物不放项目根目录；未经老吴明确要求不得写入或修改记忆。


<!-- agent-project-docs:start -->
## Agent 项目文档工作流

开发前用 `context` 定位文档，用本地知识和代码图谱确认方案；PLAN 未成功 `start` 不得实施。开发后测试、更新文档、运行 `validate`；未成功 `close` 不得声明完成。
<!-- agent-project-docs:end -->
