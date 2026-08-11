#!/usr/bin/env python3
"""tools/project_docs.py 自动测试（stdlib unittest，零依赖）。

运行：python tools/test_project_docs.py
隔离策略：monkeypatch project_docs.root 指向临时目录，绝不触碰真实 docs/。
"""
import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import date
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parent))
import project_docs


def run(cmd, arg=None):
    out = io.StringIO()
    with redirect_stdout(out):
        code = cmd(arg) if arg is not None else cmd(None)
    return code, out.getvalue()


class ProjectDocsTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self._orig_root = project_docs.root
        project_docs.root = lambda: self.root

    def tearDown(self):
        project_docs.root = self._orig_root
        self.tmp.cleanup()

    def write(self, rel, content):
        path = self.root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")


class TestStatus(ProjectDocsTestCase):
    def test_status_outputs_lifecycle_statuses(self):
        self.write("docs/plan/PLAN-001-a.md",
                   "---\nid: PLAN-001\ntitle: A\nstatus: completed\n---\n")
        self.write("docs/plan/PLAN-002-b.md", "# B\n")  # 无 frontmatter
        self.write("docs/prd/PRD-001-c.md",
                   "---\nid: PRD-001\ntitle: C\nstatus: 已接受\n---\n")
        self.write("docs/adr/0001-d.md", "# D\n")  # 无 frontmatter，数字命名
        code, out = run(project_docs.cmd_status)
        self.assertEqual(code, 0)
        self.assertNotIn("broken_links", out, "status 不得再输出 validate 的断裂链接结果")
        data = json.loads(out)
        plan = {item["id"]: item["status"] for item in data["plan"]}
        self.assertEqual(plan["PLAN-001"], "completed")
        self.assertEqual(plan["PLAN-002"], "unknown", "无 frontmatter 应如实显示 unknown")
        self.assertEqual(data["prd"][0]["status"], "已接受")
        adr = {item["id"]: item["status"] for item in data["adr"]}
        self.assertEqual(adr["0001"], "unknown")

    def test_status_skips_templates_receipts_and_indexes(self):
        self.write("docs/plan/PLAN-000-template.md", "# 模板\n")
        self.write("docs/plan/RECEIPT-PLAN-001-x.md",
                   "---\nid: RECEIPT-PLAN-001-x\nstatus: completed\n---\n")
        self.write("docs/plan/ACCEPTANCE-PLAN-001-x.md", "# 验收\n")
        self.write("docs/plan/plan-index.md", "# PLAN 索引\n")
        _, out = run(project_docs.cmd_status)
        ids = [item["id"] for item in json.loads(out).get("plan", [])]
        self.assertNotIn("PLAN-000-template", ids)
        self.assertNotIn("RECEIPT-PLAN-001-x", ids)
        self.assertNotIn("ACCEPTANCE-PLAN-001-x", ids)


