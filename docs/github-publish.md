# GitHub Publish

## Goal

Publish `vibecodingworkflow` as an independent repository without mixing it with the parent workspace history.

## Minimum Steps

```bash
cd /Users/beckliu/Documents/0agentproject2026/googledrivesyn/skills/vibecodingworkflow
git status
git remote add origin <your-github-repo-url>
git push -u origin main
```

## Notes

- this directory already has its own `.git`
- pushing this repository will not push the parent workspace history
- configure remote only after confirming the target GitHub repo name and visibility
