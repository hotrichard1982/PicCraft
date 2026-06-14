# 图轻剪 PicCraft 🖼️

模块化桌面图片处理工具 — 浏览、挑选、单张/批量编辑一体化工作流。

**v0.1.0 (2026.06)** · Rust + Tauri v2 · React 19 · TypeScript · Tailwind CSS · Konva.js · 明暗双主题

**重庆三人众科技有限公司** | QQ: 7602069 | 邮箱: 7602069@qq.com | [官网](https://www.cq30.com/)

---

## 功能

### 浏览视图
- **缩略图网格**：CSS Grid 自适应布局，默认 300px 缩略图
- **缩略图懒加载**：IntersectionObserver + Rust 端 `make_thumbnail`（Triangle 滤镜），200px 预加载余量
- **多选交互**：Ctrl+点 / Shift+范围选 / 鼠标框选（rubber band）
- **缩略图大小调节**：`Ctrl+滚轮` / `Ctrl+加号/减号`，步长 10%，范围 100-800px
- **全屏看图**：Konva 画布渲染，←→/Space 翻页，`+ - 0 F` 缩放，`E` 直接进入编辑

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
- 输出目录持久化（localStorage）

### 设置视图
- 3 子 Tab：设置 / 帮助 / 关于
- **设置**：图片格式关联勾选管理（UI 已就绪，注册表写入可用）
- **帮助**：软件使用教程（折叠面板）
- **关于**：版本号、技术栈、开源协议、公司信息

### 启动路由
- 冷启动 → 浏览视图（加载上次目录）
- 双击 .jpg → 浏览视图（全屏看图模式，定位该图）
- 右键"用图轻剪编辑" → 单图编辑视图

---

## 快速开始

### 前置条件
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) 1.77+

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

输出：
- `src-tauri/target/release/piccarft.exe` — 主程序
- `src-tauri/target/release/bundle/msi/` — MSI 安装包
- `src-tauri/target/release/bundle/nsis/` — NSIS 安装包

### 仅前端开发（不启动 Rust 后端）

```bash
npm run dev
```

---

## 项目结构

```
PicCraft/
├── src/                        # React 前端（TypeScript）
│   ├── main.tsx                # 入口
│   ├── App.tsx                 # 主应用（4 视图切换器 + 启动路由）
│   ├── index.css               # Tailwind + shadcn 主题变量
│   ├── lib/utils.ts            # cn() 工具函数
│   ├── hooks/use-theme.ts      # 明暗主题切换
│   ├── store/index.ts          # Zustand 全局状态（view/folder/queue/settings）
│   ├── views/
│   │   ├── BrowseView.tsx      # 浏览视图（缩略图网格 + 状态栏 + 全屏入口）
│   │   └── SettingsView.tsx    # 设置视图（3 子 Tab）
│   └── components/
│       ├── Header.tsx          # Logo + 标题 + 主题切换
│       ├── FullscreenViewer.tsx# 全屏看图（Konva + 工具条 + 快捷键）
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
│   ├── capabilities/           # Tauri v2 权限配置
│   └── src/
│       ├── main.rs             # Windows 入口
│       ├── lib.rs              # Tauri Builder + 启动参数 + single-instance
│       └── image_ops.rs        # 图片处理命令（12 个 tauri::command）
├── public/logo.png             # App Logo
├── scripts/copy-dist.mjs       # Windows 构建辅助脚本
├── AGENTS.md                   # AI 开发助手指南
├── CONTEXT.md                  # 领域术语表
└── docs/
    ├── plans/                  # 实施计划
    └── adr/                    # 架构决策记录
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
| 图片处理 | Rust `image` crate (Lanczos3) + `imagequant` (PNG 调色板量化) |
| 异步批处理 | tokio |
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
| `← / →` | 上一张 / 下一张 |
| `Space` | 下一张 |
| `+ / -` | 放大 / 缩小 |
| `0` | 实际大小 |
| `F` | 适应窗口 |
| `E` | 进入单图编辑 |
| `Esc` | 退出全屏 |

---

## 协议

MIT License · [github.com/hotrichard1982/PicCraft](https://github.com/hotrichard1982/PicCraft)
