# 图轻剪 PicCraft 🖼️

模块化桌面图片处理工具 — 浏览、挑选、单张/批量编辑一体化工作流。

**v0.3.0 (2026.08)** · Rust + Tauri v2 · React 19 · TypeScript · Tailwind CSS · Konva.js · 明暗双主题

**重庆三人众科技有限公司** | QQ: 7602069 | 邮箱: 7602069@qq.com | [官网](https://www.cq30.com/)

---

## 功能

### 浏览视图
- **侧边栏目录树**：左侧 240px（可拖拽 180~480px），完整文件系统树，懒加载子目录，可收起。自动定位到当前目录并高亮。
- **缩略图网格**：CSS Grid 自适应布局，默认 300px 缩略图
- **缩略图懒加载 + 加速**：IntersectionObserver + Rust 端快速解码（JPEG 按比例 1/2/4/8 缩放解码，跳过整图解码）+ 磁盘缓存（二次打开秒出）
- **多选交互**：Ctrl+点 / Shift+范围选 / 鼠标框选（rubber band，可从缩略图上方开始框选）
- **缩略图大小调节**：`Ctrl+滚轮` / `Ctrl+加号/减号`，步长 10%，范围 100-800px
- **全屏看图**：Konva 画布渲染，←→/Space 翻页（循环），`+ - 0 F` 缩放，`R` 旋转，`E` 跳转编辑
- **底部工具栏**：关闭 / 旋转 / 翻页 / 缩放 / 适应窗口 / 编辑，鼠标静止 1.5 秒自动隐藏
- **首次使用提示**：进入全屏时底部淡出快捷键提示条，5 秒后自动消失
- **左右半区点击翻页**：点击画布左 35% = 上一张，右 35% = 下一张
- **深浅主题适配**：全屏背景和工具栏颜色跟随系统/手动切换的明暗主题

### 队列系统
- 浏览视图右键选中图 → "加入队列"（含 N 张提示）→ 自动切到批量视图
- 队列面板：缩略图 + 文件名 + 状态图标（待处理/处理中/完成/失败）
- 右键菜单：移除 / 在单图编辑中打开 / 复制路径 / 在资源管理器中显示
- 队列去重（重复路径自动忽略）

### 单张处理
- **缩放**：按目标尺寸等比或自由缩放，支持保持原图比例（Lanczos3 算法）
- **裁剪**：鼠标拖拽选区 + 8 个可拖动手柄 + 数值输入，ESC 取消，RAF 节流优化
- **翻转/旋转**：水平/垂直翻转、顺时针/逆时针 90°（DynamicImage 内置方法，零拷贝）
- **拖拽加载**：直接从文件管理器拖拽图片到预览区，支持悬停视觉反馈
- **实时预览**：Konva Canvas 渲染，半透明裁剪遮罩，图片加载失败有错误日志
- **文件保护**：自动拒绝超过 200MB 的超大图片，防止内存溢出
- **另存为**（Ctrl+Shift+S）/ **覆盖原图**（Ctrl+S），支持 JPG / PNG（调色板量化）/ WebP / BMP

### 批量处理
- 从队列读取待处理图片列表
- 按目标宽度等比缩放（Lanczos3），异步处理（tokio），进度实时显示
- 保留旧 `batch_process` 命令（向后兼容）
- JPEG 压缩质量可调（1-100）
- 输出目录持久化（Tauri Store，tauri-plugin-store）

### 设置视图
- 3 子 Tab：设置 / 帮助 / 关于
- **设置**：图片格式关联勾选管理（注册表写入可用）
- **帮助**：软件使用教程（折叠面板）
- **关于**：版本号、技术栈、开源协议、公司信息

### 文件关联
- **启动自动检查**：软件启动 1.5 秒后后台检查默认图片打开方式是否为 PicCraft
- **自动恢复**：被其他软件（如 WPS）篡改时弹出提示，一键恢复为 PicCraft
- 支持 `open`（双击查看）和 `edit`（右键编辑）两个 verb

### 启动路由
- 冷启动 → 浏览视图（加载上次目录）
- 双击 .jpg → 浏览视图（全屏看图模式 + 定位该图）
- 右键"用图轻剪编辑" → 单图编辑视图
- `single-instance` 插件：第二次启动自动转发参数给已运行实例

---

## macOS 支持

PicCraft v0.3.0 起支持 macOS。以**未签名、未公证**的 DMG 分发，首次打开需按 Finder 右键「打开」方式操作（见 [macOS Gatekeeper 使用指南](docs/guide/macos-gatekeeper.md)）。

| 项 | 说明 |
|---|---|
| 版本 | 0.3.0 |
| 架构 | Apple Silicon（arm64）与 Intel（x64）双架构，分别发布独立 DMG |
| 最低系统 | macOS 12 Monterey |
| 支持格式 | JPG / JPEG、PNG、WebP、BMP |
| Finder 双击打开 | 进入浏览视图，加载所在目录并全屏定位该图；多文件打开只按第一张图片所在目录浏览 |
| 冷启动 | 无历史目录时默认进入用户主目录 `~` |
| 快捷键 | `Cmd+S` 覆盖保存 / `Cmd+Shift+S` 另存为 / `Cmd+A` 全选 / `Cmd+滚轮` 调整缩略图 |
| 设置页 | macOS 只读展示支持格式与 Finder 默认应用教程，无动态关联勾选 |
| 安全路径 | `/System`、`/Library`、`/private`、`~/Library` 不可访问 |

真机验收清单见 [macOS 真机验收记录](docs/guide/macos-device-verification.md)。

---

## 快速开始

项目文档库入口：[docs/index.md](docs/index.md)。开发前可从这里定位架构决策、项目设计、技术栈、测试和操作指南。

### 前置条件

版本由仓库声明文件锁定（`.nvmrc` / `package.json` 的 `engines` 与 `packageManager` / `rust-toolchain.toml`），安装指引如下：

- [Node.js](https://nodejs.org/) 24.14.0（见 `.nvmrc`；推荐用 [nvm-windows](https://github.com/coreybutler/nvm-windows) 管理，`nvm install` 后 `nvm use`）
- [pnpm](https://pnpm.io/) 11.18.0（与 `package.json` 的 `packageManager` 一致；Node 自带 corepack：`corepack enable && corepack prepare pnpm@11.18.0 --activate`）
- [Rust](https://www.rust-lang.org/) stable MSVC（见 `rust-toolchain.toml`；用 [rustup](https://rustup.rs/) 安装：`rustup-init.exe` 或 `winget install Rustlang.Rustup`）
- Windows 构建环境：[Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) 的"使用 C++ 的桌面开发"工作负载（含 MSVC 与 Windows SDK），用 `winget install Microsoft.VisualStudio.2022.BuildTools` 安装并勾选 C++ 工作负载

### 开发（热更新）

```bash
pnpm install
pnpm tauri dev
```

前端修改自动热更新，Rust 修改自动重新编译。

### 构建发布版

```bash
pnpm tauri build
```

构建脚本 `scripts/copy-dist.mjs` 自动探测本机 Visual Studio Build Tools 的 MSVC 与 Windows SDK 版本并组装编译环境（优先继承 VsDevCmd / Developer PowerShell 环境，否则用 vswhere 定位最新版本，找不到时给出 `winget install Microsoft.VisualStudio.2022.BuildTools` 指引），无需手写版本路径。

输出：
- `src-tauri/target/release/piccarft.exe` — 主程序
- `src-tauri/target/release/bundle/msi/` — MSI 安装包
- `src-tauri/target/release/bundle/nsis/` — NSIS 安装包

### 构建 macOS 发布版（在 macOS 上执行）

```bash
npx tauri build
```

Tauri 2 CLI 自动查找并合并平台配置 `src-tauri/tauri.macos.conf.json`（identifier `com.cq30.piccarft`、DMG 打包目标、文件关联 UTI、最低 macOS 12），无需额外参数。

输出：`src-tauri/target/release/bundle/dmg/` — DMG 安装镜像。CI 中按架构重命名为 `PicCraft_0.3.0_arm64.dmg` / `PicCraft_0.3.0_x64.dmg`，保存为 Artifact（`piccarft-dmg-arm64` / `piccarft-dmg-x64`）。

### 一键发布（需要 `gh` CLI）

```bash
node scripts/release.mjs
```

自动打 tag → 编译 → 创建 GitHub Release → 上传 exe / MSI / NSIS。

### macOS Pre-release（手动流程）

macOS 不走 `release.mjs`（该脚本只负责 Windows 的 exe / MSI / NSIS 与正式 Release）。v0.3.0 macOS 为未签名分发，采用手动 Pre-release：

1. 朋友在真机按 [macOS 真机验收记录](docs/guide/macos-device-verification.md) 清单确认通过；未覆盖架构标注「仅自动化验证」
2. 从 CI Artifact 下载两个 DMG：`piccarft-dmg-arm64` / `piccarft-dmg-x64`
3. 手动创建 GitHub **Pre-release** `v0.3.0`，关联两个 DMG，发布说明写明：未签名 / 未公证、首次打开需 Finder 右键「打开」（见 [macOS Gatekeeper 使用指南](docs/guide/macos-gatekeeper.md)）、架构覆盖情况
4. 不自动发布：CI 不创建 Release、不打 tag、不上传产物

### 质量门禁（CI）

推送 / PR 时 [.github/workflows/ci.yml](.github/workflows/ci.yml) 自动在 Windows 上运行全部门禁：
`pnpm lint` → `pnpm test` → `pnpm build` → `cargo test --locked` → 文档链接与索引校验。
CI 只做质量门禁：不创建 Release、不推送 tag、不上传产物、不读取 secrets。
版本锁定来源：`.nvmrc`（Node 24.14.0）、`package.json` 的 `packageManager`（pnpm 11.18.0）、`rust-toolchain.toml`（Rust 1.97.1）。

本地等效验证：

```bash
pnpm lint && pnpm test && pnpm build
cd src-tauri && cargo test --locked
python tools/project_docs.py validate
python tools/project_docs.py index check
```

### 仅前端开发（不启动 Rust 后端）

```bash
pnpm dev
```

---

## 项目结构

```
PicCraft/
├── src/                        # React 前端（TypeScript）
│   ├── main.tsx                # 入口
│   ├── App.tsx                 # 主应用（4 视图切换器 + 启动路由 + 文件关联检查）
│   ├── index.css               # Tailwind + shadcn 主题变量
│   ├── lib/utils.ts            # cn() 工具函数
│   ├── hooks/use-theme.ts      # 明暗主题切换
│   ├── store/index.ts          # Zustand 全局状态（view/folder/queue/settings/browseTargetFile）
│   ├── views/
│   │   ├── BrowseView.tsx      # 浏览视图（侧边栏 + 缩略图网格 + 状态栏 + 全屏入口）
│   │   └── SettingsView.tsx    # 设置视图（3 子 Tab）
│   └── components/
│       ├── Header.tsx          # Logo + 标题 + 主题切换
│       ├── Sidebar.tsx         # 侧边栏容器（可收起、可拖拽宽度）
│       ├── DirTree.tsx         # 目录树组件（懒加载、自动定位）
│       ├── FullscreenViewer.tsx# 全屏看图（Konva + 底部工具栏 + 旋转 + 循环翻页）
│       ├── ThumbnailGrid.tsx   # 缩略图网格（懒加载 + 多选 + 框选 + 右键菜单）
│       ├── StatusBar.tsx       # 底部状态栏
│       ├── QueuePanel.tsx      # 队列面板（仅批量视图）
│       ├── CropCanvas.tsx      # Konva 画布 + 8 手柄裁剪（React.memo + RAF 节流）
│       ├── SingleTab.tsx       # 单图编辑
│       ├── BatchTab.tsx        # 批量处理（左参右队布局）
│       └── ui/                 # shadcn/ui 组件
├── src-tauri/                  # Rust 后端
│   ├── Cargo.toml              # Rust 依赖
│   ├── tauri.conf.json         # Tauri 窗口/构建/安全配置
│   ├── tauri.macos.conf.json   # macOS 平台配置（identifier/DMG/文件关联，构建时自动合并）
│   ├── capabilities/           # Tauri v2 权限配置
│   └── src/
│       ├── main.rs             # Windows 入口
│       ├── lib.rs              # Tauri Builder + 启动参数 + single-instance（15 个命令注册）
│       └── image_ops.rs        # 图片处理 + 文件关联 + 目录树（15 个 tauri::command）
├── public/logo.png             # App Logo
├── scripts/
│   ├── copy-dist.mjs           # Windows 构建辅助脚本
│   └── release.mjs             # 一键发布脚本（编译 + tag + gh release）
├── AGENTS.md                   # AI 开发助手指南
├── CONTEXT.md                  # 领域术语表
└── docs/
    ├── index.md                # 文档库总入口（仅做导航）
    ├── adr/                    # 架构决策记录
    ├── prd/                    # 产品需求
    ├── plan/                   # 实施计划与工作单
    ├── bug/                    # Bug 记录
    ├── project/                # 项目架构与数据流
    ├── technology/             # 技术栈与框架规则
    ├── knowledge/              # 本地第三方知识
    ├── database/               # 数据与持久化文档
    ├── design/                 # UI 与交互设计
    ├── test/                   # 测试文档
    ├── audit/                  # 审计报告
    ├── log/                    # 日志与 Agent 执行数据
    └── guide/                  # 开发、配置与发布指南
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Tauri v2（asset protocol + single-instance 插件） |
| 前端框架 | React 19 + TypeScript |
| UI 样式 | Tailwind CSS + shadcn/ui |
| 画布交互 | Konva.js (react-konva)，分离渲染层 |
| 状态管理 | Zustand（4 视图共享 + tauri-plugin-store 持久化） |
| 图片处理 | Rust `image` crate (Lanczos3) + `jpeg-decoder`（快速缩放解码）|
| 缩略图缓存 | 磁盘缓存到 `%TEMP%/piccraft_thumbs/` |
| 文件关联 | Rust `winreg` crate（Windows 注册表） |

---

## 快捷键

### 全局
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 覆盖原图 |
| `Ctrl+Shift+S` | 另存为 |
| `ESC` | 取消裁剪框 / 退出全屏 |

### 浏览视图
| 快捷键 | 功能 |
|--------|------|
| `Ctrl+滚轮` / `Ctrl+加号/减号` | 缩略图大小调节 |
| `Ctrl+A` | 全选 |
| `Ctrl+点` | 多选 |
| `Shift+点` | 范围选 |
| 双击缩略图 | 进入全屏看图 |
| 右键缩略图 | 加入队列 / 在单图编辑中打开 |

### 全屏看图
| 快捷键 | 功能 |
|--------|------|
| `← / →` | 上一张 / 下一张（循环） |
| `Space` | 下一张 |
| `+ / -` | 放大 / 缩小 |
| `0` | 实际大小 |
| `F` | 适应窗口 |
| `R` | 顺时针旋转 90° |
| `E` | 进入单图编辑 |
| `Esc` | 退出全屏 |

---

## 协议

MIT License · [github.com/hotrichard1982/PicCraft](https://github.com/hotrichard1982/PicCraft)
