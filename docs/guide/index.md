# 操作指南索引

| 文档 | 什么时候读取 | 内容 |
|---|---|---|
| [README](../../README.md) | 初次开发、构建或发布时 | 环境要求、开发命令、构建产物与发布流程 |
| [CI 质量门禁工作流](../../.github/workflows/ci.yml) | 修改 CI 门禁或触发条件时 | Windows 全量质量门禁步骤与版本锁定来源（.nvmrc / packageManager / rust-toolchain.toml） |
| [文档工具与校验](../../tools/project_docs.py) | 运行 validate / index check / status 或补文档工具测试时 | 文档工具命令行为与 `tools/test_project_docs.py` 自动测试 |
| [macOS Gatekeeper 使用指南](macos-gatekeeper.md) | 在 macOS 首次打开未签名应用，或向用户说明打开方式时 | 未签名/未公证分发说明、Finder 右键「打开」步骤、Finder 默认应用设置、常见问题 |
| [macOS 真机验收记录](macos-device-verification.md) | macOS 发布前真机验收或回填真机结果时 | 验收环境记录与验收清单（Finder 打开/多文件/冷启动、Cmd 快捷键、设置页、安全路径、核心功能）及「仅自动化验证」标注 |
