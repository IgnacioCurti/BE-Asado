# BE-Asado

Backend API for Food-Spot. Node.js, TypeScript, Express, MongoDB and Mongoose.

## Commands

- Install: `npm install`
- Build: `npm run build`
- Development: `npm run dev`

Verify commands against `package.json` before changing them.

## Working rules

- Inspect relevant files before editing; do not read the entire repository by default.
- Follow existing architecture and API contracts.
- Keep changes focused; avoid unrelated refactors.
- Enforce authorization and business rules on the backend.
- Check frontend compatibility for API contract changes.
- Add or update tests for meaningful behavior changes.
- Run relevant tests and the build before finishing.

## Context on demand

- Business rules: `.claude/be-asado-context/SKILL.md`
- API changes: `.claude/api-development/SKILL.md`
- Node/TypeScript: `.claude/node-typescript/SKILL.md`
- MongoDB/Mongoose: `.claude/mongodb-mongoose/SKILL.md`
- Testing: `.claude/testing/SKILL.md`
- Git, commits, PRs y label `deploy-dev`: `.claude/git-conventions/SKILL.md`

Inspect the actual repository structure before assuming file paths or architectural layers.
## Ramas y PRs
- `main` es producción. Todos los PRs van contra `main` (nunca contra `dev`).
- `dev` es una rama GENERADA por `.github/workflows/rebuild-dev.yml` (= main + PRs abiertos con label `deploy-dev`).
  Nunca commitear, pushear ni abrir PRs desde/hacia `dev`: se sobrescribe con force-push.
- Sin atribución de Claude en commits ni PRs (sin `Co-Authored-By: Claude`).
- Antes de crear ramas, commitear o abrir PRs, leer `.claude/git-conventions/SKILL.md`
  (convenciones de commits/ramas y uso del label `deploy-dev`).
