#!/usr/bin/env bash
# Push Villi to Gitea (origin) and GitHub (github).
#
# Default: local and remote branch **main**.
#   ./push-to-repos.sh
#
# Push a different branch (same name on both remotes):
#   ./push-to-repos.sh task2
#
set -euo pipefail

GITEA_URL="${GITEA_URL:-https://gitea.kood.tech/juliageorgieva/i-love-shopping1}"
GITHUB_URL="${GITHUB_URL:-https://github.com/Fairysmiley/i-love-shopping1}"
DEFAULT_BRANCH="main"
BRANCH="${1:-$DEFAULT_BRANCH}"

cd "$(git rev-parse --show-toplevel)"

echo "Remotes:"
if ! git remote get-url origin &>/dev/null; then
  git remote add origin "$GITEA_URL"
  echo "  added origin -> $GITEA_URL"
else
  echo "  origin -> $(git remote get-url origin)"
fi

if ! git remote get-url github &>/dev/null; then
  git remote add github "$GITHUB_URL"
  echo "  added github -> $GITHUB_URL"
else
  echo "  github -> $(git remote get-url github)"
fi

echo ""
echo "Target branch: $BRANCH (default: $DEFAULT_BRANCH)"
if git rev-parse --verify "$BRANCH" &>/dev/null; then
  git checkout "$BRANCH"
  echo "  checked out existing $BRANCH"
else
  git checkout -b "$BRANCH"
  echo "  created and checked out $BRANCH from current HEAD"
fi

echo ""
echo "Pushing $BRANCH -> origin (Gitea) refs/heads/$BRANCH ..."
git push -u origin "$BRANCH"

echo ""
echo "Pushing $BRANCH -> github refs/heads/$BRANCH ..."
git push -u github "$BRANCH"

echo ""
echo "Done. Branch '$BRANCH' is on both remotes (remote branch name: $BRANCH)."
