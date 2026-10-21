"""Tests for proof_agent.verifier."""
import pytest
from proof_agent.verifier import should_verify, parse_verdict, Verdict
from proof_agent.config import ProofConfig, ThresholdConfig


# --- should_verify ---

class TestShouldVerify:
    def test_under_threshold_skips(self):
        assert should_verify(["a.py", "b.py"]) is False

    def test_at_threshold_verifies(self):
        assert should_verify(["a.py", "b.py", "c.py"]) is True

    def test_above_threshold_verifies(self):
        assert should_verify(["a.py", "b.py", "c.py", "d.py"]) is True

    def test_sensitive_file_always_verifies(self):
        assert should_verify(["src/auth.py"]) is True

    def test_sensitive_dockerfile(self):
        assert should_verify(["Dockerfile"]) is True

    def test_sensitive_env(self):
        assert should_verify([".env.production"]) is True

    def test_never_verify_excluded(self):
        # .gitignore files don't count toward threshold
        assert should_verify([".gitignore", "a.py", "b.py"]) is False

    def test_custom_threshold(self):
        config = ProofConfig(thresholds=ThresholdConfig(min_files_changed=1))
        assert should_verify(["a.py"], config=config) is True

    def test_empty_files(self):
        assert should_verify([]) is False


# --- parse_verdict ---

class TestParseVerdict:
    def test_pass(self):
        result = parse_verdict("Everything ok\n### PASS\nAll good")
        assert result.verdict == Verdict.PASS

    def test_fail_with_issues(self):
        text = "Review:\n### FAIL\n- Bug in auth.py line 5\n- Missing validation\n### Other"
        result = parse_verdict(text)
        assert result.verdict == Verdict.FAIL
        assert len(result.issues) == 2
        assert "Bug in auth.py line 5" in result.issues[0]

    def test_partial(self):
        result = parse_verdict("Some things\n### PARTIAL\nSome passed")
        assert result.verdict == Verdict.PARTIAL

    def test_no_heading_defaults_partial(self):
        result = parse_verdict("No structured verdict here")
        assert result.verdict == Verdict.PARTIAL

    def test_summary_preserved(self):
        text = "Full response text"
        result = parse_verdict(text)
        assert result.summary == text

    def test_fail_issues_extraction_stops_at_next_heading(self):
        text = "### FAIL\n- issue1\n- issue2\n### Notes\n- not an issue"
        result = parse_verdict(text)
        assert len(result.issues) == 2

    def test_prompt_echo_false_fail(self):
        """Regression: Verifier echoes prompt example, uses LAST verdict."""
        text = """Here's an example of a FAIL verdict:

### FAIL
Critical issues found.

But actually, the code is fine:

### PASS
No security issues found.
Code is safe to merge.
"""
        result = parse_verdict(text)
        # Should use LAST occurrence (PASS), not first (FAIL from example)
        assert result.verdict == Verdict.PASS

    def test_gemma_verdict_format(self):
        """Test Gemma's '### Verdict: PASS' format."""
        text = "Analysis complete.\n\n### Verdict: PASS\n\nNo security issues found."
        result = parse_verdict(text)
        assert result.verdict == Verdict.PASS

    def test_claude_bold_verdict(self):
        """Test Claude's bold-wrapped verdicts."""
        text = "Here's my assessment:\n\n**### PASS**\n\nCode looks secure."
        result = parse_verdict(text)
        assert result.verdict == Verdict.PASS

    def test_wrong_heading_level(self):
        """Test models that use wrong heading levels."""
        text = "Assessment:\n\n## FAIL\n\nFound issues:"
        result = parse_verdict(text)
        assert result.verdict == Verdict.FAIL

    def test_colon_without_bold(self):
        """Test '#### Verdict: FAIL' format."""
        text = "#### Verdict: PARTIAL\n\nSome checks passed."
        result = parse_verdict(text)
        assert result.verdict == Verdict.PARTIAL

    def test_case_insensitive_matching(self):
        """Test that verdict matching is case-insensitive."""
        text = "### verdict: pass\n\nAll good."
        result = parse_verdict(text)
        assert result.verdict == Verdict.PASS

    def test_multiple_verdict_formats_last_wins(self):
        """Test that when multiple formats exist, last one wins."""
        text = """## FAIL
Early fail assessment

### Verdict: PARTIAL
Actually, some things unclear

### PASS
Final decision: all good
"""
        result = parse_verdict(text)
        assert result.verdict == Verdict.PASS

    def test_whitespace_handling(self):
        """Test verdict patterns with various whitespace."""
        text = "###    PASS   \n\nWith extra spaces."
        result = parse_verdict(text)
        assert result.verdict == Verdict.PASS


# --- ProofConfig.load ---

class TestProofConfigLoad:
    def test_defaults_when_no_file(self, tmp_path):
        config = ProofConfig.load(tmp_path / "nonexistent.yaml")
        assert config.thresholds.min_files_changed == 3
        assert config.retry.max_attempts == 3

    def test_load_from_yaml(self, tmp_path):
        f = tmp_path / "proof-agent.yaml"
        f.write_text("thresholds:\n  min_files_changed: 5\nretry:\n  max_attempts: 2\n")
        config = ProofConfig.load(f)
        assert config.thresholds.min_files_changed == 5
        assert config.retry.max_attempts == 2

    def test_partial_yaml(self, tmp_path):
        f = tmp_path / "proof-agent.yaml"
        f.write_text("thresholds:\n  min_files_changed: 10\n")
        config = ProofConfig.load(f)
        assert config.thresholds.min_files_changed == 10
        assert config.retry.max_attempts == 3  # default
