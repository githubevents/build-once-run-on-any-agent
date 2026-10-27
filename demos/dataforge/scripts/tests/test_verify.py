import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

VERIFY_PATH = (
    Path(__file__).resolve().parents[2] / "skills" / "forge-builder" / "verify.py"
)
SPEC = importlib.util.spec_from_file_location("verify_module", VERIFY_PATH)
VERIFY = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(VERIFY)


class VerifyContentVerifyTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.build_state_dir = self.root / ".build-state"
        self.build_state_dir.mkdir(parents=True, exist_ok=True)
        VERIFY.BUILD_STATE_DIR = str(self.build_state_dir)

    def tearDown(self):
        self.temp_dir.cleanup()

    def _write_text(self, rel_path: str, content: str) -> str:
        path = self.root / rel_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return str(path)

    def _write_state(self, build_id: str, artifacts, framework: str):
        state = {
            "build_id": build_id,
            "tool_name": "ticket",
            "folder_name": "Ticket",
            "domain": "service_delivery",
            "intake_mode": "B",
            "build_path": "extension",
            "status": "in_progress",
            "current_phase": 5,
            "completed_phases": [1, 2, 3, 4, 5],
            "hypothesis_log": [
                {"hypothesis": "x", "status": "CONFIRMED", "evidence": "y"}
            ],
            "metrics": [
                {
                    "name": "total_ticket_create_count",
                    "verb": "create",
                    "status": "implemented",
                }
            ],
            "artifacts": artifacts,
            "deployment": {"zone1": "pending"},
            "updated_at": "2026-04-28T12:00:00Z",
            "git_commit": "abc1234",
            "schema_version": 2,
            "pipeline_framework": framework,
        }
        (self.build_state_dir / f"{build_id}.json").write_text(
            json.dumps(state), encoding="utf-8"
        )

    def _assert_pass(self, build_id: str):
        with self.assertRaises(SystemExit) as exc:
            VERIFY.cmd_content_verify(build_id)
        self.assertEqual(exc.exception.code, 0)

    def _assert_fail(self, build_id: str):
        with self.assertRaises(SystemExit) as exc:
            VERIFY.cmd_content_verify(build_id)
        self.assertEqual(exc.exception.code, 1)

    def test_spark_python_passes_with_py_and_schema_sql(self):
        py_artifact = self._write_text(
            "entity_daily.py", "metric = 'total_ticket_create_count'\n"
        )
        sql_artifact = self._write_text(
            "Schema/Ticket_User_Metrics_Snapshot_Daily.sql",
            "total_ticket_create_count BIGINT\n",
        )
        self._write_state("spark-pass", [py_artifact, sql_artifact], "spark_python")
        self._assert_pass("spark-pass")

    def test_dbt_passes_with_sql_and_yml(self):
        sql_artifact = self._write_text(
            "models/ticket_daily.sql", "select total_ticket_create_count from source_table\n"
        )
        yml_artifact = self._write_text(
            "models/schema.yml", "- name: total_ticket_create_count\n"
        )
        self._write_state("dbt-pass", [sql_artifact, yml_artifact], "dbt")
        self._assert_pass("dbt-pass")

    def test_spark_python_passes_with_long_format_schema(self):
        py_artifact = self._write_text(
            "Code/Ticket_Metrics_Snapshot_Daily.py",
            "metric = 'total_ticket_create_count'\n",
        )
        sql_artifact = self._write_text(
            "Schema/Ticket_Account_Metrics_Snapshot_Daily.sql",
            "CREATE TABLE t (\n  metric_name VARCHAR(128) NOT NULL,\n"
            "  metric_value BIGINT NOT NULL\n);\n",
        )
        self._write_state("long-pass", [py_artifact, sql_artifact], "spark_python")
        self._assert_pass("long-pass")

    def test_spark_python_fails_when_long_format_schema_cadence_is_missing(self):
        py_artifact = self._write_text(
            "Code/Ticket_Metrics_Snapshot_Cumulative.py",
            "metric = 'total_ticket_create_count'\n",
        )
        sql_artifact = self._write_text(
            "Schema/Ticket_Account_Metrics_Snapshot_Daily.sql",
            "CREATE TABLE t (\n  metric_name VARCHAR(128) NOT NULL\n);\n",
        )
        self._write_state("long-cadence-fail", [py_artifact, sql_artifact], "spark_python")
        self._assert_fail("long-cadence-fail")

    def test_spark_python_fails_with_no_schema_artifact(self):
        py_artifact = self._write_text(
            "Code/Ticket_Metrics_Snapshot_Daily.py",
            "metric = 'total_ticket_create_count'\n",
        )
        self._write_state("no-schema-fail", [py_artifact], "spark_python")
        self._assert_fail("no-schema-fail")

    def test_hybrid_fails_when_present_artifact_contract_is_missing(self):
        py_artifact = self._write_text(
            "entity_daily.py", "metric = 'total_ticket_create_count'\n"
        )
        yml_artifact = self._write_text(
            "models/schema.yml", "columns:\n  - name: some_other_metric\n"
        )
        sql_artifact = self._write_text(
            "models/ticket_daily.sql", "select total_ticket_create_count from source_table\n"
        )
        self._write_state(
            "hybrid-fail", [py_artifact, yml_artifact, sql_artifact], "hybrid"
        )
        self._assert_fail("hybrid-fail")


if __name__ == "__main__":
    unittest.main()
