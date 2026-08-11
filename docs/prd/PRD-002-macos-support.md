---
id: PRD-002
title: macOS 支持 v0.3.0
status: 已接受
topics: [macos, release, platform, finder, dmg]
created: 2026-08-12
updated: 2026-08-12
---

# PRD-002 macOS 支持 v0.3.0

## 背景

PicCraft v0.2.0 稳定发布基线已收口（Windows，CI 全绿）。下一阶段目标是让软件支持 macOS：Apple Silicon（arm64）与 Intel（x64）双架构，最低 macOS 12 Monterey。

无 Apple Developer Program 账号、无证书、无公证能力；真机验证由朋友协助。本阶段为 macOS 适配的完整纵向切片：核心功能 + Finder 双击打开 + 单实例转发。

## 目标

- 版本 v0.3.0
- Apple Silicon arm64 与 Intel x64 双架构
- 最低 macOS 12 Monterey
- 核心功能（浏览 / 单图编辑 / 批量编辑 / 设置）在 macOS 可用
- Finder 双击图片打开：进入浏览视图，加载所在目录并全屏定位该图
- Finder 多文件打开：只按第一张图片所在目录浏览，不自动加入队列
- 冷启动且无历史目录时默认进入用户主目录 `~`
- 分别构建 arm64 与 x64 两个未签名 DMG，GitHub Actions 保存 CI Artifact
- 朋友真机确认后创建 v0.3.0 Pre-release（不自动发布）

## 范围

### 包含

- Finder 打开事件（`RunEvent::Opened`）→ 浏览视图路由 + 全屏定位
- 单实例场景的事件转发（第二个实例的打开事件转发给已运行实例）
- macOS 安全路径规则（`/System`、`/Library`、`/private`、`~/Library` 禁止）
- 路径大小写按平台/文件系统语义处理（macOS 默认大小写不敏感，不强行套 Windows 规则）
- 快捷键与文案平台化（`Cmd+S`、`Cmd+Shift+S`、`Cmd+A`、`Cmd + 滚轮` 调整缩略图；「在 Finder 中显示」；根节点「文件系统」）
- macOS 设置页：只读展示支持格式（JPG/JPEG、PNG、WebP、BMP）+ Finder 默认应用设置教程；**不提供假的动态文件关联勾选**
- Tauri 平台化配置：macOS bundle identifier `com.cq30.piccarft`（Windows 保持 `com.piccarft.app`）、DMG bundle target、UTI 静态声明
- CI：macOS 双架构构建（未签名 DMG → Artifact，无 secrets、无签名、无公证、无自动发布）
- 发布文档：Gatekeeper 处理（仅 Finder 右键「打开」教程，不提供关闭 Gatekeeper 或全局降低安全性命令）

### 排除

- 不签名、不公证、不上架 App Store
- 不自动发布 Release；Pre-release 仅在朋友真机确认后手动创建
- 不提供关闭 Gatekeeper 的文档或命令
- 不实现文件关联的动态注册/取消（macOS 由 LaunchServices 静态 UTI 声明 + Finder 设置完成）
- 真机未覆盖的架构必须透明标注「仅自动化验证」

## 验收标准

- [ ] `cargo test --locked` 全绿（含 macOS 安全路径规则测试）
- [ ] `pnpm test` / `pnpm lint` / `pnpm build` 全绿
- [ ] macOS CI：arm64 与 x64 两个未签名 DMG Artifact 生成
- [ ] Finder 双击图片打开后进入浏览视图并全屏定位该图（真机）
- [ ] Finder 多文件打开只按第一张图片目录浏览（真机）
- [ ] 冷启动无历史目录默认进入 `~`（真机）
- [ ] macOS 设置页显示只读支持格式与 Finder 教程，无假关联勾选（真机）
- [ ] 快捷键 Cmd+S / Cmd+Shift+S / Cmd+A / Cmd+滚轮 生效（真机）
- [ ] 安全路径规则生效：禁止目录不可访问，用户目录 /Applications / 用户临时目录可访问（真机）
- [ ] 实施计划 [PLAN-004](../plan/PLAN-004-macos-support.md) 及全部工单关闭

## 关联

- [ADR-0005 macOS 平台适配与分发](../adr/0005-macos-distribution.md)
- [ADR-0006 应用标识平台化](../adr/0006-bundle-identifier-platform.md)
- [PLAN-004 macOS 适配总计划](../plan/PLAN-004-macos-support.md)
- [CONTEXT.md](../../CONTEXT.md)
