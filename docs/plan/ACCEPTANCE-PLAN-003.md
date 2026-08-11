# ACCEPTANCE-PLAN-003

- 计划：`PLAN-003`（来源：`PRD-001`）
- 验收日期：2026-08-12
- 验收人：主 Agent（自动化与构建证据，UI 行为由自动化测试覆盖；批量同目录确认的自动化证据见 RECEIPT-WORK-003-04，真实 UI 验收项登记于未决项）
- 结论：通过

## 验收范围

v0.2.0 稳定发布基线六张工单：

- WORK-003-01 环境依赖（Node/pnpm/Rust 锁定、lockfile 复现）
- WORK-003-02 前端质量版本（lint 零错误、doctor 无 error、版本统一 0.2.0）
- WORK-003-03 Rust 测试安全（58 测试全绿、敏感路径校验、确定性截断）
- WORK-003-04 批量确认前端测试（同目录二次确认三条路径 + 81 前端测试）
- WORK-003-05 可复现构建 CI（GitHub Actions 全门禁）
- WORK-003-06 文档工具治理（validate/index check/status/rebuild 门禁修复）

## 证据

- 本地全量：`cargo test --locked` 58 passed；`pnpm test` 81 通过；`pnpm lint` 零错误；`pnpm build` 成功；`python tools/test_project_docs.py` 18 通过；`validate` 零断链；`index check` 健康。
- **远端 CI 全绿**（feat/plan-003-stable-baseline，Run 31539579969）：安装 / lint / 前端测试 / react-doctor / 构建 / Rust 工具链 / Rust 测试 58 passed / 文档链接校验 / 文档索引检查全部通过。
- CI 修复历程 4 次迭代且全部有 TDD 证据：① temp 尾分隔符差异（RECEIPT-WORK-003-03 返工段一）→ ② 8.3 短名与 canonicalize 长名差异（返工段二）→ ③ cp1252 中文输出崩溃（RECEIPT-WORK-003-06 返工段）。三者均为远端环境专属、本地无法预先暴露，已通过模拟测试与远端复验闭环。
- 版本号 package.json / Cargo.toml / tauri.conf.json / About 视图统一 0.2.0（RECEIPT-WORK-003-02）。
- Windows 安装包（EXE / MSI / NSIS）0.2.0 构建成功（WORK-003-01 回执）。

## 已知基线

- React Doctor 剩余 32 个 warning（零 error）已登记技术债，不为清零强行大重构（RECEIPT-WORK-003-02）。
- 批量同目录覆盖的**真实 UI 验收**（原生确认对话框点击）未完成：Orca 可读取弹窗但无法可靠操作 Windows 原生 dialog；取消/确认/异目录三条路径均有自动化测试证据（RECEIPT-WORK-003-04）。
- Node 20 deprecated 提示来自 actions/checkout、setup-node、pnpm/action-setup（仓库内 actions 版本策略），非门禁失败，不影响 v0.2 基线。

## 决定

接受 PLAN-003，关闭 PRD-001；v0.2 稳定发布基线达成，可合并 main 并作为 macOS v0.3 的起点。
