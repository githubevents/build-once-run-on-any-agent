# GitHub Models Access Setup

Proof Agent uses GitHub Models by default. In many repositories, the built-in `secrets.GITHUB_TOKEN` works as long as the workflow requests `models: read`.

## Default setup

```yaml
name: Proof Agent Verification

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  models: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Verify PR with Proof Agent
        uses: AndreaGriffiths11/proof-agent@main
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Optional fallback: dedicated models token

If your repository or organization does not allow GitHub Models access through the default workflow token, Proof Agent also supports a separate `models-token` input.

### 1. Create a token with repository access and `Models: Read`

1. Go to **GitHub Settings > Personal Access Tokens**
2. Create a token that can read the target repository and access GitHub Models
3. Copy the token value

### 2. Add it as a repository secret

1. Go to **Settings > Secrets and variables > Actions**
2. Create a secret named `GH_MODELS_TOKEN`

### 3. Pass it to the action

```yaml
- name: Verify PR with Proof Agent
  uses: AndreaGriffiths11/proof-agent@main
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    models-token: ${{ secrets.GH_MODELS_TOKEN }}
```

## Troubleshooting

If you get model access errors:

1. Confirm the workflow includes `models: read`
2. Confirm GitHub Models is enabled for your account/org
3. If the built-in token still fails, provide `models-token`
