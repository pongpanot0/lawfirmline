# GitHub Actions deploy: prod tags only

Deploy workflow (`.github/workflows/deploy.yml`) no longer runs on `main` push or `workflow_dispatch`.

Triggers only on tag push matching:
- `prod`
- `prod-*`

Example:
```bash
git tag prod
git push origin prod
# or
git tag prod-1.0.0
git push origin prod-1.0.0
```