class TestIndexRebuild(ProjectDocsTestCase):
    def test_rebuild_preserves_manual_adr_index(self):
        self.write("docs/adr/0001-launch-routing.md", "# 启动参数路由\n")  # 无 frontmatter
        self.write("docs/adr/0002-queue-only-in-batch.md", "# 队列\n")  # 无 frontmatter
        manual = ("# ADR 索引\n\n| ID | 文档 | 状态 | 摘要 |\n|---|---|---|---|\n"
                  "| 0001 | [启动参数路由](0001-launch-routing.md) | 已接受 | 手工摘要 |\n")
        self.write("docs/adr/index.md", manual)
        code, out = run(project_docs.cmd_index, SimpleNamespace(action="rebuild"))
        self.assertEqual(code, 0)
        self.assertIn("跳过 docs/adr/index.md", out, "手工索引应跳过并提示")
        self.assertEqual((self.root / "docs/adr/index.md").read_text(encoding="utf-8"), manual,
                         "手工 ADR 索引不得被覆盖")

    def test_rebuild_preserves_manual_plan_index_with_work_rows(self):
        self.write("docs/plan/PLAN-003-x.md",
                   "---\nid: PLAN-003\ntitle: X\nstatus: implementing\n---\n")
        self.write("docs/plan/WORK-003-01-x.md", "# WORK\n")  # 无 frontmatter，不在 PLAN glob
        manual = ("# PLAN 索引\n\n| ID | 文档 | 来源 | 状态 |\n|---|---|---|---|\n"
                  "| PLAN-003 | [X](PLAN-003-x.md) | PRD-001 | 🚧 实施中 |\n"
                  "| WORK-003-01 | [环境依赖](WORK-003-01-x.md) | PLAN-003 | 待开始 |\n")
        self.write("docs/plan/plan-index.md", manual)
        code, out = run(project_docs.cmd_index, SimpleNamespace(action="rebuild"))
        self.assertEqual(code, 0)
        self.assertIn("跳过 docs/plan/plan-index.md", out)
        self.assertEqual((self.root / "docs/plan/plan-index.md").read_text(encoding="utf-8"), manual,
                         "含 WORK 手工行的 PLAN 索引不得被覆盖")

    def test_rebuild_updates_generated_index(self):
        self.write("docs/adr/ADR-0001-x.md",
                   "---\nid: ADR-0001\ntitle: 测试决策\nstatus: completed\nsummary: 摘要\n---\n")
        generated = ("# ADR 索引\n\n| ID | 文档 | 状态 | 摘要 |\n|---|---|---|---|\n"
                     "| ADR-0001 | [测试决策](ADR-0001-x.md) | completed | 摘要 |\n")
        self.write("docs/adr/index.md", generated)
        # 状态改为 draft 后重建应同步
        (self.root / "docs/adr/ADR-0001-x.md").write_text(
            "---\nid: ADR-0001\ntitle: 测试决策\nstatus: draft\nsummary: 摘要\n---\n",
            encoding="utf-8")
        code, out = run(project_docs.cmd_index, SimpleNamespace(action="rebuild"))
        self.assertEqual(code, 0)
        self.assertNotIn("跳过", out, "生成格式索引应正常重建")
        self.assertIn("| ADR-0001 | [测试决策](ADR-0001-x.md) | draft | 摘要 |",
                      (self.root / "docs/adr/index.md").read_text(encoding="utf-8"))

    def test_rebuild_no_frontmatter_fallback_parses_id(self):
        self.write("docs/plan/PLAN-999-x.md", "# 无元数据\n")  # 无 frontmatter
        generated = ("# PLAN 索引\n\n| ID | 文档 | 来源 | 状态 |\n|---|---|---|---|\n"
                     "| PLAN-999 | [PLAN-999-x](PLAN-999-x.md) | - | completed |\n")
        self.write("docs/plan/plan-index.md", generated)
        code, out = run(project_docs.cmd_index, SimpleNamespace(action="rebuild"))
        self.assertEqual(code, 0)
        self.assertNotIn("跳过", out)
        text = (self.root / "docs/plan/plan-index.md").read_text(encoding="utf-8")
        self.assertIn("| PLAN-999 | [PLAN-999-x](PLAN-999-x.md) | - | unknown |", text,
                      "无 frontmatter 文件 ID 应从文件名解析、状态如实为 unknown")

    def test_rebuild_adr_index_unaffected_when_empty(self):
        self.write("docs/adr/index.md", "# ADR 索引\n\n| ID | 文档 | 状态 | 摘要 |\n|---|---|---|---|\n")
        code, _ = run(project_docs.cmd_index, SimpleNamespace(action="rebuild"))
        self.assertEqual(code, 0)


class TestValidate(ProjectDocsTestCase):
    def test_validate_finds_broken_links(self):
        self.write("docs/a.md", "[断链](not-exist.md)\n")
        code, out = run(project_docs.cmd_validate)
        self.assertEqual(code, 5)
        self.assertIn("not-exist.md", out)

    def test_validate_clean(self):
        self.write("docs/a.md", "[好链](b.md)\n")
        self.write("docs/b.md", "# B\n")
        code, out = run(project_docs.cmd_validate)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)["broken_links"], [])

    def test_validate_skips_external_links(self):
        self.write("docs/a.md",
                   "[外链](https://example.com/x) [http](http://example.com/y) "
                   "[mailto](mailto:a@b.com) [ftp](ftp://example.com/z) [相对](b.md)\n")
        self.write("docs/b.md", "# B\n")
        code, out = run(project_docs.cmd_validate)
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)["broken_links"], [], "外链不得被当作断链")


