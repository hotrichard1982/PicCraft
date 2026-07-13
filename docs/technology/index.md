# 技术栈与框架索引

## 框架优先规则
- 已有能力必须优先使用。
- 新增、替换或绕过框架需要 ADR。

| 名称 | 版本 | 用途 | 本地知识 | 项目封装位置 |
|---|---|---|---|---|
| Tauri | 2.11.2 | 桌面应用框架（Rust 后端 + WebView 前端） | — | `src-tauri/` |
| React | 19.2.6 | 前端 UI 框架 | — | `src/` |
| TypeScript | ~6.0.2 | 前端类型系统 | — | `tsconfig*.json` |
| Rust | 2021 edition | 后端语言 | — | `src-tauri/Cargo.toml` |
| Zustand | 5.0.14 | 前端状态管理 | — | `src/store/index.ts` |
| Konva | 10.3.0 | Canvas 绘图库（裁剪/全屏看图） | — | `src/components/CropCanvas.tsx`, `src/components/FullscreenViewer.tsx` |
| react-konva | 19.2.4 | Konva 的 React 绑定 | — | 同上 |
| Tailwind CSS | 3.4.19 | 原子化 CSS 框架 | — | `tailwind.config.js` |
| shadcn/ui | — | UI 组件库（Radix UI 基础） | — | `src/components/ui/` |
| image (Rust) | 0.25 | 图像解码/编码/缩放 | — | `src-tauri/src/image_ops.rs` |
| imagequant (Rust) | 4 | PNG 调色板量化压缩 | — | `src-tauri/src/image_ops.rs` |
| jpeg-decoder (Rust) | 0.3 | JPEG 快速解码（缩略图优化） | — | `src-tauri/src/image_ops.rs` |
| lucide-react | 1.16.0 | 图标库 | — | 全局使用 |
| Vite | 8.0.12 | 前端构建工具 | — | `vite.config.ts` |
| ESLint | 10.3.0 | 代码检查 | — | `eslint.config.js` |
