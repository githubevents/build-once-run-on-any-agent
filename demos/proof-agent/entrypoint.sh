#!/bin/bash
set -e

echo "🤖 Proof Agent — Adversarial Verification"
echo "=========================================="
echo ""

# Read verification prompt
if [ ! -f "verification_prompt.txt" ]; then
    echo "❌ Error: verification_prompt.txt not found"
    exit 1
fi

PROMPT_CONTENT=$(cat verification_prompt.txt)

# Check if this is a SKIP case
if echo "$PROMPT_CONTENT" | grep -q "^SKIP:"; then
    echo "⏭️  Verification skipped (threshold not met)"
    echo "$PROMPT_CONTENT"
    echo ""
    
    VERDICT_TYPE="SKIP"
    VERDICT="$PROMPT_CONTENT"
    
    # Set outputs
    echo "verdict=$VERDICT_TYPE" >> $GITHUB_OUTPUT
    echo "summary<<EOF" >> $GITHUB_OUTPUT
    echo "$VERDICT" >> $GITHUB_OUTPUT
    echo "EOF" >> $GITHUB_OUTPUT
    
    # Post as PR comment if requested
    if [ "$INPUT_POST_COMMENT" = "true" ] && [ -n "$PR_NUMBER" ]; then
        echo "💬 Posting skip notice as PR comment..."
        SKIP_REASON=$(printf "%s\n" "$VERDICT" | sed -n '1s/^SKIP:[[:space:]]*//p')
        
        COMMENT_BODY="## 🤖 Proof Agent Verification

⏭️ **SKIPPED**

> $SKIP_REASON

Proof Agent runs when at least 3 files changed or a sensitive file is touched.

