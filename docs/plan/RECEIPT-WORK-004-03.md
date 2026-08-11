---
id: RECEIPT-WORK-004-03
work: WORK-004-03
status: completed
created: 2026-08-12
updated: 2026-08-12
---

# RECEIPT-WORK-004-03

## 配置方案（总览）

| 项 | 方案 |
|---|---|
| Identifier 平台化（ADR-0006） | **Tauri 2 CLI 内建平台配置文件自动合并**：`src-tauri/tauri.macos.conf.json`，macOS 构建时由 CLI 自动查找并深合并覆盖。Windows 构建不加载该文件，`tauri.conf.json` 默认 `identifier: com.piccarft.app` 原样生效 |
| macOS bundle 段 | `targets: ["dmg"]`、`category: "Photography"`、`shortDescription`/`longDescription` 中文描述、`macOS.minimumSystemVersion: "12.0"`（PRD-002 最低 macOS 12） |
| UTI 文件关联 | `bundle.fileAssociations` 4 项（JPG/JPEG、PNG、WebP、BMP），`role: Viewer`，生成 `CFBundleDocumentTypes` |
| 构建入口 | `scripts/copy-dist.mjs` 增加 darwin 分支（tauri build 自动合并平台配置，拷贝 .app 与 bundle/dmg → dist/）；win32 分支原逻辑未动 |
| 不签名不公证 | 无任何证书/签名/公证配置（ADR-0005），未新增 npm 依赖，未改 `src-tauri/src/**` |

## ADR-0006 实现路线与证据

**最终路线**：Tauri 2 平台条件配置文件 `tauri.macos.conf.json`（ADR-0006 首选方案，非构建脚本注入）。

**证据（本机 Windows，无法真实跑 macOS 合并）**：

1. CLI 文档实证（`npx tauri build --help` 原文）：
   > `-c, --config <CONFIG>` JSON strings or paths to JSON, JSON5 or TOML files to merge with the default configuration file. Configurations are merged in the order they are provided, which means a particular value overwrites previous values when a config key-value pair conflicts.
   >
   > Note that **a platform-specific file is looked up and merged with the default file by default (tauri.macos.conf.json, tauri.linux.conf.json, tauri.windows.conf.json, ...)** but you can use this for more specific use cases such as different build flavors.

   → macOS 构建（含 WORK-004-04 CI 的 `tauri build`）自动合并 `tauri.macos.conf.json`，无需显式传 `--config`，Windows 构建路径零改动。
2. JSON Schema 字段实证（`node_modules/@tauri-apps/cli/config.schema.json`）：顶层 `identifier`（string）、`bundle.category`（枚举含 Photography）、`bundle.fileAssociations`（ext/mimeType/name/role，`role` enum 含 Viewer、`rank` 默认 Default 可省）、`bundle.macOS.minimumSystemVersion`、`bundle.targets` 均合法。
3. 合并语义模拟（node 深合并脚本，语义对齐 CLI 文档「对象合并、标量/数组覆盖」）：覆盖后 `identifier=com.cq30.piccarft`、`bundle.targets=["dmg"]`、`version 0.3.0` 保留、`icon` 数组保留 `icons/icon.icns`、Windows wix 配置保留但 macOS 打包器按平台忽略、`app.windows` 不受影响。**标注：此为语义模拟，非 CLI 真实执行；最终以 WORK-004-04 macOS CI 对 DMG 内 `Info.plist` 的 `CFBundleIdentifier`/`CFBundleDocumentTypes` 断言为准。**

**回退方案未启用**（构建脚本生成临时合并配置）——CLI 文档已明确平台文件自动合并机制，无需回退。

## 版本号统一 0.3.0（四处 + 前端两处 + 测试一处）

| 文件 | 字段 | 旧 → 新 |
|---|---|---|
| `package.json` | version | 0.2.0 → 0.3.0 |
| `src-tauri/Cargo.toml` | version | 0.2.0 → 0.3.0 |
| `src-tauri/tauri.conf.json` | version | 0.2.0 → 0.3.0 |
| `src-tauri/Cargo.lock` | 根包 `piccarft` version（其余 0.2.0 均为第三方依赖，未动） | 0.2.0 → 0.3.0 |
| `src/components/Header.tsx` | 界面字面量 | v0.2.0 → v0.3.0 |
| `src/views/SettingsView.tsx` | 关于页字面量 | v0.2.0 → v0.3.0 |
| `src/views/SettingsView.test.tsx` | 断言字面量 | v0.2.0 → v0.3.0 |

## fileAssociations 配置内容（src-tauri/tauri.macos.conf.json）

