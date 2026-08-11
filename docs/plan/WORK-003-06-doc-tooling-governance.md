# WORK-003-06: 文档工具治理

## PLAN 来源

[PLAN-003-stable-release-baseline.md](PLAN-003-stable-release-baseline.md)

## 目标

- 将文档工具校验纳入收口流程：`python tools/project_docs.py validate` 零断裂链接、`index check` 健康
- 补齐缺失索引行与文档规范（本次 PRD-001 / ADR-0004 / PLAN-003 / WORK-003-01~06 全部入索引）
- 修复 `project_docs.py` 使用中发现的缺陷（若有，先复现再修）

## 依赖

无（可与 WORK-003-01~05 并行；文档收口放在最后）

## 允许修改

- `docs/**`（索引文件、文档链接修复、归档记录）
- `tools/project_docs.py`（仅缺陷修复，需先复现缺陷并说明修复理由）

## 禁止修改

- 任何生产代码（`src/`、`src-tauri/`）
- 不移动/删除存量文档文件（归档只动索引记录）
- 不重写既有文档内容（仅修断裂链接）
- 未经授权不写记忆、不发布

## 必须复用

- `tools/project_docs.py` 现有命令（new / start / close / validate / status / index）
- 既有索引格式（`docs/adr/index.md`、`docs/prd/index.md`、`docs/plan/plan-index.md`）

## TDD 步骤

1. 先运行 `python tools/project_docs.py validate` 与 `index check` 记录问题清单（红）
2. 修复断裂链接与索引缺失（本 PLAN 新增文档全部入索引）
3. 复跑 validate / index check 全绿（绿）
4. 若发现 `project_docs.py` 缺陷：先写最小复现，修复后复跑全部子命令回归

## 验证命令

```bash
python tools/project_docs.py validate
python tools/project_docs.py index check
python tools/project_docs.py status
```

## 通过标准

- [ ] `validate` 输出 `broken_links: []`
- [ ] `index check` 输出"索引健康"（或可接受提示）
- [ ] PRD-001 / ADR-0004 / PLAN-003 / WORK-003-01~06 均在各索引中有行
- [ ] 工具缺陷（若有）有复现与修复记录

## 停止条件

- 工具缺陷修复涉及重大重构（超出缺陷修复范围）→ 停止，汇报另开工单
- 文档内容与实现冲突需改生产代码 → 停止，汇报

## 下一步

执行完成后运行 verify 模式验证本工单。全部工单完成后，由主流程执行 PLAN-003 的 close 收口。