class TestChecked(ProjectDocsTestCase):
    def test_checked_missing_section_is_false(self):
        path = self.root / "docs/plan/PLAN-001-a.md"
        self.write("docs/plan/PLAN-001-a.md", "# 无章节文档\n")
        self.assertFalse(project_docs.checked(path, "## 开发前知识检查"),
                         "缺章节应视为未通过，不得放行")

    def test_checked_unchecked_item_false_and_checked_true(self):
        path = self.root / "docs/plan/PLAN-001-a.md"
        self.write("docs/plan/PLAN-001-a.md",
                   "## 开发前知识检查\n- [ ] 未完成\n\n## 收口检查\n")
        self.assertFalse(project_docs.checked(path, "## 开发前知识检查"))
        self.write("docs/plan/PLAN-001-a.md",
                   "## 开发前知识检查\n- [x] 已完成\n\n## 收口检查\n")
        self.assertTrue(project_docs.checked(path, "## 开发前知识检查"))


class TestNew(ProjectDocsTestCase):
    def test_new_missing_title_friendly_error(self):
        code, out = run(project_docs.cmd_new,
                        SimpleNamespace(kind="bug", title=None, source=None, topics=[]))
        self.assertEqual(code, 1, "缺标题应返回非 0 而不是抛异常")
        self.assertIn("标题", out, "应给出可读的缺标题提示")
        self.assertFalse(list((self.root / "docs" / "bug").glob("BUG-*.md")),
                         "缺标题不得创建文档")

    def test_new_plan_without_title_uses_source_title(self):
        self.write("docs/prd/PRD-001-x.md",
                   "---\nid: PRD-001\ntitle: 测试需求\n---\n")
        code, out = run(project_docs.cmd_new,
                        SimpleNamespace(kind="plan", title=None, source="PRD-001", topics=[]))
        self.assertEqual(code, 0)
        self.assertIn("PLAN-001", out)


class TestIndexCompact(ProjectDocsTestCase):
    def test_compact_rewrites_archived_row_links_with_parent_prefix(self):
        rows = []
        for i in range(12):
            self.write(f"docs/plan/PLAN-{i:03d}-x.md",
                       f"---\nid: PLAN-{i:03d}\ntitle: P{i}\nstatus: completed\n---\n")
            rows.append(f"| PLAN-{i:03d} | [P{i}](PLAN-{i:03d}-x.md) | PRD-001 | completed |")
        index = ("# PLAN 索引\n\n| ID | 文档 | 来源 | 状态 |\n|---|---|---|---|\n"
                 + "\n".join(rows) + "\n")
        self.write("docs/plan/plan-index.md", index)
        code, out = run(project_docs.cmd_index, SimpleNamespace(action="compact"))
        self.assertEqual(code, 0)
        archive = self.root / "docs/plan" / "archive" / f"{date.today().year}.md"
        text = archive.read_text(encoding="utf-8")
        archived = [l for l in text.splitlines() if l.startswith("| PLAN-")]
        self.assertEqual(len(archived), 2, "12 条 completed 应归档 2 条（保留最近 10 条）")
        self.assertTrue(all("](../" in l for l in archived),
                        "归档行链接必须重写为相对 archive/ 的 ../ 前缀")
        self.assertIn("](../PLAN-000-x.md)", text)


class TestContext(ProjectDocsTestCase):
    def test_context_matches_release_build_ci_topic(self):
        catalog = {"topics": {"release-build": {
            "aliases": ["发布", "构建", "CI", "workflow", "release", "build"],
            "primary": "guide/index.md",
            "related": ["technology/index.md", "audit/audit-index.md"]}}}
        self.write("docs/catalog.json", json.dumps(catalog, ensure_ascii=False))
        code, out = run(project_docs.cmd_context,
                        SimpleNamespace(text="发布 构建 CI", topic=None, source=None))
        self.assertEqual(code, 0)
        self.assertEqual(json.loads(out)["topic"], "release-build")
        self.assertIn("docs/guide/index.md", out)

    def test_context_low_confidence(self):
        self.write("docs/catalog.json", json.dumps({"topics": {}}, ensure_ascii=False))
        code, _ = run(project_docs.cmd_context,
                      SimpleNamespace(text="zzz 无命中词", topic=None, source=None))
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
