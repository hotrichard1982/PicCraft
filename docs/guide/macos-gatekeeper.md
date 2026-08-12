---
id: GUIDE-GATEKEEPER
title: macOS Gatekeeper 使用指南
status: 待发布（WORK-004-05）
topics: [macos, gatekeeper, release, guide]
created: 2026-08-12
updated: 2026-08-12
---

# macOS Gatekeeper 使用指南

> 适用：PicCraft v0.3.0（macOS，未签名、未公证的 DMG 分发）。

## 为什么需要这篇指南

PicCraft v0.3.0 的 macOS 版本**未签名、未公证**（无 Apple Developer Program 账号与证书，决策见 [ADR-0005](../adr/0005-macos-distribution.md)）。

macOS 的 Gatekeeper 默认只允许打开来自 App Store、或经开发者签名并公证的应用。未签名应用首次打开时会被拦截，常见提示为「无法验证开发者」或「已损坏，无法打开」。

绕过拦截的**唯一受支持方式**是 Finder 右键 → 打开。本指南**不提供、也不建议**任何关闭系统安全功能、或全局降低系统安全性的命令或操作——保持系统默认安全设置即可。

## 首次打开步骤（唯一受支持方式）

1. 双击 DMG 挂载安装镜像，把 PicCraft 拖入「应用程序」（或直接双击 DMG 内的 PicCraft 图标）
2. 打开「应用程序」，**右键**点击 PicCraft 图标
3. 选择「打开」
4. 在系统确认弹窗中点击「打开」

之后 PicCraft 正常启动；以后再双击图标即可直接打开，无需重复以上步骤。

> 若双击只弹出拦截提示，请按上述右键 → 打开方式操作；不要尝试任何系统安全降级操作。

## 设置 Finder 默认打开方式（双击图片直接用 PicCraft 打开）

与设置页「设置 → 关联图片格式」中的教程一致：

1. 在 Finder 中右键点击图片
2. 选择「显示简介」
3. 在「打开方式」中选择 PicCraft
4. 点击「全部更改」应用到所有同格式图片

PicCraft 支持以下格式：**JPG / JPEG、PNG、WebP、BMP**。设置完成后，在 Finder 双击图片即进入浏览视图并全屏定位该图；多文件打开只按第一张图片所在目录浏览。

## 常见问题

### 双击 DMG 打不开或提示无法验证开发者

与首次打开应用同理：右键点击 DMG → 打开。挂载后把 PicCraft 拖入「应用程序」即可。

### 如何退出 DMG 安装镜像 / 卸载应用

- 退出 DMG 卷：在 Finder 侧边栏右键点击 PicCraft 卷 → 推出；或把 DMG 卷图标拖到废纸篓图标上
- 卸载应用：把「应用程序」中的 PicCraft 拖入废纸篓

### 为什么提示「已损坏，无法打开」？

未签名应用被拦截时的常见提示之一，**不代表安装文件损坏**。请使用右键 → 打开方式启动。

## 关联文档

- [PRD-002 macOS 支持](../prd/PRD-002-macos-support.md)
- [ADR-0005 macOS 平台适配与分发](../adr/0005-macos-distribution.md)
- [macOS 真机验收记录](macos-device-verification.md)
- [README](../../README.md)（macOS 支持章节）
