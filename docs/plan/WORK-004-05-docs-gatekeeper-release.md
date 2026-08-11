# WORK-004-05: 发布文档与 Gatekeeper 指南

## PLAN 来源

[PLAN-004-macos-support.md](PLAN-004-macos-support.md)

## 目标

发布与真机验证文档收口：

- README：macOS 支持说明（版本 0.3.0、双架构、最低 macOS 12、未签名分发说明）、构建方式
- Gatekeeper 指南：仅 Finder 右键「打开」教程（首次打开未签名应用的唯一支持方式）；**不提供**关闭 Gatekeeper 或全局降低安全性的命令
- 设置页配套文档：Finder 默认应用设置教程内容与 PRD-002 一致（JPG/JPEG、PNG、WebP、BMP）
- 真机验收记录模板：清单化（Finder 双击、多文件、冷启动 ~、快捷键、设置页、安全路径、架构标注「仅自动化验证」），供朋友真机确认后回填
- Pre-release 流程：朋友确认后手动创建 `v0.3.0` Pre-release（关联两个 DMG Artifact），不自动发布

## 约束

- 不编造真机结果；未覆盖架构必须标注「仅自动化验证」
- 文档与实现一致（发布文档同步设置页实际文案）
- 不提供任何降低 macOS 安全性的命令

## 验收

- `python tools/project_docs.py validate` 零断链；`index check` 健康
- README 与设置页教程一致；Gatekeeper 指南不含禁用命令
- 回执记录文档清单与真机待验收项

## 交付

- 文档改动 + `docs/plan/RECEIPT-WORK-004-05.md`
- 不提交、不推送、不关闭 PLAN；其余文件不得改动
