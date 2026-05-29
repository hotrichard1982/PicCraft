# PicCraft Tauri 重构设计文档

> 日期：2026-05-19 | 原项目：E:\code\pillow_gui | 目标：E:\code\piccarft

---

## 一、重构目标

将原 Python + PySide6 的「图轻剪 PicCraft」图片处理工具，使用 Rust + Tauri 技术栈全面重构。目标：

- 性能：Rust 原生图片处理，启动快、内存低
- 界面：现代设计 + 明暗双主题
- 体积：6-8MB（原 PyInstaller 打包 ~70MB）
- 跨平台：Windows + macOS + Linux

---

## 二、技术栈

| 层 | 技术 |
|----|------|
| 桌面壳 | Tauri v2 |
| 前端框架 | React 19 + TypeScript |
| 样式 | Tailwind CSS + shadcn/ui |
| Canvas | Konva.js (react-konva) |
| 后端 | Rust + `image` crate + `imagequant` + tokio |
| 测试 | Vitest (前端) + cargo test (Rust) |

---

## 三、架构

```
┌─────────────────────────────────────────────────────┐
│                    Tauri Shell                        │
│  ┌───────────────────────────────────────────────┐  │
│  │           React 前端 (WebView)                  │  │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────────┐  │  │
│  │  │  单张Tab │ │  批量Tab  │ │   关于Tab      │  │  │
│  │  │ Konva   │ │  表单+    │ │   静态信息     │  │  │
│  │  │ Canvas  │ │  进度条   │ │               │  │  │
│  │  └────┬────┘ └────┬─────┘ └───────────────┘  │  │
│  │       └─────┬─────┘                            │  │
│  │            │ invoke()                           │  │
│  └────────────┼──────────────────────────────────┘  │
│               │  IPC                                 │
│  ┌────────────┼──────────────────────────────────┐  │
│  │         Rust 后端                               │  │
│  │  ┌────────┴──────┐  ┌────────────────────┐    │  │
│  │  │  image ops    │  │  batch processor    │    │  │
│  │  │  裁剪/缩放/   │  │  tokio async       │    │  │
│  │  │  格式转换/保存 │  │  进度 emit         │    │  │
│  │  └───────────────┘  └────────────────────┘    │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 四、前端设计

### 4.1 页面布局

```
┌──────────────────────────────────────────────────────┐
│  Logo  图轻剪 PicCraft      版本  ☀/🌙  官网  GitHub │  ← Header
├──────────────────────────────────────────────────────┤
│  [ 单张处理 ]  [ 批量处理 ]  [ 关于 ]                  │
├──────────────────────────────────────────────────────┤
│                                            ┌──────┐  │
│             Konva Canvas                   │ 控制  │  │
│             (图片预览+裁剪)                 │ 面板  │  │
│                                            │      │  │
│                                            └──────┘  │
└──────────────────────────────────────────────────────┘
```

- Header：Logo + 标题（左），版本号 + 主题切换 + 官网 + GitHub（右）
- 关于 Tab：公司信息、联系方式、技术栈版本

### 4.2 单张处理 Tab

**左侧：Konva Canvas**
- 图片加载与显示，自适应缩放适配窗口
- 裁剪交互：点击创建选区、8 手柄拖拽、拖动选区移动、ESC 清除
- 拖放图片加载（Tauri 原生拖放事件）

**右侧：控制面板（可折叠）**
- 缩放区：宽度/高度输入 + 等比锁定 + 压缩质量
- 裁剪区：X/Y/W/H 数值输入 + 应用数值/清除按钮
- 操作区：应用缩放/应用裁剪/重置/覆盖原图/另存为
- 快捷键提示：Ctrl+S 覆盖 / Ctrl+Shift+S 另存为

### 4.3 批量处理 Tab

- 文件夹选择（输入目录 + 输出目录）
- 参数设置：目标宽度 + 压缩质量
- 开始处理按钮 + 实时进度条
- 完成弹窗含错误明细

### 4.4 主题系统

- CSS 变量明暗双主题，localStorage 持久化
- 默认暗色主题，一键切换
- 配色参考原项目调色板 + 现代化调整

---

## 五、Tauri 命令

| 命令 | 参数 | 返回 |
|------|------|------|
| `get_image_info` | `path: String` | `{ width, height, format, file_size }` |
| `resize_image` | `path, width, height, keep_aspect, quality` | `{ temp_path, width, height }` |
| `crop_image` | `path, x, y, width, height` | `{ temp_path, width, height }` |
| `save_image` | `temp_path, save_path, format, quality` | `{ path, file_size }` |
| `batch_process` | `input_dir, output_dir, target_width, quality` | 进度事件 emit |

### 数据流

```
选择图片 → Rust load_image → 前端 JS Image 显示
用户缩放/裁剪 → Rust 处理 → 临时文件 → 前端载入显示
用户保存 → Rust 写入目标路径 → 完成
```

---

## 六、MVP 迭代计划

### 第 0 阶段：项目脚手架 + 主题系统
- Tauri v2 项目初始化
- React + Tailwind + shadcn/ui 搭建
- Header + Tab 导航 + 明暗主题
- 关于 Tab 静态页面

### 第 1 阶段：单张处理 — 加载 + 缩放
- Rust 图片加载/缩放/保存命令
- Konva 画布显示 + 缩放控制面板
- 快捷键

### 第 2 阶段：单张处理 — 裁剪
- Konva Transformer 裁剪交互
- 数值裁剪 + 拖放加载
- Rust 裁剪命令

### 第 3 阶段：批量处理
- 批量 Tab UI
- tokio 异步处理 + 进度事件
- 错误日志

---

## 七、与原项目对照

| 原项目文件 | 新项目映射 |
|-----------|-----------|
| `main.py` (QMainWindow + QSS) | `src/App.tsx` + Tailwind themes |
| `canvas.py` (QGraphicsView) | `src/components/CropCanvas.tsx` (Konva) |
| `tabs/single_tab.py` | `src/components/SingleTab.tsx` |
| `tabs/batch_tab.py` | `src/components/BatchTab.tsx` |
| `tabs/about_tab.py` | `src/components/AboutTab.tsx` |
| `utils/image_ops.py` | `src-tauri/src/image_ops.rs` |
| `test_image_tool.py` (27 tests) | `src-tauri/tests/` + `src/__tests__/` |
