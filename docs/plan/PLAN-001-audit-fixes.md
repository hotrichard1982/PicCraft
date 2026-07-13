# PLAN-001: 代码审计修复

## 来源

- 审计报告：[docs/audit/2026-07-13-full-code-review.md](../audit/2026-07-13-full-code-review.md)
- 用户决策：C1 仅排除系统敏感目录（`C:\Windows\**`、`C:\Users\**\AppData\**`），保留其余所有目录可访问
- 其余审计问题全部纳入实施计划

## 已读文档

- `CONTEXT.md` — 领域术语表、视图定义、架构决策
- `AGENTS.md` — 编码行为准则
- `docs/adr/0001-launch-routing.md` — 启动参数路由
- `docs/adr/0003-rust-thumbnail.md` — 缩略图 Rust 端生成
- `docs/technology/index.md` — 技术栈清单
- 代码图谱：`image_ops.rs`（31 符号）、`lib.rs`（7 符号）、`CropCanvas.tsx`（3 符号）

## 工单清单

| 工单 | 标题 | 审计项 | 风险等级 | 依赖 |
|---|---|---|---|---|
| WORK-001-01 | Rust 后端核心修复 | C2, M1, H5, M7, H3, H4 | 高（后端正确性） | 无 |
| WORK-001-02 | Asset 协议安全收紧 | C1 | 高（安全边界） | 无 |
| WORK-001-03 | 前端代码质量修复 | M2-M8, L1-L3, L6-L7 | 中（前端质量） | 无 |
| WORK-001-04 | 测试补充 | H1, H2 | 中（测试覆盖） | WORK-001-01, WORK-001-03 |
| WORK-001-05 | 文档同步 | L4, L5 | 低（文档） | WORK-001-01 ~ 03 |

## 停止条件

- 任何 WORK 导致 `cargo build` 或 `pnpm build` 失败 → 立即停止，返回 PLAN 修正
- WORK-001-02（安全）如果发现 Tauri scope 语法无法实现排除模式 → 停止，走 ADR 决策替代方案

## 测试与文档收口

- [ ] `cargo test` 全部通过（含新增测试）
- [ ] `pnpm lint` 零错误
- [ ] `pnpm build` 成功
- [ ] `python tools/project_docs.py validate` 零断裂链接
- [ ] `CONTEXT.md` 与实现一致（L4, L5）
- [ ] `docs/plan/plan-index.md` 更新工单状态
