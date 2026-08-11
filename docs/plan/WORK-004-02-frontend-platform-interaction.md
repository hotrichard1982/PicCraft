# WORK-004-02: 前端平台交互

## PLAN 来源

[PLAN-004-macos-support.md](PLAN-004-macos-support.md)

## 目标

前端完成 macOS 交互适配（依赖 WORK-004-01 的事件转发接口）：

- 快捷键：保存快捷键支持 `metaKey`（Cmd），`Cmd+S` 覆盖保存、`Cmd+Shift+S` 另存为、`Cmd+A` 全选；`Cmd + 滚轮` 调整缩略图（`src/components/SingleTab.tsx`、缩略图相关组件）
- 文案：macOS 平台「在资源管理器中显示」→「在 Finder 中显示」（`QueuePanel.tsx` 等）；目录树根节点使用平台中性名称「文件系统」（`DirTree.tsx`）
- Finder 打开路由：接收 WORK-004-01 转发的事件，单文件进入浏览视图并全屏定位该图；多文件按第一张图片目录浏览，不自动加入队列
- macOS 设置页：只读展示支持格式（JPG/JPEG、PNG、WebP、BMP）+ Finder 默认应用设置教程；移除/隐藏 Windows 文件关联勾选，**不提供假的动态关联勾选**（`SettingsView.tsx`）
- 平台检测：Tauri API 或构建期常量判断平台，不引入新依赖

## 约束

- Windows 行为与文案保持不变（按平台分支）
- 组件级测试成本高时优先抽纯函数（参照 `src/lib/batch-dir.ts` 模式）
- 遵循 TDD

## 验收

- 前端测试全绿（新增快捷键/路由/设置页测试）；`pnpm lint` 零错误；`pnpm build` 成功
- Windows 回归：`pnpm test` 既有 81 个测试不受影响
- 回执记录 RED/GREEN 证据

## 交付

- 生产代码 + 测试 + `docs/plan/RECEIPT-WORK-004-02.md`
- 不提交、不推送、不关闭 PLAN；其余文件不得改动
