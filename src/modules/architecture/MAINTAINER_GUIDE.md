## Maintainer Guide

This guide is for future contributors who did not participate in the refactor.
Follow this to avoid breaking the core/adapter boundaries.

## One-Minute Rule

- Feature logic goes to `core/services`.
- Platform API calls go to `adapters/<platform>`.
- Glue code goes to `bootstrap`.
- If unsure, add a port first and keep business logic out of adapters.

## Change Workflow

1. Define or extend a port in `core/ports`.
2. Update every adapter implementation of that port.
3. Keep orchestration in `core/services`.
4. Wire the service in `bootstrap/defaultAdapters.ts` or `serviceFactory.ts`.
5. Refactor caller modules to use the service, not platform APIs.
6. Verify compile/build/lint.

## Existing Wiring Entry Points

- Default browser wiring:
  - `src/modules/architecture/bootstrap/defaultAdapters.ts`
- Reusable factory for other runtimes:
  - `src/modules/architecture/bootstrap/serviceFactory.ts`

## Current Service Surface

- `listeningService`: microphone capture and recognition flow
- `speakingService`: text-to-speech voice synthesis
- `audioPlaybackService`: blob/url/buffer playback and decode duration
- `speechBoundaryService`: silent speech boundary callbacks for word highlight
- `readingService`: selection reading and word checks
- `writingService`: clipboard and text insertion
- `networkPolicyService`: timeout/retry-aware network execution
- `translationService`: translation gateway entry
- `languageRoutingService`: multilingual target language routing

## Platform Adaptation Playbook

### Android (WebView/Capacitor style)

- Implement adapters in `adapters/android`.
- Bridge to native permissions for microphone/clipboard in `CapabilityPort`.
- Keep translation/network logic behind `NetworkPolicyPort`.
- Keep TTS behind `TtsPort` (native or web fallback).

### iOS (WKWebView style)

- Implement adapters in `adapters/ios`.
- Route permission checks and media through native bridge adapters.
- Keep same core services; replace only adapter bundle.

### Windows (desktop web container or native shell)

- Implement adapters in `adapters/windows`.
- Reuse core services and port contracts.
- Keep OS-specific input/clipboard behavior inside adapter layer.

## Edge Cases That Must Stay in Adapter Layer

- Permission denial and re-prompt behavior
- App/background lifecycle affecting audio playback
- Clipboard API availability differences
- Selection behavior in iframe/shadow DOM/contenteditable
- Network timeout/retry strategy tied to platform transport
- AudioContext lifecycle and audio decode/playback details

## PR Checklist

- No direct `window/document/navigator/browser` in `core/services`
- Port signatures remain platform-neutral
- Existing adapters still compile
- New/changed service is wired in bootstrap
- Changed callsites no longer bypass ports

## Known Global Lint Caveat

- Current repo-wide `npm run lint` fails because of formatting issues in
  `debug-translation.mjs` (legacy file not part of this refactor).
- For refactor validation, run targeted lint on changed architecture and
  migrated modules in addition to compile/build.
