---
id: RECEIPT-WORK-003-01
work: WORK-003-01
status: completed
created: 2026-08-11
updated: 2026-08-11
---

# RECEIPT-WORK-003-01

## 初始环境基线（记录于实施前）

| 项 | 基线 | 结果 |
|---|---|---|
| Node | v24.14.0（`/d/Program Files/nodejs`） | 保留 |
| pnpm | 11.18.0（`/c/Users/76020/AppData/Roaming/npm`） | 保留 |
| Rust | 未安装：全盘无 cargo.exe/rustup.exe，PATH/CARGO_HOME/RUSTUP_HOME 无条目 | 已安装 |
| VS Build Tools | 未安装：无 vswhere、无 `Program Files/Microsoft Visual Studio` | 已安装 |
| Windows SDK | 未安装：无 `Windows Kits/10`，注册表无 SDK 根 | 已安装 |

## Changed Files（仓库内）

- `.nvmrc`（新增，`24.14.0`）
- `rust-toolchain.toml`（新增，channel = `1.97.1`，rustup 自动识别并安装精确工具链）
- `package.json`（仅新增 `packageManager: pnpm@11.18.0` 与 `engines.node: >=24.14.0`，依赖未动）
- `.gitignore`（移除 `pnpm-workspace.yaml` 忽略，使其可纳入仓库；该文件含构建必需的 esbuild allowBuilds 配置）
- `README.md`（仅"快速开始 > 前置条件"章节：精确版本要求与 Node/pnpm/Rust/VS Build Tools 安装指引）
- `docs/plan/RECEIPT-WORK-003-01.md`（本回执）

## 环境变更（系统级，用户已授权）

- `winget install Rustlang.Rustup`：rustup 1.29.0，用户 PATH 已含 `C:\Users\76020\.cargo\bin`。
- `rustup default stable` → stable-x86_64-pc-windows-msvc（rustc/cargo 1.97.1）；`rust-toolchain.toml` 触发 rustup 同步精确工具链 1.97.1-x86_64-pc-windows-msvc（6 components，成功）。
- `winget install Microsoft.VisualStudio.2022.BuildTools`（--override `--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended`）：BuildTools 17.14.37；vswhere 确认 VC.Tools.x86.x64 与 Windows11SDK.26100 组件已装。
- 用户级 `C:\Users\76020\.cargo\config.toml`：`[http] check-revoke = false`（本机网络缓解，见风险）。

## 验证命令结果

| 命令 | 结果 |
|---|---|
| `node --version` | v24.14.0，与 `.nvmrc` 一致 |
| `pnpm --version` | 11.18.0，与 `packageManager` 一致 |
| `rustc --version` | 1.97.1 (8bab26f4f 2026-07-14)，与 `rust-toolchain.toml` 一致 |
| `pnpm install --frozen-lockfile` | 成功（删除旧 node_modules 后 16.7s 重装完成；无 junction 错误，无需切换 package-import-method=copy） |
| `cd src-tauri && cargo build` | 成功，`Finished dev profile in 5m 24s`（tauri/tao/webview2-com 原生依赖编译通过，MSVC 链接正常） |
| lockfile 状态 | `pnpm-lock.yaml`、`Cargo.lock` 均已提交且 build/install 后无未提交变更 |
| `python tools/project_docs.py validate` | 通过，`broken_links: []` |

## 通过标准核对

- [x] `.nvmrc`、`rust-toolchain.toml` 存在（CI 未创建，WORK-003-05 将引用本工单版本声明，无冲突）
- [x] `package.json` 有 `engines.node` 与 `packageManager`（pnpm）
- [x] `pnpm install --frozen-lockfile` 成功
- [x] `cargo build` 成功
- [x] `pnpm-lock.yaml`、`Cargo.lock` 已提交且无未提交变更

## 质量门禁基线（PLAN-003 收口基准，红；修复归后续 WORK）

| 命令 | 结果 |
|---|---|
| `pnpm lint` | 失败，退出码 1；11 problems（5 errors + 6 warnings），全部为既有文件：`FullscreenViewer.tsx:218`（set-state-in-effect）、`ThumbnailGrid.tsx:140`（set-state-in-effect）、`ThumbnailGrid.tsx:270:34`×2（refs-in-render）、`BrowseView.tsx:52`（set-state-in-effect）；warnings：react-refresh only-export-components×3、exhaustive-deps×3（SingleTab/StatusBar/FullscreenViewer/ThumbnailGrid/BrowseView） |
| `pnpm test` | 通过，退出码 0；4 个测试文件、34 个测试全部通过（2.40s）。stderr 有非致命 `[store] persist lastFolder failed: TypeError ... invoke`（jsdom 无 Tauri IPC，已被既有 catch 捕获） |
| `pnpm build` | 通过，退出码 0；`tsc -b` + vite build 1.30s，1863 modules；chunk 657.43 kB > 500 kB 警告（非失败） |
| `cd src-tauri && cargo test --locked` | 通过，退出码 0；16 passed（image_ops/lib 单测），main.rs 与 doc-tests 各 0；`--locked` 确认 Cargo.lock 未变更 |
| `pnpm run doctor`（react-doctor@latest） | 失败，退出码 1；**Score 41 / 100 Critical**；50 issues = 3 errors + 47 warnings（Security 2 / Bugs 3e+17w / Performance 5 / Maintainability 13 / Accessibility 10）。3 errors：`effect-needs-cleanup`×2（`src/App.tsx:31`、`src/components/DirTree.tsx:73`）、`no-impure-state-updater`（`src/components/DirTree.tsx:49`）。含 `require-pnpm-hardening`×2 提示（pnpm-workspace.yaml） |
| `pnpm doctor`（pnpm 内置命令，非 react-doctor） | 通过；All checks passed，1 warning（pnpm global bin 不在 PATH，可 `pnpm setup` 修复）。注意：package.json 的 `doctor` 脚本被 pnpm 内置 `doctor` 子命令遮蔽，须用 `pnpm run doctor` 才执行 react-doctor |

## 风险与未决项

- **crates.io 下载受吊销服务器离线影响**：本机 schannel 报 `CRYPT_E_REVOCATION_OFFLINE`，cargo 无法连接 static.crates.io；`http.rustls` 配置键未生效（cargo 1.97）。官方开关 `http.check-revoke=false` 解决，已写入用户级 `~/.cargo/config.toml`（仅跳过吊销列表检查，证书链验证保留），**未写入仓库**以免影响 CI。若后续发现该配置引发安全顾虑，可改回并换网络重试。
- **Git Bash 会话 PATH**：新 bash 会话不包含 `.cargo\bin`（注册表用户 PATH 已正确配置，新开终端/PowerShell 可用）；本工单验证命令通过显式 `export PATH` 执行。
- node_modules 删除重装后未出现 junction 损坏，未触发 package-import-method=copy 切换。
