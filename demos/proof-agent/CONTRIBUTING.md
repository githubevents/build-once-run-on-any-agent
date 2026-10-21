# Contributing to Proof Agent

Thank you for your interest in contributing. This document explains how to set up your environment, run the current test suite, and submit changes.

---

## Code of Conduct

Be respectful, collaborative, and constructive. We're here to build better tools for AI safety and verification.

---

## Development Setup

### 1. Fork and clone

```bash
git clone https://github.com/YOUR_USERNAME/proof-agent.git
cd proof-agent
```

### 2. Create a virtual environment

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -e ".[dev]"
```

---

## Project Structure

```text
proof-agent/
├── proof_agent/          # Python package
│   ├── __init__.py       # Package exports
│   ├── byok.py           # BYOK provider client
│   ├── cli.py            # CLI entry points
│   ├── config.py         # Configuration loading
│   └── verifier.py       # Verification logic and prompt generation
├── scripts/
│   ├── verify.sh         # Prompt generation from git state
│   └── fact-check.sh     # Optional URL/package/action validation
├── tests/                # Pytest suite
├── action.yml            # Composite GitHub Action
├── entrypoint.sh         # Action runtime logic
├── README.md             # Main documentation
├── SKILL.md              # Agent skill documentation
└── pyproject.toml        # Package metadata and dependencies
```

---

## Running Tests

The repository's automated validation is currently the pytest suite used in CI:

```bash
pytest -v
```

CI installs dependencies with:

```bash
pip install ".[dev]"
```

---

## Submitting Changes

### 1. Create a branch

```bash
git checkout -b feature/your-feature-name
```

### 2. Make your changes

- Keep changes focused
- Add or update tests when behavior changes
- Update documentation when user-facing behavior changes

### 3. Verify your changes

```bash
pytest -v
```

### 4. Push and create a PR

```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub with:
- **Description:** What does this change do?
- **Motivation:** Why is it needed?
- **Testing:** How did you verify it works?

---

## Contribution Ideas

Examples of useful contributions:

- Expand test coverage around action behavior and shell scripts
- Improve documentation and setup guidance
- Add support for more provider-specific configuration options
- Refine verification prompts and verdict parsing

---

## Questions?

- Open a [GitHub Discussion](https://github.com/AndreaGriffiths11/proof-agent/discussions)
- Ping [@acolombiadev](https://x.com/acolombiadev) on X/Twitter

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