To force verification, set \`force: true\` in the action or run \`--force\` from the CLI.

[🔗 View logs]($RUN_URL)"
        
        curl -X POST \
          -H "Accept: application/vnd.github+json" \
          -H "Authorization: Bearer ${INPUT_GITHUB_TOKEN}" \
          -H "X-GitHub-Api-Version: 2022-11-28" \
          "https://api.github.com/repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" \
          -d "{\"body\":$(echo "$COMMENT_BODY" | jq -Rs .)}" \
          && echo "✅ Comment posted!" \
          || echo "⚠️ Could not post PR comment"
    fi
    
    echo "✨ Verification complete (skipped)!"
    exit 0
fi

echo ""

# Check if BYOK mode is enabled
if [ -n "$PROOF_AGENT_PROVIDER_BASE_URL" ]; then
    echo "🔑 BYOK Mode Enabled"
    echo "   Provider: $PROOF_AGENT_PROVIDER_TYPE"
    # Mask potential credentials in URL
    MASKED_URL=$(echo "$PROOF_AGENT_PROVIDER_BASE_URL" | sed 's/\?.*$//' | sed 's/:[^@]*@/:***@/')
    echo "   Base URL: $MASKED_URL"
    echo "   Model: ${PROOF_AGENT_MODEL:-default}"
    echo ""
    
    # Use the proof-agent Python package for BYOK verification
    echo "📝 Running verification via custom provider..."
    
    COPILOT_EXIT=0
    VERDICT=$(echo "$PROMPT_CONTENT" | proof-agent-verify-byok) || COPILOT_EXIT=$?
    
    if [ "$COPILOT_EXIT" -ne 0 ]; then
        echo "⚠️ BYOK verification failed (exit $COPILOT_EXIT)"
        echo "Error output:"
        echo "$VERDICT"
        echo ""
        echo "Falling back to manual review mode"
        VERDICT="### PARTIAL\nBYOK verification failed (exit $COPILOT_EXIT).\nError: $VERDICT\n\nSee verification_prompt.txt for the full prompt."
        VERDICT=$(printf '%b' "$VERDICT")
    fi
else
    # Default GitHub Copilot SDK path. GitHub Models/gh-models is deprecated.
    COPILOT_MODEL="${PROOF_AGENT_COPILOT_MODEL:-${PROOF_AGENT_MODEL:-auto}}"
    
    echo "📝 Sending verification prompt via GitHub Copilot SDK ($COPILOT_MODEL)..."
    echo ""
    
    COPILOT_EXIT=0
    VERDICT=$(echo "$PROMPT_CONTENT" | proof-agent-verify-copilot 2>&1) || COPILOT_EXIT=$?
    
    if [ "$COPILOT_EXIT" -ne 0 ]; then
        echo "⚠️ Copilot SDK verification failed (exit $COPILOT_EXIT)"
        echo "Error output:"
        echo "$VERDICT"
        echo ""
        echo "Falling back to manual review mode — prompt saved to verification_prompt.txt"
        echo "Review the prompt manually and assign a verdict."
        echo ""
        VERDICT="### PARTIAL\nCopilot SDK verification failed (exit $COPILOT_EXIT).\nError: $VERDICT\n\nSee verification_prompt.txt for the full prompt."
        VERDICT=$(printf '%b' "$VERDICT")
    fi
fi

# Save full verdict
echo "$VERDICT" > verdict.txt
echo "$VERDICT"
echo ""

# Parse verdict using the Python CLI (single source of truth)
VERDICT_TYPE=$(echo "$VERDICT" | proof-agent-parse-verdict)

case "$VERDICT_TYPE" in
    PASS)    echo "✅ Verification: PASS" ;;
    FAIL)    echo "❌ Verification: FAIL" ;;
    PARTIAL) echo "⚠️ Verification: PARTIAL" ;;
    *)       VERDICT_TYPE="PARTIAL"; echo "⚠️ Verification: PARTIAL (unexpected parse result)" ;;
esac

# Set outputs
echo "verdict=$VERDICT_TYPE" >> $GITHUB_OUTPUT
echo "summary<<EOF" >> $GITHUB_OUTPUT
echo "$VERDICT" >> $GITHUB_OUTPUT
echo "EOF" >> $GITHUB_OUTPUT

# Post as PR comment if requested
if [ "$INPUT_POST_COMMENT" = "true" ] && [ -n "$PR_NUMBER" ]; then
    echo ""
    echo "💬 Posting verification result as PR comment..."
    
    # Get comment mode and max length
    COMMENT_MODE="${INPUT_COMMENT_MODE:-collapse}"
    MAX_LENGTH="${INPUT_MAX_COMMENT_LENGTH:-2000}"
    
    # Format verdict for PR comment based on mode
    case "$COMMENT_MODE" in
        summary)
            VERDICT_SUMMARY=$(echo "$VERDICT" | head -20)
            VERDICT_FORMATTED="$VERDICT_SUMMARY

<details>
<summary>Full analysis</summary>

\`\`\`
$VERDICT
\`\`\`

[View full output in action logs]($RUN_URL)
</details>"
            ;;
        collapse)
            VERDICT_FIRST_PARA=$(echo "$VERDICT" | head -10)
            VERDICT_FORMATTED="$VERDICT_FIRST_PARA

<details>
<summary>📋 Full verification details</summary>

\`\`\`
$VERDICT
\`\`\`
</details>

[🔗 View full logs]($RUN_URL)"
            ;;
        full)
            VERDICT_FORMATTED="$VERDICT"
            ;;
        *)
            VERDICT_FORMATTED="$VERDICT"
            ;;
    esac
    
    # Truncate if too long
    if [ ${#VERDICT_FORMATTED} -gt "$MAX_LENGTH" ]; then
        VERDICT_FORMATTED="${VERDICT_FORMATTED:0:$MAX_LENGTH}

...*[truncated]*

[📋 View full output in action logs]($RUN_URL)"
    fi
    
    # Verdict badge
    case "$VERDICT_TYPE" in
        PASS)    VERDICT_BADGE="✅ **PASS**" ;;
        FAIL)    VERDICT_BADGE="❌ **FAIL**" ;;
        PARTIAL) VERDICT_BADGE="⚠️ **PARTIAL**" ;;
        SKIP)    VERDICT_BADGE="⏭️ **SKIPPED**" ;;
        *)       VERDICT_BADGE="❓ **$VERDICT_TYPE**" ;;
    esac
    
    # Provider info for BYOK
    PROVIDER_INFO=""
    if [ -n "$PROOF_AGENT_PROVIDER_BASE_URL" ]; then
        PROVIDER_MODEL="${PROOF_AGENT_MODEL:-custom model}"
        PROVIDER_INFO="*Verified using [Proof Agent](https://github.com/AndreaGriffiths11/proof-agent) with $PROVIDER_MODEL*"
    else
        PROVIDER_INFO="*Verified using [Proof Agent](https://github.com/AndreaGriffiths11/proof-agent) with GitHub Copilot*"
    fi
    
    COMMENT_BODY="## 🤖 Proof Agent Verification

$VERDICT_BADGE

$VERDICT_FORMATTED

---
$PROVIDER_INFO"
    
    curl -X POST \
      -H "Accept: application/vnd.github+json" \
      -H "Authorization: Bearer ${INPUT_GITHUB_TOKEN}" \
      -H "X-GitHub-Api-Version: 2022-11-28" \
      "https://api.github.com/repos/$GITHUB_REPOSITORY/issues/$PR_NUMBER/comments" \
      -d "{\"body\":$(echo "$COMMENT_BODY" | jq -Rs .)}" \
      && echo "✅ Comment posted!" \
      || echo "⚠️ Could not post PR comment"
fi

# Block merge if FAIL and block-on-fail is true
if [ "$VERDICT_TYPE" = "FAIL" ] && [ "$INPUT_BLOCK_ON_FAIL" = "true" ]; then
    echo ""
    echo "🚫 Blocking merge due to verification failure"
    exit 1
fi

echo ""
echo "✨ Verification complete!"
