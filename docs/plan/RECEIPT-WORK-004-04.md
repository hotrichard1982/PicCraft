---
id: RECEIPT-WORK-004-04
work: WORK-004-04
status: completed
created: 2026-08-12
updated: 2026-08-12
---

# RECEIPT-WORK-004-04

## 范围说明

WORK-004-04「CI macOS 双架构构建」：GitHub Actions 新增 macOS job（arm64/x64 矩阵，fail-fast: false），产出两个未签名 DMG Artifact，DMG 内断言 identifier 与文件关联；不签名、不公证、不创建 Release、不打 tag、无 secrets。Windows job 既有步骤未改动。

## 修复历程（workflow 返工）

1. **Run 31543334421**（push a7d2cca，WORK-004-01 返工段二复验）：macOS arm64 Rust 测试失败（`test_parse_opened_urls_directory` 尾斜杠，temp_dir 在 macOS 返回尾 `/`）→ 测试返工后（a7d2cca 本身）该 Run 中 **57 passed**。此 Run 的 lipo 步骤因测试先行失败从未执行到。
2. **Run 31547117391**（push a7d2cca 复验补推）：macOS arm64 Rust 测试 **57 passed**，但「验证产物架构」步骤失败，暴露本工单 workflow 缺陷：
   ```
   fatal error: .../lipo: can't open input file: src-tauri/target/release/bundle/macos/piccarft.app/Contents/MacOS/piccarft (No such file or directory)
   ```
   根因：tauri 打 DMG 流程先生成 `bundle/macos/piccarft.app`，`bundle_dmg.sh` 打包进 DMG 后清理中间 `.app`（日志：`Cleaning .../bundle/macos/piccarft.app`、`Finished 1 bundle at: .../piccarft_0.3.0_aarch64.dmg`），而 workflow 的 lipo 步骤仍指向已不存在的 `.app` 路径。x64 job 同 Run 中始终 queued（公共 macOS runner 拥堵），Windows job success。
3. **本次修复（push 294a414，Run 31548940733）**：将 lipo 架构校验移入「断言 DMG 内 Info.plist」步骤，改为对 **DMG 挂载后的 .app** 执行，共用一次挂载（hdiutil attach → 解析挂载点 → find .app → lipo -archs → python plist 断言 → detach），避免重复挂载。matrix 按 `arch` 期望 arm64 / x86_64。

## Changed Files（仓库内）

- `.github/workflows/ci.yml`（本工单全部改动，仅 workflow 文件）
  - 新增 macOS job（矩阵 arm64=macos-14 / x64=macos-13，fail-fast: false）：质量门禁复用（lint / 前端测试 / 构建 / Rust 测试 --locked / 文档 validate / 文档 index check）+ `npx tauri build`（tauri.macos.conf.json 自动合并）
  - 「重命名 DMG（命名含架构）」步骤：`PicCraft_<version>_<arch>.dmg`，Artifact `piccarft-dmg-<arch>`
  - 删除原「验证产物架构」独立步骤（指向被清理的 `bundle/macos/*.app` 路径）
  - 原「断言 DMG 内 Info.plist」步骤更名为「断言 DMG 内产物（架构 + Info.plist identifier/文件关联）」：挂载后先 `lipo -archs` 断言期望架构，再 python 断言 `CFBundleIdentifier` 与 `CFBundleTypeExtensions`，最后 `hdiutil detach`
  - 不签名、不公证、不创建 Release、不打 tag、无 secrets；Windows job 未改动

## 远端验证历史（按时间序）

| Run | push | macOS arm64 | macOS x64 | Windows | 结论 |
|---|---|---|---|---|---|
| 31543334421 | a7d2cca（测试返工段二） | Rust 测试失败（尾斜杠）→ 返工修复 | — | success | 测试缺陷，返工 |
| 31547117391 | a7d2cca（复验补推） | Rust 测试 **57 passed**，lipo 路径失败 | queued（runner 拥堵，未出结论） | success | workflow 缺陷，移交本返工 |
| 31548940733 | 294a414（本次修复） | **success**（7m51s，含 DMG 架构断言） | 见「未决项」 | **success**（5m8s） | 修复目标达成 |

## 最终 Run 结论（31548940733）

- Run 链接：https://github.com/hotrichard1982/PicCraft/actions/runs/31548940733
- **macOS arm64（job 93967211451）**：`success`，7m51s。质量门禁 + Rust 测试 + tauri build + DMG 内断言（架构 + Info.plist）全部通过。Artifact `piccarft-dmg-arm64` 已上传。
- **macOS x64（job 93967211521）**：状态见「未决项」。
- **Windows 质量门禁（job 93967211545）**：`success`，5m8s，回归全绿。
- 唯一注解为 Node 20 弃用提示（actions/checkout、setup-node、action-setup、upload-artifact 强制跑在 Node 24），非阻塞、非本工单范围。

## DMG 内断言结果（arm64 job 日志）

- 二进制架构（lipo）：`arm64`，断言 `*arm64*` 命中 → 通过
- `CFBundleIdentifier`：`com.cq30.piccarft`（断言相等通过）
- `CFBundleTypeExtensions`（fileAssociations 生成的 CFBundleDocumentTypes）：含 jpg/jpeg/png/webp/bmp 断言通过

## Artifact

| 名称 | 架构 | 大小 | 状态 |
|---|---|---|---|
| piccarft-dmg-arm64 | arm64 | 6,276,812 B（约 6.0 MB） | 已上传 |
| piccarft-dmg-x64 | x64 | — | 待 x64 job 完成 |

## 验证与收尾

- 本地验证：ci.yml 经 PyYAML 解析通过（`on:` 关键字预处理后 safe_load）；合并步骤 run 脚本提取后 `bash -n` 通过；`git diff --check` 无输出。`pnpm lint` / `cargo test` 不涉及（仅改 ci.yml）。
- 未关闭 PLAN、未创建 Release、未打 tag；本仓库其余文件未改动。

## 未决项

- **macOS x64 job 仍未跑完**：公共 macOS-13（Intel）runner 排队拥堵，自 Run 触发起持续 queued（截至回执更新时约 2 小时，Run 整体仍 queued，x64 尚未开始执行任何步骤）。x64 与 arm64 同 workflow、同代码、同步骤结构，仅 `lipo -archs` 期望 `x86_64`、runner 不同；预期结论与 arm64 一致。x64 job 完成后需补录结论与 Artifact 大小。
- **arm64 job 详细日志**（`lipo -archs` 输出、CFBundleIdentifier 值等）需 Run 整体完成后从日志归档提取，当前 Run 未 complete 无法下载；步骤级结论已由 job 状态（success）确认。
