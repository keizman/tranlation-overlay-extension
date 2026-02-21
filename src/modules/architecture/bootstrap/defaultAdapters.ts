import {
  BrowserAudioInputAdapter,
  BrowserAudioPlaybackAdapter,
  BrowserCapabilityAdapter,
  BrowserClipboardAdapter,
  BrowserNetworkPolicyAdapter,
  BrowserPageLanguageAdapter,
  BrowserPageContentAdapter,
  BrowserRuntimeMessagingAdapter,
  BrowserSelectionAdapter,
  BrowserSpeechBoundaryAdapter,
  BrowserSyncSettingsStorageAdapter,
  BrowserTextInjectionAdapter,
  BrowserTranslationGatewayAdapter,
  BrowserTtsAdapter,
} from '../adapters/browser';
import {
  LanguageRoutingService,
  AudioPlaybackService,
  ListeningService,
  NetworkPolicyService,
  ReadingService,
  SpeechBoundaryService,
  SpeakingService,
  TranslationService,
  WritingService,
} from '../core/services';

export const syncSettingsStoragePort = new BrowserSyncSettingsStorageAdapter();
export const runtimeMessagingPort = new BrowserRuntimeMessagingAdapter();
export const pageLanguagePort = new BrowserPageLanguageAdapter();
export const audioInputPort = new BrowserAudioInputAdapter();
export const audioPlaybackPort = new BrowserAudioPlaybackAdapter();
export const speechBoundaryPort = new BrowserSpeechBoundaryAdapter();
export const ttsPort = new BrowserTtsAdapter();
export const selectionPort = new BrowserSelectionAdapter();
export const pageContentPort = new BrowserPageContentAdapter();
export const clipboardPort = new BrowserClipboardAdapter();
export const textInjectionPort = new BrowserTextInjectionAdapter();
export const networkPolicyPort = new BrowserNetworkPolicyAdapter();
export const translationGatewayPort = new BrowserTranslationGatewayAdapter();
export const capabilityPort = new BrowserCapabilityAdapter();

export const languageRoutingService = new LanguageRoutingService(
  pageLanguagePort,
);
export const listeningService = new ListeningService(
  audioInputPort,
  capabilityPort,
);
export const speakingService = new SpeakingService(ttsPort);
export const audioPlaybackService = new AudioPlaybackService(audioPlaybackPort);
export const speechBoundaryService = new SpeechBoundaryService(
  speechBoundaryPort,
);
export const readingService = new ReadingService(
  selectionPort,
  pageLanguagePort,
);
export const writingService = new WritingService(
  clipboardPort,
  textInjectionPort,
);
export const networkPolicyService = new NetworkPolicyService(networkPolicyPort);
export const translationService = new TranslationService(
  translationGatewayPort,
);
