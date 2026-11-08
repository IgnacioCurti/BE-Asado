---
name: git-conventions
description: Git and PR conventions for BE-Asado (branches, commit messages, PRs against main, deploy-dev label). Use before creating a branch, committing, pushing or opening/editing a PR.
---

# Git conventions

## Branches

- `main` is production. Every PR targets `main`.
- Feature branches start from an up-to-date `origin/main`:
  `git fetch origin && git switch -c t/<short-kebab-description> origin/main`.
- Prefix: `t/` (e.g. `t/devcontainer-claude-persist`, `t/fix-rebuild-dev-concurrency`).
- One topic per branch. If the current branch is already merged or unrelated to the change, create a new one instead of piling unrelated commits on it.

### `dev` is generated — never touch it

`dev` is rebuilt by `.github/workflows/rebuild-dev.yml` and force-pushed on every run.

- Never commit to, push to, branch from, or open PRs from/to `dev`. Anything there gets overwritten.

## Commits

- Subject in English, imperative mood, capitalized, no trailing period, ~70 chars max.
  Examples from history: `Move authorization rules to EventAccessPolicy`, `Close open event endpoints and resolve TOFIX items`.
- Optional body explaining the *why*, wrapped at ~72 chars.
- **No Claude attribution**: no `Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code" line. (Also disabled in `.claude/settings.json` via `attribution`.)
- Stage files explicitly (`git add <paths>`); don't sweep in unrelated untracked files with `git add -A`.
- Don't amend or force-push commits that are already in a PR under review unless asked; prefer `--force-with-lease` when a rewrite is needed on your own branch.

## Pull requests

- Base is always `main`: `gh pr create --base main --fill`.
- Description: what changed and why, plus how it was tested. No Claude attribution line.
- Merging is done by the user on GitHub.

## `deploy-dev` label (test on the dev environment)

`ejemplo-dev.vercel.app` (dev DB) deploys the `dev` branch, which the workflow rebuilds as:

```
dev = origin/main + every open PR against main labeled `deploy-dev`
```

The rebuild runs on push to `main`, on PR `labeled`/`unlabeled`/`synchronize`/`reopened`/`closed` events, and manually (`workflow_dispatch`). Runs are serialized (concurrency group `rebuild-dev`, newest wins).

- Put a PR on dev when creating it:
  `gh pr create --base main --fill --label deploy-dev`
- Add it later: `gh pr edit <n> --add-label deploy-dev`
- Remove it from dev: `gh pr edit <n> --remove-label deploy-dev`
- See what is on dev: `gh pr list --label deploy-dev`
- New pushes to a labeled PR redeploy dev automatically (`synchronize`).
- If a labeled branch conflicts with `main` or another labeled PR, the workflow **skips it** with a warning (check the Action run). Fix by rebasing/merging `main` into the branch.
- Only use the label when the change needs testing against the dev environment (API behavior, DB changes). Tooling-only changes (devcontainer, docs, `.claude/`) don't need it.
