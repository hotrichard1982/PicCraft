---
id: ADR-0006
title: 应用标识按平台区分
status: 已接受
topics: [macos, identifier, bundle, launchservices]
created: 2026-08-12
updated: 2026-08-12
---

# ADR-0006: 应用标识（Bundle Identifier）按平台区分

## 状态

已接受 (Accepted) — 2026-08-12

## 背景

Tauri 的 `identifier`（`src-tauri/tauri.conf.json`）同时用于 Windows 安装身份与 macOS bundle identifier。macOS 上 bundle identifier 是 LaunchServices / UTI 文件关联 / 偏好设置的**稳定身份键**；Windows 上则参与安装与注册表标识。两者互相独立，无需一致。

已确认的平台专属标识：

- Windows：`com.piccarft.app`（保持现状）
- macOS：`com.cq30.piccarft`

## 决策

**按平台区分标识**：Windows 保持 `com.piccarft.app`，macOS 使用 `com.cq30.piccarft`。实现上不改写 `tauri.conf.json` 的静态 `identifier` 字段，而是通过 Tauri 的**平台条件配置**（`tauri.conf.json` 支持 per-platform 覆盖的 `bundle` 配置）或构建脚本按目标平台注入，保证单一配置源。

## 备选方案

- **全平台统一标识**：简单，但 macOS 侧标识与既有 Windows 身份语义无关；若未来 macOS 需要区分产品线或规范命名，改动成本更高。
- **运行时改写 identifier**：Tauri 打包期读配置，无运行时必要性，拒绝。

## 后果

- macOS 的 UTI 声明、LaunchServices 关联、`~/Library/Preferences` 使用 `com.cq30.piccarft` 命名空间。
- 平台条件配置需验证 Tauri 2 支持形式（per-platform bundle 覆盖）；若打包器不支持静态覆盖，由构建脚本按平台生成临时配置，验收时验证 DMG 内 `Info.plist` 的 `CFBundleIdentifier`。
