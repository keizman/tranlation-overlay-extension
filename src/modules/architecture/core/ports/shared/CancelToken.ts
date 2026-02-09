export interface CancelToken {
  isCancelled(): boolean;
  onCancel(listener: () => void): () => void;
}

export class ManualCancelToken implements CancelToken {
  private cancelled = false;
  private listeners = new Set<() => void>();

  isCancelled(): boolean {
    return this.cancelled;
  }

  onCancel(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  cancel(): void {
    if (this.cancelled) return;
    this.cancelled = true;
    this.listeners.forEach((listener) => listener());
    this.listeners.clear();
  }
}
