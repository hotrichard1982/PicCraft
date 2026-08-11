# WORK-004-01: Rust 平台安全路径与 Finder 打开事件

## PLAN 来源

[PLAN-004-macos-support.md](PLAN-004-macos-support.md)

## 目标

Rust 端完成 macOS 平台基础，供前端与打包复用：

- `is_sensitive_path`（`src-tauri/src/image_ops.rs`）增加 macOS 规则：禁止 `/System`、`/Library`、`/private`、`~/Library`（用户 Library）；允许用户普通目录、`/Applications`、用户临时目录；路径大小写按平台/文件系统语义处理（macOS 默认大小写不敏感，不强行套 Windows 规则）
- Finder 打开事件接入：`tauri::RunEvent::Opened { urls }` 解析 URL（`file://` → 路径），与现有 argv 解析（`parse_*` 系列）复用同一路由语义：单文件 → 浏览视图全屏定位；多文件 → 只按第一张图片所在目录浏览
- 单实例场景事件转发：`tauri-plugin-single-instance` 回调中把 Finder 打开事件转发给已运行实例（与现有 argv 转发同链路）

## 约束

- 不改变 Windows 现有行为与既有测试；Windows 规则原样保留
- 复用现有 `is_sensitive_path` seam，做平台分支，不重构周边
- 不新增 Rust crate 依赖（Cargo.lock 不变）
- 遵循 TDD：失败测试 → 最小实现

## 验收

- 新增 macOS 安全路径测试（禁止目录拒绝、允许目录放行、`~/Library` 拒绝、`~` 放行、大小写语义测试）与打开事件解析测试（单文件/多文件/非图片/目录）
- `cargo test --locked` 全绿（Windows 既有 58 个 + 新增）
- `cargo check --locked` 通过
- 回执记录 RED/GREEN 证据

## 交付

- 生产代码 + 测试 + `docs/plan/RECEIPT-WORK-004-01.md`
- 不提交、不推送、不关闭 PLAN；其余文件不得改动
