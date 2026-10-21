"""Tests for proof_agent.cli."""
import os
import subprocess
import sys

import pytest


class TestParseVerdictCLI:
    """Test the proof-agent-parse-verdict CLI command."""
    
    def test_pass_verdict(self):
        """CLI should output PASS for pass verdict."""
        input_text = "Everything ok\n### PASS\nAll good"
        result = subprocess.run(
            [sys.executable, "-m", "proof_agent.cli", "parse-verdict"],
            input=input_text,
            capture_output=True,
            text=True
        )
        assert result.returncode == 0
        assert result.stdout.strip() == "PASS"
    
    def test_fail_verdict(self):
        """CLI should output FAIL for fail verdict."""
        input_text = "Review:\n### FAIL\n- Bug found\n"
        result = subprocess.run(
            [sys.executable, "-m", "proof_agent.cli", "parse-verdict"],
            input=input_text,
            capture_output=True,
            text=True
        )
        assert result.returncode == 0
        assert result.stdout.strip() == "FAIL"
    
    def test_partial_verdict(self):
        """CLI should output PARTIAL for partial verdict."""
        input_text = "Some things\n### PARTIAL\nSome passed"
        result = subprocess.run(
            [sys.executable, "-m", "proof_agent.cli", "parse-verdict"],
            input=input_text,
            capture_output=True,
            text=True
        )
        assert result.returncode == 0
        assert result.stdout.strip() == "PARTIAL"
    
    def test_no_verdict_defaults_partial(self):
        """CLI should output PARTIAL when no structured verdict found."""
        input_text = "No structured verdict here"
        result = subprocess.run(
            [sys.executable, "-m", "proof_agent.cli", "parse-verdict"],
            input=input_text,
            capture_output=True,
            text=True
        )
        assert result.returncode == 0
        assert result.stdout.strip() == "PARTIAL"
    
    def test_prompt_echo_uses_last_verdict(self):
        """CLI should use LAST verdict occurrence (avoid prompt-echo bug)."""
        input_text = """Here's an example of a FAIL verdict:

### FAIL
Critical issues found.

But actually, the code is fine:

### PASS
No security issues found.
Code is safe to merge.
"""
        result = subprocess.run(
            [sys.executable, "-m", "proof_agent.cli", "parse-verdict"],
            input=input_text,
            capture_output=True,
            text=True
        )
        assert result.returncode == 0
        assert result.stdout.strip() == "PASS"  # Should use last, not first
    
    def test_empty_input_fallback(self):
        """CLI should handle empty input gracefully."""
        result = subprocess.run(
            [sys.executable, "-m", "proof_agent.cli", "parse-verdict"],
            input="",
            capture_output=True,
            text=True
        )
        assert result.returncode == 0
        assert result.stdout.strip() == "PARTIAL"  # Safe fallback

    def test_exception_fallback_exits_zero(self, monkeypatch):
        """Regression: CLI must exit 0 even when parse_verdict raises.

        Under ``set -e``, a nonzero exit from a command substitution aborts
        the caller before it can assign the fallback. The CLI must always
        exit 0 and emit PARTIAL to stdout so the caller keeps running.
        """
        # Invoke the function directly so we can monkeypatch and inspect
        # the SystemExit code, without shelling out.
        from proof_agent import cli

        def boom(_response):
            raise RuntimeError("simulated failure")

        monkeypatch.setattr(cli, "parse_verdict", boom)
        monkeypatch.setattr(sys, "stdin", _StringIO("anything"))

        with pytest.raises(SystemExit) as exc_info:
            cli.parse_verdict_cli()

        assert exc_info.value.code == 0


class TestBuildPromptCLI:
    """Test the proof-agent-build-prompt CLI command."""

    def _run(self, files, diff, commits):
        """Invoke the build-prompt CLI with env vars."""
        env = {
            **os.environ,
            "PROOF_FILES": files,
            "PROOF_DIFF": diff,
            "PROOF_COMMITS": commits,
        }
        return subprocess.run(
            [sys.executable, "-m", "proof_agent.cli", "build-prompt"],
            capture_output=True,
            text=True,
            env=env,
        )

    def test_basic_prompt(self):
        """Builds a prompt containing changed files and diff."""
        result = self._run(
            files="src/auth.py\ntests/test_auth.py\n",
            diff="diff --git a/src/auth.py b/src/auth.py\n+PASSWORD = 'hunter2'\n",
            commits="abc123 add login",
        )
        assert result.returncode == 0
        assert "src/auth.py" in result.stdout
        assert "tests/test_auth.py" in result.stdout
        assert "PASSWORD = 'hunter2'" in result.stdout
        assert "abc123 add login" in result.stdout

    def test_triple_quote_in_diff_does_not_crash(self):
        """Regression: diff containing triple quotes must not break parsing.

        This was the original Python injection bug in scripts/verify.sh —
        a diff that touched a Python docstring would break the inline
        ``python3 -c '''...$DIFF...'''`` call. Passing via env vars makes
        the contents opaque to the Python parser.
        """
        evil_diff = """diff --git a/m.py b/m.py
+def foo():
+    '''docstring with triple quotes'''
+    return 42
"""
        result = self._run(
            files="m.py",
            diff=evil_diff,
            commits="deadbee add module",
        )
        assert result.returncode == 0, result.stderr
        assert "docstring with triple quotes" in result.stdout

    def test_shell_metachars_in_diff_are_safe(self):
        """Regression: $(...), backticks, and $VAR in diff must be inert.

        Proves the env-var pipeline is not re-evaluated by any shell or
        Python parser downstream.
        """
        evil_diff = (
            "diff --git a/x.sh b/x.sh\n"
            "+echo $(whoami)\n"
            "+echo `id`\n"
            "+VAR=${HOME}\n"
            "+''' + __import__('os').system('touch /tmp/pwned') + '''\n"
        )
        result = self._run(
            files="x.sh",
            diff=evil_diff,
            commits="cafef00d add script",
        )
        assert result.returncode == 0
        # The literal text should pass through unchanged — nothing executed.
        assert "$(whoami)" in result.stdout
        assert "__import__" in result.stdout
        assert not os.path.exists("/tmp/pwned"), "injection executed"

    def test_empty_inputs(self):
        """Empty env vars produce a prompt with zero files, no crash."""
        result = self._run(files="", diff="", commits="")
        assert result.returncode == 0
        assert "0 file(s)" in result.stdout

    def test_missing_env_vars(self):
        """Missing env vars are treated as empty strings."""
        env = {k: v for k, v in os.environ.items()
               if k not in ("PROOF_FILES", "PROOF_DIFF", "PROOF_COMMITS")}
        result = subprocess.run(
            [sys.executable, "-m", "proof_agent.cli", "build-prompt"],
            capture_output=True,
            text=True,
            env=env,
        )
        assert result.returncode == 0
        assert "0 file(s)" in result.stdout


class _StringIO:
    """Tiny stdin stand-in for the monkeypatched exception test."""
    def __init__(self, data):
        self._data = data

    def read(self):
        return self._data
