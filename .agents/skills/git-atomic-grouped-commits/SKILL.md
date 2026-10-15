---
name: git-atomic-grouped-commits
description: Create atomic git commits per feature or fix followed by an empty summary/grouping commit and push. Use when organizing related fixes or changes into structured individual commits with a final summary commit and push.
---

# Git Atomic Grouped Commits Workflow

A workflow to guide the creation of multiple atomic commits per file/change, followed by an overarching summary commit and push.

## When to Use
Use when organizing complex changes or security fixes into individual atomic commits with a final summary/grouping commit and pushing to remote.

## Steps

1. **Create atomic commits for individual changes:**
   Add and commit each specific file or set of files representing a distinct change using Conventional Commits.

   ```bash
   git add <file>
   git commit -m "<type>(<scope>): <description>"
   ```

2. **Create the final summary commit:**
   Use an empty commit (`--allow-empty`) with a detailed description listing all components resolved or added.

   ```bash
   git commit --allow-empty -m "<type>(<scope>): <summary title>" \
     -m "- <Detail 1>" \
     -m "- <Detail 2>" \
     -m "- <Detail 3>"
   ```

3. **Push to remote branch:**

   ```bash
   git push origin <branch-name>
   ```
