# WORK-003-01: 环境依赖

## PLAN 来源

[PLAN-003-stable-release-baseline.md](PLAN-003-stable-release-baseline.md)

## 目标

锁定开发与构建环境依赖，保证可复现构建：

- Node 版本锁定（`.nvmrc`），pnpm 声明 `packageManager` 字段
- Rust 工具链锁定（`rust-toolchain.toml`）
- `pnpm-lock.yaml`、`Cargo.lock` 存在且已提交

## 依赖

无

## 允许修改

- `.nvmrc`（新增，Node 版本与 CI 一致）
- `package.json`（仅新增 `engines` / `packageManager` 字段，不动依赖版本）
- `rust-toolchain.toml`（新增，channel 与 CI 一致）
- `README.md`（仅"开发环境"章节：Node/pnpm/Rust 版本要求与安装指引）
- `.gitignore`（如需排除本地工具链残留）

## 禁止修改

- 任何 `src/`、`src-tauri/src/` 业务代码
- `package.json` 中 dependencies / devDependencies 版本
- `src-tauri/Cargo.toml` 依赖
- `pnpm-lock.yaml` / `Cargo.lock` 内容（仅确认提交状态）

## 必须复用

- 项目现有 pnpm 工作流（README 已统一 `pnpm` 命令）
- 现有 `src-tauri/Cargo.toml` 的 edition 与依赖声明方式

## TDD 步骤

本工单为环境配置类，无业务逻辑可单测，以**命令断言**为红绿：

1. 先执行验收命令记录基线（当前 node/pnpm/cargo 版本）
2. 新增 `.nvmrc`、`rust-toolchain.toml`、`engines` / `packageManager` 字段
3. 重新执行验收命令，确认实际版本与声明一致（绿）

## 验证命令

```bash
node --version
pnpm --version
rustc --version
pnpm install --frozen-lockfile
cd src-tauri && cargo build
```

## 通过标准

- [ ] `.nvmrc`、`rust-toolchain.toml` 存在，内容与 CI 配置一致
- [ ] `package.json` 有 `engines.node` 与 `packageManager`（pnpm）
- [ ] `pnpm install --frozen-lockfile` 成功（lockfile 与依赖一致）
- [ ] `cargo build` 成功
- [ ] `pnpm-lock.yaml`、`Cargo.lock` 已提交且无未提交变更

## 停止条件

- 声明版本与本地可用工具链无法匹配（如网络/代理环境无对应 Node 版本）→ 停止，汇报选择替代版本

## 下一步

执行完成后运行 verify 模式验证本工单，然后继续 WORK-003-02。
