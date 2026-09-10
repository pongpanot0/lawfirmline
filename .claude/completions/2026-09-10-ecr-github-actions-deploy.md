# Completion: ECR + GitHub Actions deploy wiring

**Date**: 2026-09-10

## Done
- `docker-compose.prod.yml`: `image:` from ECR (`ECR_REGISTRY` + `IMAGE_TAG`); kept `build:` for local fallback
- `.env.production.example`: `ECR_REGISTRY`, `IMAGE_TAG`
- `.github/workflows/deploy.yml`: arm runner → ECR → SSH deploy
- README deploy section updated for EC2/ECR flow

## Operator follow-up
1. Update `.env` on EC2 with `ECR_REGISTRY` / `IMAGE_TAG`
2. Create IAM (not root) for CI push + EC2 pull
3. Add GitHub secrets listed in README
4. Push to `main` or run workflow_dispatch
