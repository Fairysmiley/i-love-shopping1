set -e

GITEA_URL="${GITEA_URL:-https://gitea.kood.tech/juliageorgieva/i-love-shopping1}"
GITHUB_URL="${GITHUB_URL:-https://github.com/Fairysmiley/i-love-shopping1}"
BRANCH="${1:-main}"

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
echo "Branch: $BRANCH"
if git rev-parse --verify "$BRANCH" &>/dev/null; then
  git checkout "$BRANCH"
  echo "  checked out existing $BRANCH"
else
  git checkout -b "$BRANCH"
  echo "  created and checked out $BRANCH"
fi

echo ""
echo "Pushing to origin (Gitea)..."
git push -u origin "$BRANCH"

echo ""
echo "Pushing to github..."
git push -u github "$BRANCH"

echo ""
echo "Done. $BRANCH pushed to both repos."

# echo "Merging to main..."
# git checkout main
# git pull origin main          # optional: sync main first
# git merge task2             # brings task2 into main (merge commit or fast-forward)
# # fix conflicts if Git reports any, then: git add … && git commit
# git push origin main        # Gitea, if that remote is origin
# git push github main 
# echo "Merged to main."
