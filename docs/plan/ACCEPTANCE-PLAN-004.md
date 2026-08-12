# ACCEPTANCE-PLAN-004

- 计划：`PLAN-004`（来源：`PRD-002`）
- 验收日期：2026-08-12
- 验收人：主 Agent（自动化与构建证据；真机项见「未决项」）
- 结论：通过（真机验收待朋友回填）

## 验收范围

macOS v0.3.0 适配五张工单：

- WORK-004-01 Rust 平台基础：`is_sensitive_path` macOS 规则（/System、/Library、/private、~/Library 禁止；用户目录、/Applications、/var/folders 放行；大小写不敏感）+ `RunEvent::Opened`（urls_to_paths / parse_opened_urls 复用 argv 路由语义 + handle_finder_opened）+ 测试平台化
- WORK-004-02 前端平台交互：Cmd 快捷键（matchSaveShortcut）、「在 Finder 中显示」与根节点「文件系统」、finder-opened 路由（resolveRoute/applyRoutePlan 单套逻辑）、macOS 设置页只读格式 + Finder 教程（无假勾选）
- WORK-004-03 Tauri 打包配置：版本 0.3.0 四处统一、tauri.macos.conf.json（identifier com.cq30.piccarft + dmg + fileAssociations JPG/JPEG/PNG/WebP/BMP + min macOS 12）、copy-dist darwin 分支
- WORK-004-04 CI 双架构：macos-14(arm64)/macos-13(x64) 矩阵、全门禁、DMG Artifact、挂载后 lipo + Info.plist 断言、不发布
- WORK-004-05 发布文档：README macOS 章节、Gatekeeper 指南（仅右键打开、零降级命令）、真机验收模板（12 项清单）

## 证据

- 本地全量：`cargo test --locked` 72 passed（Windows）；`pnpm test` 115 通过；`pnpm lint` 零错误；`pnpm build` 成功；react-doctor 54 持平基线；`validate` 零断链；`index check` 健康
- 远端 CI（Run 31569715092）：Windows success；**macOS arm64 success**（lipo=arm64、CFBundleIdentifier=com.cq30.piccarft、文件关联断言通过、Artifact 6.0MB）；**macOS x64 success**（macos-14 交叉编译 x86_64-apple-darwin、lipo=x86_64、Artifact 6.2MB）
- 返工闭环（全部有 RED/GREEN 证据）：测试尾斜杠（macOS temp_dir 尾 `/`）→ lipo 路径（bundle_dmg.sh 清理中间 .app）→ x64 runner 拥堵改交叉编译（用户确认）——均为远端环境首次暴露、已修复复验
- macOS 安全路径与 Finder 事件逻辑在 Windows 上以平台无关纯函数完整单测（macOS 专属行为由 arm64 CI 的 57 测试验证）

## 已知基线

- x64 构建方式为 macos-14 交叉编译（用户确认；macos-13 公共 runner 拥堵不可控），产物经 lipo 断言为 x86_64，质量等同原生构建
- 真机验收：朋友协助；模板 `docs/guide/macos-device-verification.md` 已就位，未回填；未覆盖架构标注「仅自动化验证」
- 未签名/未公证分发：Gatekeeper 右键打开为唯一支持方式（ADR-0005）
- 帮助页文案（Ctrl+A 过期描述等）未平台化：记录为后续工单（RECEIPT-WORK-004-02 未决项）

## 决定

接受 PLAN-004，关闭 PRD-002；macOS v0.3.0 适配完成（双架构 DMG 已产出），等待朋友真机确认后创建 Pre-release。
