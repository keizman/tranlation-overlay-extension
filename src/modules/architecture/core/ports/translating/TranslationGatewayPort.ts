export interface TranslationGatewayRequest {
  prompt: string;
  systemPrompt?: string;
  timeoutMs?: number;
  customParams?: string;
}

export interface TranslationGatewayResponse {
  success: boolean;
  content: string;
  error?: string;
  rawData?: unknown;
}

export interface TranslationGatewayPort {
  call(request: TranslationGatewayRequest): Promise<TranslationGatewayResponse>;
}
