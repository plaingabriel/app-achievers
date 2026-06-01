# Phase 12 — CI/CD with GitHub Actions  [SECOND-TO-LAST]

> **Order note:** this is the **second-to-last** phase. Do not scaffold GitHub Actions before here.

## Goal
Add CI (lint/typecheck/build) and SSH deploy. NOT scaffolded earlier — do it here.

## Batch (small, do in order)
1. CI on every push: corepack pnpm → install (frozen) → `biome ci` → typecheck → build.
2. Deploy on push to main (after CI): SSH to droplet, build, backup, migrate, `pm2 reload`, health check + rollback.
3. Store secrets in GitHub Actions secrets; never in logs.

## Files
`.github/workflows/ci.yml (new), .github/workflows/deploy.yml (new)`

## How to validate
- A PR runs CI; a failing Biome/type/build blocks merge.
- Pushing to main deploys and the post-deploy `/api/healthz` check passes.
- A simulated failed health check triggers rollback.
