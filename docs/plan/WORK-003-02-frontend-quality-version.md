# WORK-003-02: 前端质量版本

## PLAN 来源

[PLAN-003-stable-release-baseline.md](PLAN-003-stable-release-baseline.md)

## 目标

- 前端质量门禁清零：`pnpm lint` 零错误、`pnpm test` 全绿、`pnpm build`（tsc -b + vite）成功、`pnpm doctor` 无债务
- 版本号统一为 0.2.0：`package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 三处对齐

## 依赖

- WORK-003-01（环境依赖锁定）

## 允许修改

- `package.json`（仅 `version` 字段 → 0.2.0）
- `src-tauri/Cargo.toml`（仅 `version` 字段 → 0.2.0）
- `src-tauri/tauri.conf.json`（仅 `version` 字段 → 0.2.0）
- 前端质量修复：lint 错误、类型错误、doctor 债务对应的具体文件（仅质量类最小修复，不重构）
- `README.md`（版本号相关描述）

## 禁止修改

- 不新增任何功能、不改交互行为、不调整样式
- 不升级/降级任何依赖版本
- 不修改 Rust 端业务逻辑
- 不扩大 lint 修复范围到存量警告之外

## 必须复用

- 现有 `pnpm lint` / `pnpm test` / `pnpm build` / `pnpm doctor` 脚本
- 现有 ESLint / TS 配置（不新增规则）

## TDD 步骤

1. 基线：先运行 `pnpm lint`、`pnpm test`、`pnpm build`、`pnpm doctor` 记录失败清单（红）
2. 仅对清单内问题做最小修复
3. 复跑四项命令全部通过（绿）
4. 版本对齐：三处 version 改为 0.2.0，grep 验证一致

## 验证命令

```bash
pnpm lint
pnpm test
pnpm build
pnpm doctor
grep -n '"version"' package.json src-tauri/tauri.conf.json
grep -n '^version' src-tauri/Cargo.toml
```

## 通过标准

- [ ] `pnpm lint` 零错误
- [ ] `pnpm test` 全部通过
- [ ] `pnpm build` 成功
- [ ] `pnpm doctor` 无债务
- [ ] 三处版本号均为 0.2.0

## 停止条件

- lint/doctor 债务无法在合理范围内清零（涉及架构性重构）→ 停止，返回 PLAN 讨论拆分

## 下一步

执行完成后运行 verify 模式验证本工单，然后继续 WORK-003-04（批量确认）与 WORK-003-05（CI）。
