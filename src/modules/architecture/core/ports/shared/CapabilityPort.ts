export type AppPlatform = 'browser' | 'android' | 'ios' | 'windows' | 'unknown';

export type AppPermission =
  | 'microphone'
  | 'clipboard-read'
  | 'clipboard-write'
  | 'speech-synthesis'
  | 'network';

export interface PlatformCapabilities {
  platform: AppPlatform;
  isOnline: boolean;
  supportsStreaming: boolean;
  supportsSpeechRecognition: boolean;
  supportsSpeechSynthesis: boolean;
}

export interface CapabilityPort {
  getCapabilities(): Promise<PlatformCapabilities> | PlatformCapabilities;
  hasPermission(permission: AppPermission): Promise<boolean>;
  requestPermission(permission: AppPermission): Promise<boolean>;
}
