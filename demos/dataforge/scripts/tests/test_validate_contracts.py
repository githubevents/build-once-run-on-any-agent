import importlib.util
import tempfile
import unittest
from pathlib import Path

CONTRACTS_PATH = Path(__file__).resolve().parents[1] / "validate_contracts.py"
SPEC = importlib.util.spec_from_file_location("validate_contracts", CONTRACTS_PATH)
CONTRACTS = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CONTRACTS)


class ValidateContractsTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        (self.root / "dataforge.manifest.yaml").write_text(
            "\n".join(
                [
                    "platform:",
                    "  zones:",
                    "    - id: zone1",
                    "catalogs:",
                    "  sources:",
                    "    - name: ram_gold",
                    "      pattern: demo_gold_source_a{zone_suffix}",
                    "naming:",
                    "  system_columns:",
                    "    uppercase:",
                    "      - SNAPSHOT_DATE",
                    "user_grain_excluded_tools:",
                    "  pay: _project",
                ]
            ),
            encoding="utf-8",
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_manifest_reference_check_flags_invalid_key(self):
        md = self.root / "doc.md"
        md.write_text(
            "Use `manifest.USER_GRAIN_EXCLUDED_TOOLS` and `manifest.platform.zones`.\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_manifest_refs(self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("user_grain_excluded_tools", errors[0])

    def test_cli_shape_check_flags_dot_schema_form(self):
        md = self.root / "cli.md"
        md.write_text(
            "Run `databricks tables list <catalog>.<schema> --profile x`.\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_cli_command_shapes(self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("tables list <catalog> <schema>", errors[0])

    def test_deprecated_playbook_ref_is_flagged(self):
        md = self.root / "links.md"
        md.write_text(
            "See `forge-builder/references/deployment-playbook.md`.\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_deprecated_deployment_ref(self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("deployment-playbook.md", errors[0])

    # --- Raw egress: rejected patterns ---

    def test_raw_physical_select_star_dotted_is_flagged(self):
        md = self.root / "query.md"
        md.write_text(
            "Run `SELECT * FROM demo_gold.metrics.adoption_snapshot LIMIT 10`.\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_raw_egress_patterns(self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("raw-egress", errors[0])

    def test_raw_physical_select_star_placeholder_is_flagged(self):
        md = self.root / "query.md"
        md.write_text(
            "Example: `SELECT * FROM {catalog}.{schema}.{table}`\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_raw_egress_patterns(self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("raw-egress", errors[0])

    def test_time_travel_select_star_is_flagged(self):
        md = self.root / "history.md"
        md.write_text(
            "Check: `SELECT * FROM my_table VERSION AS OF '2024-01-01'`\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_raw_egress_patterns(self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("VERSION AS OF", errors[0])

    def test_sample_query_select_star_is_flagged(self):
        md = self.root / "manifest.md"
        md.write_text(
            "sample_query: 'SELECT * FROM my_catalog.my_schema.my_table LIMIT 5'\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_raw_egress_patterns(self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("raw-egress", errors[0])

    def test_sample_query_select_star_no_dots_is_flagged(self):
        """Catch sample_query: 'SELECT *' even when physical path uses no dots (template form)."""
        md = self.root / "manifest2.md"
        md.write_text(
            "sample_query: 'SELECT * FROM my_table'\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_raw_egress_patterns(self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("sample_query", errors[0])

    def test_yaml_sample_query_select_star_is_flagged(self):
        manifest = self.root / "assets" / "dataforge.manifest.yaml"
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text(
            "sample_query: 'SELECT * FROM my_catalog.my_schema.my_table LIMIT 5'\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_raw_egress_patterns(self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("raw-egress", errors[0])

    # --- Raw egress: allowed patterns ---

    def test_aggregate_count_is_allowed(self):
        md = self.root / "agg.md"
        md.write_text(
            "Use `SELECT COUNT(*) FROM demo_gold.metrics.snapshot`.\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_raw_egress_patterns(self.root)
        self.assertEqual(errors, [])

    def test_select_star_from_cte_is_allowed(self):
        md = self.root / "cte.md"
        md.write_text(
            "SELECT * FROM moving_avg ORDER BY SNAPSHOT_DATE DESC LIMIT 1\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_raw_egress_patterns(self.root)
        self.assertEqual(errors, [])

    def test_policy_table_blocked_line_is_skipped(self):
        md = self.root / "policy.md"
        md.write_text(
            "| raw_rows | `SELECT * FROM catalog.schema.table` | Blocked |\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_raw_egress_patterns(self.root)
        self.assertEqual(errors, [])

    def test_prose_blocked_comment_is_still_flagged(self):
        """A 'blocked' word in prose must not suppress a real SELECT * violation."""
        md = self.root / "prose.md"
        md.write_text(
            "-- blocked by lock; SELECT * FROM catalog.schema.table\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_raw_egress_patterns(self.root)
        self.assertEqual(len(errors), 1)
        self.assertIn("raw-egress", errors[0])

    def test_changelog_is_skipped(self):
        md = self.root / "CHANGELOG.md"
        md.write_text(
            "- Replaced `SELECT * FROM prod.schema.table LIMIT 10` with COUNT(*).\n",
            encoding="utf-8",
        )
        errors = CONTRACTS.check_raw_egress_patterns(self.root)
        self.assertEqual(errors, [])

    # --- run_checks integration ---

    def test_run_checks_missing_manifest_returns_error(self):
        missing = self.root / "nonexistent" / "dataforge.manifest.yaml"
        errors = CONTRACTS.run_checks(self.root, missing)
        manifest_errors = [e for e in errors if "manifest-missing" in e]
        self.assertEqual(len(manifest_errors), 1)

    def test_run_checks_present_manifest_no_manifest_error(self):
        manifest = self.root / "assets" / "dataforge.manifest.yaml"
        manifest.parent.mkdir(parents=True, exist_ok=True)
        manifest.write_text("skill_version: '0.4.4'\n", encoding="utf-8")
        errors = CONTRACTS.run_checks(self.root, manifest)
        manifest_errors = [e for e in errors if "manifest-missing" in e]
        self.assertEqual(manifest_errors, [])


if __name__ == "__main__":
    unittest.main()
