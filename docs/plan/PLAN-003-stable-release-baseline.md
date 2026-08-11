---
id: PLAN-003
title: 稳定发布基线实施计划
status: implementing
source: PRD-001
topics: [release, quality, ci, testing, docs]
created: 2026-08-11
updated: 2026-08-11
---

# PLAN-003 稳定发布基线实施计划

## 开发前知识检查
- [x] 已运行 context
- [x] 已阅读分类索引
- [x] 已阅读具体内容文档
- [x] 已记录代码图谱结果
- [x] 已确认框架优先方案

### CLI 推荐索引

- 主索引：`docs/prd/index.md`、`docs/technology/index.md`
- 相关索引：`docs/test/test-index.md`、`docs/design/index.md`
- 流程索引：`docs/plan/plan-index.md`、`docs/bug/bug-index.md`

### 已阅读内容文档

- `CONTEXT.md` — 领域术语表、批量视图与队列语义
- `docs/prd/PRD-001-v0.2-stable-release-baseline.md`（本次新增）
- `docs/adr/0004-batch-output-same-dir.md`（本次新增，已接受）
- `docs/adr/0003-rust-thumbnail.md`、`docs/adr/0001-launch-routing.md` — ADR 风格参考
- `docs/plan/PLAN-001-audit-fixes.md`、`docs/plan/WORK-001-01-rust-backend-fixes.md`、`docs/plan/WORK-001-04-test-coverage.md` — PLAN/WORK 风格参考
- `docs/technology/index.md` — 技术栈与版本
- `docs/test/test-index.md` — 测试范围与验证命令
- `tools/project_docs.py` — 文档工具行为（new/start/close/validate/index）
- `README.md` — 发布流程与版本说明

### 代码图谱结果

- 批量处理链路：`src/components/BatchTab.tsx`（输出目录选择 + 开始处理）→ `batch_process_queue` → `execute_batch_processing`（`src-tauri/src/image_ops.rs`）。同批次重名自动加后缀；输出目录 == 输入目录且不重名时**直接覆盖原图**。
- 版本号三处：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 均为 0.1.0。
- 测试现状：前端 4 个测试文件（`CropCanvas.test.ts`、`SingleTab.test.ts`、`store/index.test.ts`、`BrowseView.test.ts`）；Rust 测试模块在 `image_ops.rs`、`lib.rs`。
- CI：仓库无 `.github/workflows`，无任何 CI 配置；发布走 `node scripts/release.mjs`（编译 + tag + gh release）。
- 文档工具：`project_docs.py` 提供 new/start/close/validate/status/index；validate 仅检查断裂链接，index check 检查索引健康度。

### 框架能力与结论

- 结论：全部工单复用现有工具链（Tauri 2 / Vite / Vitest / cargo test / ESLint），不新增或替换框架；仅 WORK-003-04 引入前端确认交互，已由 `docs/adr/0004-batch-output-same-dir.md` 决策并接受；环境与 CI 均使用官方标准配置，无需额外 ADR。

## 来源

- [PRD-001 v0.2 稳定发布基线](../prd/PRD-001-v0.2-stable-release-baseline.md)
- [ADR-0004 批量输出目录等于输入目录](../adr/0004-batch-output-same-dir.md)

## 实施工单

| 工单 | 标题 | 摘要 | 依赖 |
|---|---|---|---|
| [WORK-003-01](WORK-003-01-env-dependencies.md) | 环境依赖 | 锁定 Node/pnpm/Rust 工具链与 lockfile | 无 |
| [WORK-003-02](WORK-003-02-frontend-quality-version.md) | 前端质量版本 | 质量门禁清零 + 版本号统一 0.2.0 | WORK-003-01 |
| [WORK-003-03](WORK-003-03-rust-test-safety.md) | Rust 测试安全 | 测试隔离临时目录，不触碰真实用户目录 | WORK-003-01 |
| [WORK-003-04](WORK-003-04-batch-confirm-frontend-tests.md) | 批量确认前端测试 | ADR-0004 同目录警告 + 二次确认 + Vitest 测试 | WORK-003-02 |
| [WORK-003-05](WORK-003-05-reproducible-build-ci.md) | 可复现构建 CI | GitHub Actions 全门禁流水线 | WORK-003-01/02/03 |
| [WORK-003-06](WORK-003-06-doc-tooling-governance.md) | 文档工具治理 | validate/index check 纳入收口 | 无 |

## 停止条件

- 任一工单导致 `cargo build` 或 `pnpm build` 失败且无法当日修复 → 停止，返回 PLAN 修正
- WORK-003-04 若发现必须改 Rust 端才能满足 ADR-0004 → 停止，先走 ADR 补充决策
- WORK-003-05 若 CI 平台策略受限（如私有仓库 Actions 不可用）→ 停止，汇报替代方案

## 跨工单授权补记（PLAN-003 审计补正，2026-08-11）

审计发现以下两处工单范围与实际执行的授权记录冲突，特此在 PLAN 层补记实际授权与理由（消除范围记录冲突）：

1. **WORK-003-03 生产代码安全修复授权**：工单字面"禁止修改任何非测试生产代码"，但主代理委派时明确授权两项生产代码改动——① 统一 `batch_process`/`batch_process_queue` 敏感输入/输出路径校验（原批量入口存在访问系统敏感目录隐患）；② 目录批处理遵守 `MAX_DIR_ENTRIES` 上限（排序后确定性截断并告警）。理由：安全收紧属于本工单"测试安全"目标的后端支撑，不改动签名与命令语义、不违反 ADR-0004。详见 `WORK-003-03-rust-test-safety.md` 委派授权补记段与 `RECEIPT-WORK-003-03.md`。
2. **WORK-003-02 react-doctor 精确锁定 `0.9.11` 授权**：工单流程默认"不升级依赖"，但 doctor 脚本原为 `npx react-doctor@latest`（基线不可复现、每次拉取最新版），主代理明确指示"doctor 脚本锁定"；实际方案为把 devDependencies 从未被使用的 `^0.5.4` 精确钉到基线实测版本 `0.9.11`（脚本实际使用版本从未变化，属锁定而非升级）。理由与证据见 `RECEIPT-WORK-003-02.md` 关键决策段。

## 测试与验证
- [ ] 已运行要求的测试
- 测试命令：各 WORK 验证命令；总收口：`cd src-tauri && cargo test`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm doctor`、`python tools/project_docs.py validate`、`python tools/project_docs.py index check`
- 测试结果：

## 文档同步
- [ ] 已更新来源 PRD 或 BUG
- [ ] 已更新受影响项目文档
- [ ] 已更新相关索引

## 收口检查
- [ ] 工单回执完整
- [ ] 实施步骤全部完成
- [ ] 测试通过并记录结果
- [ ] 来源文档状态已更新
- [ ] 受影响文档已更新
- [ ] 索引已同步
