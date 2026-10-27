"""
Proof Agent — Adversarial verification for AI agent work.
"""

__version__ = "0.1.0"

from .verifier import Verdict, VerificationRequest, VerificationResult, should_verify
from .config import ProofConfig

__all__ = ["Verdict", "VerificationRequest", "VerificationResult", "should_verify", "ProofConfig"]
