import type {
  CapabilityPort,
  AppPermission,
  PlatformCapabilities,
} from '../../../core/ports';

const PERMISSION_MAP: Partial<Record<AppPermission, string>> = {
  microphone: 'microphone',
  'clipboard-read': 'clipboard-read',
  'clipboard-write': 'clipboard-write',
};

export class BrowserCapabilityAdapter implements CapabilityPort {
  getCapabilities(): PlatformCapabilities {
    const anyWindow = window as any;
    return {
      platform: 'browser',
      isOnline: navigator.onLine,
      supportsStreaming: true,
      supportsSpeechRecognition: !!(
        anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition
      ),
      supportsSpeechSynthesis: 'speechSynthesis' in window,
    };
  }

  async hasPermission(permission: AppPermission): Promise<boolean> {
    if (!navigator.permissions) {
      if (permission === 'network') return navigator.onLine;
      if (permission === 'speech-synthesis') return 'speechSynthesis' in window;
      return false;
    }

    const permissionName = PERMISSION_MAP[permission];
    if (!permissionName) {
      if (permission === 'network') return navigator.onLine;
      if (permission === 'speech-synthesis') return 'speechSynthesis' in window;
      return false;
    }

    try {
      const status = await navigator.permissions.query({
        name: permissionName,
      } as any);
      return status.state === 'granted';
    } catch (_) {
      return false;
    }
  }

  async requestPermission(permission: AppPermission): Promise<boolean> {
    if (permission === 'microphone') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop());
        return true;
      } catch (_) {
        return false;
      }
    }

    return this.hasPermission(permission);
  }
}
