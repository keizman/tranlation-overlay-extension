## Architecture Overview

This directory isolates business rules (`core`) from platform APIs (`adapters`).
The same core should run with browser, Android WebView, iOS WKWebView, or
Windows adapters by replacing only bootstrap wiring.

## Folder Map

- `core/ports`: platform-neutral contracts.
- `core/services`: business orchestration that depends only on ports.
- `adapters/browser`: browser implementations for all ports.
- `adapters/app`: app-specific bridge adapters (non-port, optional capabilities).
- `bootstrap/defaultAdapters.ts`: current runtime composition root.
- `bootstrap/serviceFactory.ts`: helper to create services from custom adapters.

## Capability Mapping (听说读写译)

- `listening`
  - port: `core/ports/listening/AudioInputPort.ts`
  - service: `core/services/listening/ListeningService.ts`
  - browser adapter: `adapters/browser/listening/BrowserAudioInputAdapter.ts`
- `speaking`
  - ports: `core/ports/speaking/TtsPort.ts`, `core/ports/speaking/AudioPlaybackPort.ts`, `core/ports/speaking/SpeechBoundaryPort.ts`
  - services: `core/services/speaking/SpeakingService.ts`, `core/services/speaking/AudioPlaybackService.ts`, `core/services/speaking/SpeechBoundaryService.ts`
  - browser adapters: `adapters/browser/speaking/BrowserTtsAdapter.ts`, `adapters/browser/speaking/BrowserAudioPlaybackAdapter.ts`, `adapters/browser/speaking/BrowserSpeechBoundaryAdapter.ts`
- `reading`
  - ports: `core/ports/reading/SelectionPort.ts`, `core/ports/reading/PageContentPort.ts`
  - service: `core/services/reading/ReadingService.ts`
  - browser adapters: `adapters/browser/reading/*`
- `writing`
  - ports: `core/ports/writing/ClipboardPort.ts`, `core/ports/writing/TextInjectionPort.ts`
  - service: `core/services/writing/WritingService.ts`
  - browser adapters: `adapters/browser/writing/*`
- `translating`
  - ports: `core/ports/translating/TranslationGatewayPort.ts`, `core/ports/translating/NetworkPolicyPort.ts`
  - services: `core/services/translating/*`
  - browser adapters: `adapters/browser/translating/*`
- `app-native controls`
  - adapter: `adapters/app/AndroidAppNativeControlAdapter.ts`
  - use case: optional app bridge controls that must never break extension core flows.

## Guardrails (Do Not Break)

- `core/services` must not import `window`, `document`, `navigator`, `browser`.
- New platform behavior must start with a new port, then adapter, then bootstrap wiring.
- Do not bypass ports in feature code once a port already exists.
- If changing a port signature, update all adapters and bootstrap in the same PR.
- Business modules should call `bootstrap` services, not instantiate browser APIs directly.

## How to Add a New Platform

1. Create `adapters/<platform>/...` implementing existing ports.
2. Build an adapter bundle and call `createArchitectureServices(...)`.
3. Switch platform entrypoint/bootstrap to that bundle.
4. Run compile/build/lint and smoke test flows: settings, translation, TTS, selection.

## Migration Rule for Future Refactors

When touching old modules, move direct platform calls into the nearest port
instead of adding new direct calls. This keeps long-term migration cost flat.

## Companion Docs

- `MAINTAINER_GUIDE.md`: contributor onboarding and platform adaptation playbook.
- `ARCHITECTURE_CHECKLIST.md`: merge-time checklist and smoke validation flows.
