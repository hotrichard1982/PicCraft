# WORK-003-05: 可复现构建 CI

## PLAN 来源

[PLAN-003-stable-release-baseline.md](PLAN-003-stable-release-baseline.md)

## 目标

- 新增 GitHub Actions 工作流：push 与 PR 触发，跑完整质量门禁
- 使用与 WORK-003-01 一致的锁定版本（Node / pnpm / Rust toolchain）与 frozen lockfile，保证可复现构建
- CI 不发布产物、不打 tag、不触发 release（发布仍走 `node scripts/release.mjs` 手动流程）

## 依赖

- WORK-003-01（环境锁定：`.nvmrc`、`rust-toolchain.toml`、`packageManager`）
- WORK-003-02（前端质量门禁清零）
- WORK-003-03（Rust 测试全绿）

## 允许修改

- `.github/workflows/ci.yml`（新增）
- `.nvmrc` / `rust-toolchain.toml`（如与 CI 版本不一致，仅版本号对齐）
- `README.md`（CI 徽章与状态说明，可选）

## 禁止修改

- 任何业务代码（`src/`、`src-tauri/src/`）
- CI 中不得执行发布步骤（无 `gh release`、无 tag push、无产物上传）
- 不引入第三方 CI 服务/平台
- 不修改 `scripts/release.mjs`

## 必须复用

- 项目现有命令：`pnpm lint`、`pnpm test`、`pnpm build`、`cargo test`
- WORK-003-01 的环境版本声明

## TDD 步骤

CI 属配置类，红绿定义为本地位等命令链 vs CI 结果：

1. 本地先跑等价命令链确认全绿（基线）
2. 编写 `ci.yml`：checkout → setup-node（读 `.nvmrc`）→ `pnpm install --frozen-lockfile` → `pnpm lint` / `pnpm test` / `pnpm build` → setup rust-toolchain → `cargo test`
3. push 到临时分支触发 CI，首次运行红则按日志修复配置（不修业务代码）
4. CI 全绿

## 验证命令

```bash
pnpm lint && pnpm test && pnpm build
cd src-tauri && cargo test
```

（CI 页面 workflow 全绿为最终验收）

## 通过标准

- [ ] push/PR 触发 CI，lint / test / build / cargo test 全部通过
- [ ] CI 使用 `.nvmrc` 与 `rust-toolchain.toml` 锁定版本
- [ ] `pnpm install --frozen-lockfile` 在 CI 成功（可复现）
- [ ] CI 无任何发布/上传/打 tag 步骤
- [ ] 本地命令链与 CI 结果一致

## 停止条件

- 私有仓库无 GitHub Actions 可用或平台策略受限 → 停止，汇报替代方案
- CI 环境无法复现本地构建（缓存/网络问题）→ 停止，汇报

## 下一步

执行完成后运行 verify 模式验证本工单，然后继续 WORK-003-06。
