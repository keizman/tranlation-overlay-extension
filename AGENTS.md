# Local Agent Rules

## Mandatory Pre-Read For Architecture Work

When modifying files under `src/modules/`, read these first:

1. `src/modules/architecture/README.md`
2. `src/modules/architecture/MAINTAINER_GUIDE.md`
3. `src/modules/architecture/ARCHITECTURE_CHECKLIST.md`

Do not start coding before reading them.

## Architecture Rules (Hard Constraints)

1. `src/modules/architecture/core/services` must not directly use platform APIs:
   - forbidden: `window`, `document`, `navigator`, `browser`, `AudioContext`, `speechSynthesis`, direct `fetch` for business modules.
2. Platform-specific code must live in `src/modules/architecture/adapters/<platform>/`.
3. Feature/business modules (`src/modules/content`, `src/modules/read`, `src/modules/listen`, etc.) should call services from:
   - `src/modules/architecture/bootstrap/defaultAdapters.ts`
4. If a platform capability is needed, add in order:
   - port (`src/modules/architecture/core/ports/...`)
   - service (`src/modules/architecture/core/services/...`)
   - adapter (`src/modules/architecture/adapters/<platform>/...`)
   - bootstrap wiring (`src/modules/architecture/bootstrap/...`)
5. Do not bypass an existing port/service with direct platform calls.

## Validation Rules

For architecture-related changes, run:

1. `npm run -s compile`
2. `npm run -s build`
3. targeted eslint for changed architecture/feature files

## Known Lint Caveat

- Repo-wide `npm run -s lint` may fail due legacy formatting issues in
  `debug-translation.mjs`.
- Treat that as a known pre-existing issue unless your diff changed that file.
