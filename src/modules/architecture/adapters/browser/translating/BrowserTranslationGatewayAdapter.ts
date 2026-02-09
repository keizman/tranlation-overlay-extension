import type {
  TranslationGatewayPort,
  TranslationGatewayRequest,
  TranslationGatewayResponse,
} from '../../../core/ports';

export class BrowserTranslationGatewayAdapter
  implements TranslationGatewayPort
{
  async call(
    request: TranslationGatewayRequest,
  ): Promise<TranslationGatewayResponse> {
    const { callAI } = await import(
      '@/src/modules/extension/api/services/UniversalApiService'
    );

    const result = await callAI(request.prompt, {
      systemPrompt: request.systemPrompt,
      timeout: request.timeoutMs,
      customParams: request.customParams,
      rawResponse: true,
    });

    return {
      success: result.success,
      content: result.content,
      error: result.error,
      rawData: result.rawData,
    };
  }
}
