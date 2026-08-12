# 测试索引

| 文档 | 什么时候读取 | 内容 |
|---|---|---|
| [测试补充工作单](../plan/WORK-001-04-test-coverage.md) | 了解现有测试范围、测试文件与验证命令时 | 前端 Vitest 与 Rust 单元测试的实施范围和验证命令 |
| [裁剪遮罩同步验收](../plan/ACCEPTANCE-WORK-002-01.md) | 修改单图裁剪预览或 Konva 遮罩时 | 遮罩坐标回归测试、界面验收与构建证据 |
| [Rust 测试安全](../plan/WORK-003-03-rust-test-safety.md) | 修改 Rust 图片处理或批量命令校验时 | 临时目录隔离、敏感路径校验、批量重名/同目录覆盖测试（53 个 Rust 测试） |
| [批量确认前端测试](../plan/WORK-003-04-batch-confirm-frontend-tests.md) | 修改批量视图交互或 reducer 时 | 同目录覆盖二次确认、batchRunReducer/transformReducer/viewReducer 测试（80 个前端测试） |
| [CI 质量门禁](../plan/WORK-003-05-reproducible-build-ci.md) | 修改 CI 或门禁命令时 | GitHub Actions Windows 全量门禁：lint / test / build / cargo test / 文档校验 |
| [macOS 真机验收记录](../guide/macos-device-verification.md) | macOS 发布前真机验收或回填真机结果时 | 真机验收清单（Finder 打开/多文件/冷启动、Cmd 快捷键、设置页只读、安全路径、核心功能）与架构「仅自动化验证」标注 |
