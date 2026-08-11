---
id: ADR-0005
title: macOS 平台适配与分发：未签名双架构 DMG + CI Artifact
status: 已接受
topics: [macos, release, distribution, dmg, gatekeeper]
created: 2026-08-12
updated: 2026-08-12
---

# ADR-0005: macOS 平台适配与分发

## 状态

已接受 (Accepted) — 2026-08-12

## 背景

PicCraft 需要支持 macOS（Apple Silicon arm64 + Intel x64，最低 macOS 12 Monterey）。开发与维护者**没有 Apple Developer Program 账号、证书或公证能力**，真机验证由朋友协助。macOS 分发链路存在强制约束：未签名应用会被 Gatekeeper 拦截（默认「已损坏，无法打开」提示）。

## 决策

1. **不签名、不公证、不上架 App Store**：维持现状能力边界，不注册开发者账号。
2. **分别构建 arm64 与 x64 两个未签名 DMG**，GitHub Actions 构建后保存为 CI Artifact，不自动发布。
3. **发布形态**：朋友真机确认后，手动创建 `v0.3.0` Pre-release（关联两个 DMG Artifact）。真机未覆盖的架构在发布说明中**透明标注「仅自动化验证」**。
4. **Gatekeeper 文档只提供 Finder 右键「打开」方式**；不提供关闭 Gatekeeper（`sudo spctl --master-disable`）或任何全局降低安全性的命令。
5. macOS 文件关联**不动态注册/取消**：由 Tauri 打包期的 `CFBundleDocumentTypes`（UTI 静态声明）完成，用户按设置页教程在 Finder「显示简介 → 打开方式」中把默认应用设为 PicCraft。

## 备选方案

- **Apple 开发者账号 + Developer ID 签名 + 公证**：最平滑的用户体验，但需要付费账号与证书；当前无此能力，拒绝。后续若获得账号可再走 ADR 升级。
- **只构建单一架构**：降低产物数量，但 Intel 与 Apple Silicon 用户中必有一方不可用，拒绝。
- **关闭 Gatekeeper 作为文档方案**：全局降低用户系统安全，不可接受，拒绝。
- **App Store 分发**：需要账号且受审核约束，拒绝。

## 后果

- 用户首次打开需右键 → 打开（Gatekeeper 流程）；已在 PRD-002 范围内明确为文档支持的唯一入口。
- 未签名 DMG 的架构覆盖依赖朋友真机；未覆盖架构（如无 Intel 真机）只能标注「仅自动化验证」。
- 后续获得签名能力时，DMG 产物与 CI 流程需要小幅升级（签名步骤），架构与打包配置可复用。
