---
id: GUIDE-DEVICE-VERIFY
title: macOS 真机验收记录
status: 待真机回填（WORK-004-05 模板）
topics: [macos, verification, release, guide]
created: 2026-08-12
updated: 2026-08-12
---

# macOS 真机验收记录

> 用途：v0.3.0 macOS 发布前，由朋友在真机按本清单验收并回填。回填结果用于决定是否创建 Pre-release（见 [PRD-002](../prd/PRD-002-macos-support.md)）。
> 原则：**不编造真机结果**。未在真机覆盖的架构必须如实标注「仅自动化验证」。

## 验收环境

| 项 | 记录 |
|---|---|
| 验收人 / 日期 | |
| 机型 | |
| 芯片 | Apple Silicon（arm64）/ Intel（x64）/ **未知** |
| macOS 版本 | |
| 验收 DMG | `PicCraft_0.3.0_<arch>.dmg`（CI Artifact：`piccarft-dmg-<arch>`） |
| 是否按 Gatekeeper 指南右键打开 | 是 / 否 |

> 芯片不确定时记录「未知」，不要猜测。

## 验收清单

- [ ] **Finder 双击图片打开**：进入浏览视图，加载所在目录并全屏定位该图
- [ ] **Finder 多文件打开**：只按第一张图片所在目录浏览，不自动加入队列
- [ ] **冷启动（无历史目录）**：默认进入用户主目录 `~`
- [ ] **Cmd+S**：覆盖保存原图
- [ ] **Cmd+Shift+S**：另存为
- [ ] **Cmd+A**：全选当前目录图片
- [ ] **Cmd + 滚轮**：调整缩略图大小
- [ ] **设置页**：只读展示支持格式（JPG/JPEG、PNG、WebP、BMP）与 Finder 默认应用教程，无假的动态关联勾选
- [ ] **安全路径（禁止访问）**：`/System`、`/Library`、`/private`、`~/Library`
- [ ] **安全路径（可访问）**：用户目录、`/Applications`、用户临时目录
- [ ] **核心功能**：批量处理与单图编辑可用
- [ ] **架构覆盖标注**：本清单对应架构（arm64 / x64）真机验证情况，在「结论」区如实标注「真机验证」或「仅自动化验证」

## 结论

| 项 | 内容 |
|---|---|
| 整体结论 | 通过 / 不通过 |
| 未通过项 | （失败的清单项与现象描述） |
| 架构覆盖说明 | arm64：真机验证 / 仅自动化验证；x64：真机验证 / 仅自动化验证 |
| 发现的问题 | |
| 其他备注 | |

## 关联文档

- [PRD-002 macOS 支持](../prd/PRD-002-macos-support.md)
- [ADR-0005 macOS 平台适配与分发](../adr/0005-macos-distribution.md)
- [macOS Gatekeeper 使用指南](macos-gatekeeper.md)
- [README](../../README.md)（macOS 支持章节）
