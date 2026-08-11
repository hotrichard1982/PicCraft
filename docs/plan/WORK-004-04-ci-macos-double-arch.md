# WORK-004-04: CI macOS 双架构构建

## PLAN 来源

[PLAN-004-macos-support.md](PLAN-004-macos-support.md)

## 目标

GitHub Actions 增加 macOS job，产出 arm64 与 x64 两个未签名 DMG 并保存为 CI Artifact：

- macOS job（官方 runner）：Apple Silicon 与 Intel 各一个 job（或单个 job 双目标构建），Tauri 按架构产出 DMG
- 门禁复用：与 Windows job 相同的质量门禁在 macOS 上运行（lint / 前端测试 / 构建 / Rust 测试 / 文档校验）
- 产物：arm64、x64 两个未签名 DMG → `actions/upload-artifact`
- 不签名、不公证、不创建 Release、不打 tag、无 secrets
- DMG 内验证（CI 步骤）：`Info.plist` 的 `CFBundleIdentifier` = `com.cq30.piccarft`，`CFBundleDocumentTypes` 含声明格式（配合 WORK-004-03）

## 约束

- 不修改 Windows job 既有步骤；新增 macOS job 与现有 workflow 并存
- 遵循可复现构建（锁定版本、frozen lockfile、rust-toolchain.toml）
- 若双架构分别构建成本过高，可单 job 双 target；产物必须两个架构齐全

## 验收

- macOS job 全绿，两个 DMG Artifact 可见可下载
- DMG 内 `Info.plist` 断言通过（identifier + 文件关联）
- Windows job 不受影响（回归全绿）
- 回执记录 Artifact 名称、大小、CI Run 链接

## 交付

- workflow 改动 + `docs/plan/RECEIPT-WORK-004-04.md`
- 不提交、不推送、不关闭 PLAN；其余文件不得改动
