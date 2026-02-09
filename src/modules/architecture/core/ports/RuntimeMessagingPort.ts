export interface RuntimeMessagingPort {
  queryTabs(options?: Record<string, unknown>): Promise<any[]>;
  sendToTab<TMessage = unknown, TResponse = unknown>(
    tabId: number,
    message: TMessage,
  ): Promise<TResponse>;
  sendToRuntime<TMessage = unknown, TResponse = unknown>(
    message: TMessage,
  ): Promise<TResponse>;
}
