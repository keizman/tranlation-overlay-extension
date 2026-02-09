import type {
  AudioInputPort,
  AudioRecognitionConfig,
  AudioRecognitionResult,
  AudioInputSession,
} from '../../ports/listening';
import type { CapabilityPort } from '../../ports/shared';
import { PortError, PortErrorCode } from '../../ports/shared';

export class ListeningService {
  private currentSession: AudioInputSession | null = null;

  constructor(
    private readonly audioInputPort: AudioInputPort,
    private readonly capabilityPort: CapabilityPort,
  ) {}

  isAvailable(): boolean {
    return this.audioInputPort.isAvailable();
  }

  async start(
    config: AudioRecognitionConfig,
    onResult: (result: AudioRecognitionResult) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    const hasPermission =
      await this.capabilityPort.requestPermission('microphone');
    if (!hasPermission) {
      throw new PortError(
        'Microphone permission denied',
        PortErrorCode.PERMISSION_DENIED,
      );
    }

    await this.stop();
    this.currentSession = await this.audioInputPort.startCapture(
      config,
      onResult,
      onError,
    );
  }

  async stop(): Promise<void> {
    if (this.currentSession) {
      this.currentSession.stop();
      this.currentSession = null;
    }
    this.audioInputPort.stopCapture();
  }
}
