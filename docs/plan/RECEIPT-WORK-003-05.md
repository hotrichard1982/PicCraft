---
id: RECEIPT-WORK-003-05
work: WORK-003-05
status: completed
created: 2026-08-11
updated: 2026-08-11
---

# RECEIPT-WORK-003-05

本回执仅覆盖 WORK-003-05 中不依赖 WORK-003-02/03 结果的工程化部分（任务委派范围）：
仓库可跟踪性、copy-dist.mjs 工具链探测、Windows CI workflow 与文档校验。
Rust 编译与前端质量门的最终全绿依赖 WORK-003-02/03 完成（见风险与未决项）。

## Changed Files

| 文件 | 改动 |
|---|---|
| `.gitignore` | 移除 `tools/` 忽略，使 `tools/project_docs.py` 可纳入仓库；`pnpm-workspace.yaml` 已由 WORK-003-01 移除忽略（本工作区 untracked 可见）；`.agents/`（个人 skills）继续忽略，未改动 |
| `scripts/copy-dist.mjs` | 移除硬编码 MSVC 14.44.35207 / SDK 10.0.26100.0 绝对路径；改为两级解析：① 检测到 VS Developer 环境（`VCToolsInstallDir` 已设，即 VsDevCmd/Developer PowerShell/CI msvc-dev-cmd）→ 直接继承当前环境；② 否则 vswhere 定位 VS/BuildTools 安装 → 枚举最新 MSVC 与 Windows SDK 版本目录 → 组装 PATH/LIB/INCLUDE/RC；③ 均失败 → 明确报错并给出 `winget install Microsoft.VisualStudio.2022.BuildTools` 指引（不再静默回退系统 PATH，避免用错编译器产出坏产物）。探测函数 `resolveToolchainEnv()` 导出、构建入口用 `import.meta.url` 守卫隔离，可独立验证 |
| `.github/workflows/ci.yml`（新增） | Windows 质量门禁：push/PR 触发，`windows-latest`；步骤 = checkout → pnpm/action-setup（读 package.json `packageManager` 锁 11.18.0）→ setup-node（读 `.nvmrc` 锁 24.14.0）→ `pnpm install --frozen-lockfile` → `pnpm lint` / `pnpm test` / `pnpm build` → dtolnay/rust-toolchain（`toolchain: 1.97.1`，与 `rust-toolchain.toml` 一致）→ `cargo test --locked`（working-directory: src-tauri）→ `python tools/project_docs.py validate` / `index check`。无 secrets、无发布、无 tag、无产物上传 |

未修改：`package.json`、`rust-toolchain.toml`（WORK-003-01 已锁定，本工单只引用）；`README.md`（并行代理在改，徽章留待后续）；`src/`、`src-tauri/src/`（业务代码，未触碰）。

## 语法与定向验证

| 检查 | 命令 | 结果 |
|---|---|---|
| JS 语法 | `node --check scripts/copy-dist.mjs` | 通过 |
| YAML 结构 | `python -c "yaml.safe_load(...)"` | 解析成功；jobs=quality、runs-on=windows-latest、11 个 step 齐全；trigger=push+pull_request |
| 探测函数（本机） | `node --input-type=module -e "import {resolveToolchainEnv}..."` | 成功解析 MSVC 14.44.35207（BuildTools）与 SDK 10.0.26100.0，PATH/LIB/INCLUDE/RC 全部指向真实存在路径 |
| 继承分支 | 同上并预设 `VCToolsInstallDir` | 返回 `process.env` 本身，未触发 vswhere，符合"优先继承" |
| 入口守卫 | import 模块 | 未触发构建副作用（main 隔离有效） |
| 文档 validate | `python tools/project_docs.py validate` | 通过，`{"broken_links": []}`，退出码 0 |
| 文档索引 | `python tools/project_docs.py index check` | 通过，索引健康，退出码 0 |
| frozen lockfile | `pnpm install --frozen-lockfile` | 通过，Already up to date（幂等） |
| Rust 测试 | `cd src-tauri && cargo test --locked` | **阻塞**：编译失败（E0308/E0596，`image_ops.rs` 存在并行代理在途改动，属 WORK-003-03 范围），与本工单改动无关 |

## 通过标准核对

- [x] `tools/project_docs.py`、`pnpm-workspace.yaml` 可被 git 跟踪（`git check-ignore` 无命中），`.agents/skills` 继续忽略
- [x] copy-dist.mjs 无固定 MSVC/SDK 版本依赖，优先继承 Developer 环境，vswhere 可靠探测，失败明确报错
- [x] CI workflow 仅 lint/test/build/cargo test --locked/validate/index check，无 secrets、无发布、无 tag
- [x] workflow YAML 与脚本语法检查通过
- [x] 能运行的定向验证已执行（探测、继承、validate、index check、frozen install）
- [x] 未修改 `package.json` / `rust-toolchain.toml`
- [ ] 本地 `cargo test --locked` 全绿 —— 依赖 WORK-003-03 完成后重跑（当前被其编译错误阻塞）
- [ ] CI 远端实际运行全绿 —— **远端未触发**：未 push、未提交、未创建 tag/release，workflow 仅本地存在，等待后续明确推送

## 风险与未决项

- **cargo test 本地编译失败（阻塞项）**：并行代理正在改 `src-tauri/src/image_ops.rs`（WORK-003-03 测试安全改造），当前中间状态存在 2 个编译错误（E0308/E0596）。未代修（避免与并行改动冲突）；WORK-003-03 完成后需重跑 `cargo test --locked` 补证。
- **CI 远端绿灯未达成**：任务要求明确远端未触发，本回执不声称 CI 全绿；首次推送后如 workflow 有配置问题需按日志修复（只修配置，不修业务代码）。
- **`.gitignore` 共享文件**：WORK-003-01 已在该文件移除 `pnpm-workspace.yaml` 忽略（工作区未提交）；本次仅追加移除 `tools/` 一行，未覆盖其改动，提交前需一并确认。
- **lint 基线**：本地 `pnpm lint` 仍红（WORK-003-01 记录 11 problems），归 WORK-003-02 清零，非本工单范围。
- **CI 单 job 顺序执行**：cargo test 在 pnpm build 之后串行，windows-latest 全流程约需 15-20 分钟；若后续希望加速可拆并行 job，当前保持简单。

## 审计补正段（PLAN-003 审计，2026-08-11）

- **CI 增加 `pnpm run doctor`**：`.github/workflows/ci.yml` 在 `pnpm test` 与 `pnpm build` 之间新增 `react-doctor（静态检查质量门禁）` 步骤（`pnpm run doctor`），workflow 头注释同步更新；doctor 现为本地锁定 `react-doctor@0.9.11`（WORK-003-02），CI 可复现。
- **copy-dist.mjs `isMain` Windows 稳健比较**：原 `resolve(process.argv[1]) === fileURLToPath(import.meta.url)` 在 Windows 上可能因盘符大小写/短路径不一致误判（直接运行被当作 import 跳过构建）；改为统一绝对路径后 `toLowerCase()` 不区分大小写比较。`node --check` 通过。
- **`.gitignore` 补条目**：新增 `.zcode/`、`__pycache__/`、`*.py[cod]` 忽略；`tools/` 与 `pnpm-workspace.yaml` 保持可跟踪（不重新加入忽略，`git check-ignore` 无命中）。
