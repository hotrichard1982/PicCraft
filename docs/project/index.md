# 项目整体设计索引

| 文档 | 什么时候读取 | 内容 |
|---|---|---|
| [CONTEXT.md](../../CONTEXT.md) | 理解领域术语、视图定义、启动路由、交互规范 | PicCraft 领域术语表，含 4 视图定义、队列模型、启动路由、全屏看图细节、经验教训 |
| [技术栈索引](../technology/index.md) | 确认框架版本和依赖 | 技术栈清单与版本号 |
| [ADR 索引](../adr/index.md) | 理解架构决策背景 | 3 条已确认的架构决策 |

## 架构概览

```
piccarft/
├── src/                    # 前端（React + TypeScript）
│   ├── App.tsx             # 应用入口，启动路由 + 单实例监听
│   ├── store/index.ts      # Zustand 全局状态（视图/目录/队列/选中/设置）
│   ├── views/              # 4 个顶级视图
│   │   ├── BrowseView.tsx  # 浏览视图（缩略图网格 + 全屏看图 + 侧边栏）
│   │   └── SettingsView.tsx# 设置视图（设置/帮助/关于 3 子 Tab）
│   └── components/         # 组件
│       ├── ThumbnailGrid.tsx   # 缩略图网格（懒加载 + 多选 + 框选）
│       ├── FullscreenViewer.tsx# 全屏看图（Konva 画布 + 缩放/旋转/翻页）
│       ├── CropCanvas.tsx      # 裁剪画布（Konva + Transformer）
│       ├── SingleTab.tsx       # 单图编辑面板（缩放/裁剪/翻转/旋转/保存）
│       ├── BatchTab.tsx        # 批量编辑面板
│       ├── QueuePanel.tsx      # 队列面板（右键菜单 + 状态图标）
│       ├── DirTree.tsx         # 目录树（懒加载子节点）
│       ├── Sidebar.tsx         # 侧边栏容器（可收起 + 可拖拽宽度）
│       ├── Header.tsx          # 顶部标题栏
│       └── StatusBar.tsx       # 底部状态栏
├── src-tauri/              # 后端（Rust）
│   └── src/
│       ├── main.rs         # 入口（仅调用 app_lib::run()）
│       ├── lib.rs          # Tauri 应用配置 + 启动参数解析 + 单实例转发
│       └── image_ops.rs    # 图片操作命令（读目录/缩略图/裁剪/缩放/变换/保存/批量处理）
└── docs/                   # 项目文档
```

## 数据流

1. **启动**：`main.rs` → `lib.rs::run()` → 解析启动参数 → 注入 Tauri State → 前端 `App.tsx` hydrate + 读启动参数 → 路由到对应视图
2. **浏览**：用户选目录 → Rust `read_dir` 扫描 → 前端渲染缩略图网格 → `IntersectionObserver` 懒加载 → Rust `make_thumbnail` 生成缩略图
3. **单图编辑**：用户选图 → Rust `get_image_info` → 前端 Konva 渲染 → 裁剪/缩放/变换 → Rust 生成临时文件 → 保存覆盖/另存为
4. **批量处理**：浏览视图右键加入队列 → BatchTab 调 `batch_process_queue` → Rust 逐张处理 + emit 进度事件 → 前端更新队列状态
