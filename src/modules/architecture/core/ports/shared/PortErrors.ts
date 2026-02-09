export enum PortErrorCode {
  PERMISSION_DENIED = 'permission_denied',
  CAPABILITY_MISSING = 'capability_missing',
  TRANSIENT_NETWORK = 'transient_network',
  FATAL_PLATFORM_ERROR = 'fatal_platform_error',
  CANCELLED = 'cancelled',
}

export class PortError extends Error {
  constructor(
    message: string,
    public readonly code: PortErrorCode,
    public readonly causeError?: unknown,
  ) {
    super(message);
    this.name = 'PortError';
  }

  isRetryable(): boolean {
    return this.code === PortErrorCode.TRANSIENT_NETWORK;
  }
}