| ext | mimeType | name | role |
|---|---|---|---|
| jpg, jpeg | image/jpeg | JPEG Image | Viewer |
| png | image/png | PNG Image | Viewer |
| webp | image/webp | WebP Image | Viewer |
| bmp | image/bmp | BMP Image | Viewer |

映射：macOS 生成 `CFBundleDocumentTypes`（含 `CFBundleTypeName`/`CFBundleTypeRole=Viewer`）；`ext` 前导点由 Tauri 自动剥离；`rank` 缺省（Default）。

## Changed Files

**新增（1）**
- `src-tauri/tauri.macos.conf.json` — macOS 平台配置：identifier `com.cq30.piccarft`、`bundle.targets=["dmg"]`、category/shortDescription/longDescription、fileAssociations 4 项、`macOS.minimumSystemVersion="12.0"`；icon 沿用主配置（含 `icons/icon.icns`，文件已确认存在）

**修改（7）**
- `package.json` — version → 0.3.0
- `src-tauri/Cargo.toml` — version → 0.3.0
- `src-tauri/tauri.conf.json` — version → 0.3.0（identifier/bundle 默认值未动）
- `src-tauri/Cargo.lock` — 根包 version → 0.3.0（`--locked` 一致性）
- `src/components/Header.tsx` — 版本字面量 v0.3.0（结构未动）
- `src/views/SettingsView.tsx` — 版本字面量 v0.3.0（结构未动）
- `src/views/SettingsView.test.tsx` — 版本断言同步 v0.3.0

**修改（1，构建入口）**
- `scripts/copy-dist.mjs` — 新增 `buildMacOS()` darwin 分支（头部注释同步说明）；win32 分支 `resolveToolchainEnv`/主流程逐字未动

## 验证边界（诚实记录）

本机 Windows，无 macOS 环境。真实 DMG 构建与 `Info.plist` 断言移交 WORK-004-04 macOS CI。

| 验证项 | 结果 |
|---|---|
| JSON 语法（`JSON.parse`，主配置 + macOS 配置） | 通过 |
| JSON Schema 字段合法性（对照 config.schema.json 提取定义逐字段核对） | 通过 |
| 合并语义 node 模拟（identifier/targets/数组覆盖、icon 保留） | 通过（模拟，非 CLI 真实执行） |
| `pnpm lint` | 通过，退出码 0 |
| `pnpm build` | 通过（tsc -b + vite；658.45 kB chunk > 500 kB 警告为既有非失败项） |
| `pnpm test`（SettingsView 版本断言定向） | 通过（1/1） |
| `cargo test --locked`（当前工作区） | **红**——44 errors 均为 `cannot find function parse_opened_urls`，全部位于 WORK-004-01 未提交的 `src-tauri/src/lib.rs` 新增测试（引用已写、函数定义未落地），**与本次改动零交集**（本次改动文件清单与 `src-tauri/src/**` 无重叠） |
| `cargo test --locked`（HEAD 基线隔离验证） | **绿**——临时 worktree 检出 2ed7868 基线全量编译测试：58 passed，0 failed，退出码 0（验证后 worktree 已移除） |
| `python tools/project_docs.py validate` | 通过（`{"broken_links": []}`） |
| `node --check scripts/copy-dist.mjs` | 通过 |
| `icons/icon.icns` 存在 | 是（src-tauri/icons/ 下，主配置 icon 数组已含） |
| Windows 构建路径行为 | 未变：`tauri.conf.json` 未动 identifier/bundle 默认值；copy-dist.mjs win32 分支未动；无 `tauri.windows.conf.json`，CLI 不加载 macos 配置 |

## 风险与未决项

- **WORK-004-01 阻塞当前工作区 `cargo test --locked`**：WORK-004-01 未提交 Rust 改动（lib.rs +105 / image_ops.rs +61 行）处于「测试已写、`parse_opened_urls` 定义未落地」状态。基线隔离验证已证明与本次改动无关；WORK-004-01 合入后再跑当前工作区门禁即可全绿。
- **README.md 版本标注 `v0.2.0 (2026.08)` 未改**：不在本工单任务清单（版本四处 + 前端组件）内；README 版本属发布收口，建议 WORK-004-05（文档收口）统一处理。
- **真实 DMG / Info.plist 断言移交 WORK-004-04**：`CFBundleIdentifier=com.cq30.piccarft`、`CFBundleDocumentTypes` 四项、`LSMinimumSystemVersion=12.0`、`CFBundleVersion` 需 macOS CI 验证。
- **plan-index 状态未更新**：WORK-004-01/03 状态由 PLAN-004 收口方统一更新（共享工作区避免并发冲突，既有惯例）。
- 未提交、未推送、未关闭 PLAN。
