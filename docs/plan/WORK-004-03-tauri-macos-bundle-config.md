# WORK-004-03: Tauri macOS 打包配置

## PLAN 来源

[PLAN-004-macos-support.md](PLAN-004-macos-support.md)

## 目标

Tauri 打包层完成 macOS 配置（与 WORK-004-01 并行）：

- Bundle Identifier 平台化（ADR-0006）：Windows 保持 `com.piccarft.app`；macOS 为 `com.cq30.piccarft`。优先使用 Tauri 2 平台条件配置（per-platform 覆盖）；若静态配置不支持，用构建脚本按目标平台注入临时配置，验收时验证 DMG 内 `Info.plist` 的 `CFBundleIdentifier`
- DMG bundle target：`src-tauri/tauri.conf.json` 增加 macOS bundle 配置（targets 含 dmg，版本 0.3.0）
- UTI 文件关联：`bundle > fileAssociations` 声明 Finder 支持格式（JPG/JPEG、PNG、WebP、BMP），生成 `CFBundleDocumentTypes`；`role: Viewer`，名称/图标合理
- 产物命名与架构：确认 arm64/x64 两个 DMG 可分别构建（Tauri 2 CLI 目标架构参数或 CI 分 job 构建），版本 0.3.0
- 本地 Windows 门禁不得破坏：Windows 构建路径行为不变

## 约束

- 版本号三处（package.json / Cargo.toml / tauri.conf.json）统一 0.3.0
- 不新增 Rust crate；不签名、不公证（无证书）
- 本机无 macOS 环境：本地验证以配置语法/JSON 校验 + Windows 门禁回归为主；真实打包由 WORK-004-04 的 macOS CI 验证
- 遵循 TDD（配置类工作以「可验证的产物/配置断言」替代单测，回执如实记录验证边界）

## 验收

- `tauri.conf.json` 与构建脚本 JSON/语法校验通过；`pnpm build`、`cargo test --locked`、Windows 门禁全绿
- macOS CI 验证项（移交 WORK-004-04）：两个架构 DMG 生成、`Info.plist` 含 `com.cq30.piccarft` 与 `CFBundleDocumentTypes`
- 回执记录配置方案、ADR-0006 实现方式与验证边界（本机无 macOS）

## 交付

- 配置/脚本改动 + `docs/plan/RECEIPT-WORK-004-03.md`
- 不提交、不推送、不关闭 PLAN；其余文件不得改动
