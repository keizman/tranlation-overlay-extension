## Architecture Checklist

Use this checklist before merging refactor-related changes.

## Layer Rules

- No direct `window/document/navigator/browser` in `core/services`.
- No business branching logic in `adapters/*`.
- All platform capabilities are accessed through `ports`.
- Service composition happens only in `bootstrap`.

## Change Rules

- If adding a capability, add:
  - `port` interface
  - at least one adapter implementation
  - bootstrap wiring
  - caller migration to service
- If changing a port signature:
  - update every adapter
  - update `serviceFactory`
  - re-run compile/build

## Verification Commands

- `npm run -s compile`
- `npm run -s build`
- `npx eslint src/modules/architecture/**/*.ts ...` (targeted changed files)
- Optional repo lint:
  - `npm run -s lint`
  - expected current failure: `debug-translation.mjs` formatting

## Smoke Validation Flows

- Word/paragraph click pronunciation still works.
- Paragraph double-click TTS still highlights progressively.
- Full text TTS: play/pause/resume/next/prev works.
- Word card TTS still works for API audio + fallback path.
- Translation requests still succeed in direct/background proxy paths.
