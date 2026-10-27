"""
Configuration for proof-agent verification thresholds.
"""

from dataclasses import dataclass, field
from pathlib import Path, PurePath
from typing import Optional

import yaml


@dataclass
class ThresholdConfig:
    """When to trigger verification."""
    min_files_changed: int = 3
    always_verify: list[str] = field(default_factory=lambda: [
        "**/*auth*",
        "**/*secret*",
        "**/*permission*",
        "**/Dockerfile",
        "**/*.env*",
    ])
    never_verify: list[str] = field(default_factory=lambda: [
        "**/.gitignore",
    ])


@dataclass
class RetryConfig:
    """How to handle FAIL verdicts."""
    max_attempts: int = 3
    escalate_on_max: bool = True


@dataclass
class ProofConfig:
    """Full proof-agent configuration."""
    thresholds: ThresholdConfig = field(default_factory=ThresholdConfig)
    retry: RetryConfig = field(default_factory=RetryConfig)

    @classmethod
    def load(cls, path: Optional[str | Path] = None) -> "ProofConfig":
        """Load config from proof-agent.yaml or return defaults."""
        if path is None:
            path = Path.cwd() / "proof-agent.yaml"
        else:
            path = Path(path)

        if not path.exists():
            return cls()

        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}

        config = cls()

        if "thresholds" in data:
            t = data["thresholds"]
            config.thresholds = ThresholdConfig(
                min_files_changed=t.get("min_files_changed", 3),
                always_verify=t.get("always_verify", config.thresholds.always_verify),
                never_verify=t.get("never_verify", config.thresholds.never_verify),
            )

        if "retry" in data:
            r = data["retry"]
            config.retry = RetryConfig(
                max_attempts=r.get("max_attempts", 3),
                escalate_on_max=r.get("escalate_on_max", True),
            )

        return config

    def _matches_pattern(self, filepath: str, pat: str) -> bool:
        """Match a filepath against a glob pattern.
        PurePath.match with ** doesn't match root-level files,
        so also check the bare filename against the pattern's basename.
        """
        p = PurePath(filepath)
        if p.match(pat):
            return True
        # For patterns like "**/Dockerfile", also match root-level "Dockerfile"
        if pat.startswith("**/"):
            return p.match(pat[3:])
        return False

    def matches_always_verify(self, filepath: str) -> bool:
        """Check if a file always requires verification."""
        return any(self._matches_pattern(filepath, pat) for pat in self.thresholds.always_verify)

    def matches_never_verify(self, filepath: str) -> bool:
        """Check if a file should never trigger verification."""
        return any(self._matches_pattern(filepath, pat) for pat in self.thresholds.never_verify)
