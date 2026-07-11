# Setup

Sentinel needs one secret to run against this repository: an Anthropic API key.
The GitHub token it uses to read PRs and post comments is provided automatically by GitHub Actions as `secrets.GITHUB_TOKEN` - you do not need to create it.

## Add `ANTHROPIC_API_KEY` as a repository secret

1. Get an Anthropic API key from the [Anthropic Console](https://console.anthropic.com/) (API keys section).
2. In this repository on GitHub, go to **Settings -> Secrets and variables -> Actions**.
3. Under the **Secrets** tab, click **New repository secret**.
4. Set:
   - **Name:** `ANTHROPIC_API_KEY`
   - **Secret:** paste your Anthropic API key.
5. Click **Add secret**.

The dogfooding workflow ([`.github/workflows/sentinel-self.yml`](../.github/workflows/sentinel-self.yml)) reads this secret as `${{ secrets.ANTHROPIC_API_KEY }}`.
Once the secret is set, opening a pull request against this repo will trigger a Sentinel review.

## Security notes

- **Never commit the API key** to the repository - not in workflow files, code, or docs. It belongs only in the repository secret store.
- Repository secrets are not exposed to workflows triggered by pull requests from forks, so Sentinel will not run on fork PRs until the key is available (this is expected and safe).
- If a key is ever exposed, rotate it immediately in the Anthropic Console and update the repository secret.

## Verifying the setup

1. Open a pull request against this repo.
2. Check the **Actions** tab for the **Sentinel (self)** workflow run.
3. On success, Sentinel posts (or updates) a single review comment on the PR.
   Its structured logs appear in the workflow run output, each line prefixed with `sentinel:`.
