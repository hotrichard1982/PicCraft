# 图轻剪 PicCraft 🖼️

模块化桌面图片处理工具 — 批量/单张图片压缩、缩放、裁剪。

**Rust + Tauri v2 · React 19 · TypeScript · Tailwind CSS · Konva.js · 明暗双主题**

**重庆三人众科技有限公司** | QQ: 7602069 | 邮箱: 7602069@qq.com | [官网](https://www.cq30.com/)

---

## 功能

### 单张处理
- **缩放**：按目标尺寸等比或自由缩放，支持保持原图比例（Lanczos3 算法）
- **裁剪**：鼠标拖拽选区 + 8 个可拖动手柄 + 数值输入，ESC 取消，RAF 节流优化
- **拖拽加载**：直接从文件管理器拖拽图片到预览区，支持悬停视觉反馈
- **实时预览**：Konva Canvas 渲染，半透明裁剪遮罩，图片加载失败有错误日志
- **另存为**（Ctrl+Shift+S）/ **覆盖原图**（Ctrl+S），支持 JPG/PNG（调色板量化）/WebP/BMP

### 批量处理
- 按目标宽度等比缩放文件夹内所有图片
- 异步处理（tokio），进度实时显示
- JPEG 压缩质量可调

### 关于我们
- 版本号、技术栈依赖、开源协议、公司信息（官网链接可点击跳转）

---

## 快速开始

### 前置条件
- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) 1.77+

### 开发（热更新）

```bash
npm install
npm run tauri dev
```

前端修改自动热更新，Rust 修改自动重新编译。

### 构建发布版

```bash
npm run tauri build
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
│   ├── App.tsx                 # 主应用（Header + Tabs）
│   ├── index.css               # Tailwind + shadcn 主题变量
│   ├── lib/utils.ts            # cn() 工具函数
│   ├── hooks/use-theme.ts      # 明暗主题切换
│   └── components/
│       ├── Header.tsx          # Logo + 标题 + 主题切换
│       ├── CropCanvas.tsx      # Konva 画布 + 8 手柄裁剪（React.memo + RAF 节流）
│       ├── SingleTab.tsx       # 单张处理
│       ├── BatchTab.tsx        # 批量处理
│       ├── AboutTab.tsx        # 关于我们
│       └── ui/                 # shadcn/ui 组件
├── src-tauri/                  # Rust 后端
│   ├── Cargo.toml              # Rust 依赖
│   ├── tauri.conf.json         # Tauri 窗口/构建/安全配置
│   ├── capabilities/           # Tauri v2 权限配置
│   └── src/
│       ├── main.rs             # Windows 入口
│       ├── lib.rs              # Tauri Builder + 插件注册
│       └── image_ops.rs        # 图片处理命令
├── public/logo.png             # App Logo
├── AGENTS.md                   # AI 开发助手指南
└── docs/plans/                 # 设计文档
```

---

## 技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Tauri v2（asset protocol + webview 拖拽 API） |
| 前端框架 | React 19 + TypeScript |
| UI 样式 | Tailwind CSS + shadcn/ui |
| 画布交互 | Konva.js (react-konva)，分离渲染层 |
| 图片处理 | Rust `image` crate (Lanczos3) + `imagequant` (PNG 调色板量化) |
| 异步批处理 | tokio |

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 覆盖原图 |
| `Ctrl+Shift+S` | 另存为 |
| `ESC` | 取消裁剪框 |

---

## 协议

MIT License · [github.com/hotrichard1982/PicCraft](https://github.com/hotrichard1982/PicCraft)
