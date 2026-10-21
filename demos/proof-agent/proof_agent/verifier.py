"""
Core verification logic.

Determines whether work needs verification, builds verification prompts,
and parses verifier responses.
"""

import re
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from .config import ProofConfig


class Verdict(Enum):
    """Possible verification outcomes."""
    PASS = "pass"
    FAIL = "fail"
    PARTIAL = "partial"


@dataclass
class VerificationRequest:
    """Everything the verifier needs to review."""
    original_request: str
    files_changed: list[str]
    approach: str
    previous_failures: list[str] = field(default_factory=list)
    attempt: int = 1


@dataclass
class VerificationResult:
    """The verifier's verdict and evidence."""
    verdict: Verdict
    summary: str
    issues: list[str] = field(default_factory=list)
    unverifiable: list[str] = field(default_factory=list)


def should_verify(
    files_changed: list[str],
    config: Optional[ProofConfig] = None,
) -> bool:
    """Determine if work requires verification.

    Returns True if:
    - Any file matches always_verify patterns, OR
    - Number of non-excluded files >= min_files_changed threshold
    """
    if config is None:
        config = ProofConfig()

    # Check always_verify first
    for f in files_changed:
        if config.matches_always_verify(f):
            return True

    # Count files excluding never_verify
    significant = [f for f in files_changed if not config.matches_never_verify(f)]
    return len(significant) >= config.thresholds.min_files_changed


def build_verification_prompt(request: VerificationRequest) -> str:
    """Build the prompt for the verifier agent.

    Optimized for small models: concise, direct, task-focused.
    """
    files_list = "\n".join(f"- `{f}`" for f in request.files_changed)

    previous = ""
    if request.previous_failures:
        items = "\n".join(f"- {f}" for f in request.previous_failures)
        previous = f"\n\n**Previous Issues (Attempt {request.attempt}):**\n{items}\n\nCheck these FIRST, then review all code."

    return f"""You are a security auditor. Find ALL vulnerabilities in this code diff.

**Request:** {request.original_request}
**Files:** {files_list}
**Approach:** {request.approach}{previous}

**Find these issues:**
- SQL injection (string formatting in queries)
- Hardcoded secrets (API keys, passwords)
- Authentication bypasses
- Path traversal vulnerabilities
- Command injection
- Exposed credentials in logs
- Missing input validation
- Insecure cryptography

**For each issue found:**
- **File:** path/file.js, **Line:** X
- **Issue:** Brief description
- **Code:** `problematic code snippet`
- **Severity:** CRITICAL/HIGH/MEDIUM

**Conclude with exactly ONE of:** ### PASS, ### FAIL, or ### PARTIAL

**Review the actual diff. Be specific. Cite exact code. The author CANNOT verify their own work. Default to FAIL if you find ANY critical security issue.**"""


def parse_verdict(response: str) -> VerificationResult:
    """Parse a verifier's response into a structured result.

    Looks for verdict keywords and extracts issues/evidence.
    Uses LAST occurrence of verdict to avoid prompt-echo false positives.
    Handles common model output variations like '### Verdict: PASS'.
    """
    
    # Regex patterns to match various model output formats:
    # ### PASS, ### Verdict: PASS, **### PASS**, ## PASS, #### Verdict: PASS, etc.
    patterns = [
        (r'\*{0,2}#+\s*(?:verdict\s*:\s*)?fail(?:\s|$|\*)', Verdict.FAIL),
        (r'\*{0,2}#+\s*(?:verdict\s*:\s*)?partial(?:\s|$|\*)', Verdict.PARTIAL),
        (r'\*{0,2}#+\s*(?:verdict\s*:\s*)?pass(?:\s|$|\*)', Verdict.PASS),
    ]
    
    # Find ALL verdict matches, use the LAST one (avoid prompt-echo)
    verdict_matches = []
    for pattern, verdict_type in patterns:
        for match in re.finditer(pattern, response, re.IGNORECASE | re.MULTILINE):
            verdict_matches.append((match.start(), verdict_type))
    
    # Sort by position and take the last match
    if verdict_matches:
        verdict = max(verdict_matches, key=lambda x: x[0])[1]
    else:
        # If no structured heading found, default to PARTIAL (safe)
        verdict = Verdict.PARTIAL

    # Extract issues (lines starting with - after FAIL section)
    issues: list[str] = []
    in_fail = False
    for line in response.split("\n"):
        if "FAIL" in line and "#" in line:
            in_fail = True
            continue
        if in_fail and line.strip().startswith("-"):
            issues.append(line.strip().lstrip("- "))
        if in_fail and line.strip().startswith("#"):
            in_fail = False

    # Extract unverifiable items (for PARTIAL)
    unverifiable: list[str] = []
    in_unverified = False
    for line in response.split("\n"):
        if "could not be verified" in line.lower() or "unverifiable" in line.lower():
            in_unverified = True
            continue
        if in_unverified and line.strip().startswith("-"):
            unverifiable.append(line.strip().lstrip("- "))
        if in_unverified and line.strip().startswith("#"):
            in_unverified = False

    return VerificationResult(
        verdict=verdict,
        summary=response,
        issues=issues,
        unverifiable=unverifiable,
    )
