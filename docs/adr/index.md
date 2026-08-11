# ADR 索引

每条 ADR 描述一个**难以逆转**、**没有上下文会让人困惑**、**有真实 trade-off** 的决策。

## 如何新增 ADR

1. 编号顺延，文件命名 `NNNN-kebab-case-title.md`
2. 必填字段：状态、背景、决策、备选方案、后果
3. **不要**用 ADR 记录实现细节或短期决定（写代码注释即可）
4. **不要**为了"显得专业"而建 ADR —— 3 条件缺一不可

## 索引

| ID | 文档 | 状态 | 摘要 |
|---|---|---|---|
| 0001 | [启动参数路由](0001-launch-routing.md) | 已接受 | 双击图片进浏览视图 vs 右键"用图轻剪编辑"进单图编辑视图，两种 OS 触发源路由不同 |
| 0002 | [队列仅在批量视图](0002-queue-only-in-batch.md) | 已接受 | 队列面板仅在批量编辑视图出现，浏览视图只负责挑图 |
| 0003 | [Rust 端生成缩略图](0003-rust-thumbnail.md) | 已接受 | 缩略图由 Rust 端生成（含 JPEG 快速解码 + 磁盘缓存），前端只渲染 base64 |
| 0004 | [批量输出目录等于输入目录](0004-batch-output-same-dir.md) | 已接受 | 批量处理输出目录等于输入目录时允许，前端必须明确不可恢复风险并二次确认 |
| 0005 | [macOS 平台适配与分发](0005-macos-distribution.md) | 已接受 | 不签名不公证，arm64/x64 两个未签名 DMG，CI Artifact，朋友真机确认后 Pre-release，Gatekeeper 只提供右键打开 |
| 0006 | [应用标识平台化](0006-bundle-identifier-platform.md) | 已接受 | Windows 保持 com.piccarft.app，macOS 用 com.cq30.piccarft，平台条件配置注入 |
