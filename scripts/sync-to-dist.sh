#!/bin/bash
# 同步三个交付文件到发布仓库并 push 到 GitHub

SRC="/Users/beckliu/Documents/0agentproject2026/vibecodingworkflow"
DIST="/Users/beckliu/Documents/0agentproject2026/1paperprdasprompt"

# 复制三个文件
cp "$SRC/1paperprdasprompt.md" "$DIST/1paperprdasprompt.md"
cp "$SRC/docs/user-guide.md"   "$DIST/user-guide.md"
cp "$SRC/docs/user-guide.html" "$DIST/user-guide.html"

# 进入发布仓库提交并推送
cd "$DIST"

git config user.email "238820539+qi9zg202-source@users.noreply.github.com"
git config user.name "qi9zg202-source"

git add 1paperprdasprompt.md user-guide.md user-guide.html

# 只有有变更才提交
if ! git diff --cached --quiet; then
  COMMIT_MSG=$(cd "$SRC" && git log -1 --pretty="%s")
  git commit -m "sync: $COMMIT_MSG"
  git push origin main
  echo "[dist] synced and pushed to GitHub"
else
  echo "[dist] no changes, skip"
fi
