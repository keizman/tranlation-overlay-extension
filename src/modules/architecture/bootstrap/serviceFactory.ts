import type {
  AudioPlaybackPort,
  AudioInputPort,
  CapabilityPort,
  ClipboardPort,
  NetworkPolicyPort,
  PageLanguagePort,
  RuntimeMessagingPort,
  SelectionPort,
  SettingsStoragePort,
  SpeechBoundaryPort,
  TextInjectionPort,
  TranslationGatewayPort,
  TtsPort,
} from '../core/ports';
import {
  AudioPlaybackService,
  LanguageRoutingService,
  ListeningService,
  NetworkPolicyService,
  ReadingService,
  SpeechBoundaryService,
  SpeakingService,
  TranslationService,
  WritingService,
} from '../core/services';

export interface AdapterBundle {
  settingsStoragePort: SettingsStoragePort;
  runtimeMessagingPort: RuntimeMessagingPort;
  pageLanguagePort: PageLanguagePort;
  audioInputPort: AudioInputPort;
  audioPlaybackPort: AudioPlaybackPort;
  speechBoundaryPort: SpeechBoundaryPort;
  ttsPort: TtsPort;
  selectionPort: SelectionPort;
  clipboardPort: ClipboardPort;
  textInjectionPort: TextInjectionPort;
  networkPolicyPort: NetworkPolicyPort;
  translationGatewayPort: TranslationGatewayPort;
  capabilityPort: CapabilityPort;
}

export function createArchitectureServices(adapters: AdapterBundle) {
  const languageRoutingService = new LanguageRoutingService(
    adapters.pageLanguagePort,
  );
  const listeningService = new ListeningService(
    adapters.audioInputPort,
    adapters.capabilityPort,
  );
  const speakingService = new SpeakingService(adapters.ttsPort);
  const audioPlaybackService = new AudioPlaybackService(
    adapters.audioPlaybackPort,
  );
  const speechBoundaryService = new SpeechBoundaryService(
    adapters.speechBoundaryPort,
  );
  const readingService = new ReadingService(
    adapters.selectionPort,
    adapters.pageLanguagePort,
  );
  const writingService = new WritingService(
    adapters.clipboardPort,
    adapters.textInjectionPort,
  );
  const networkPolicyService = new NetworkPolicyService(
    adapters.networkPolicyPort,
  );
  const translationService = new TranslationService(
    adapters.translationGatewayPort,
  );

  return {
    languageRoutingService,
    listeningService,
    speakingService,
    audioPlaybackService,
    speechBoundaryService,
    readingService,
    writingService,
    networkPolicyService,
    translationService,
  };
}
