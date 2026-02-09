import type {
  TranslationGatewayPort,
  TranslationGatewayRequest,
  TranslationGatewayResponse,
} from '../../ports/translating';

export class TranslationService {
  constructor(
    private readonly translationGatewayPort: TranslationGatewayPort,
  ) {}

  async call(
    request: TranslationGatewayRequest,
  ): Promise<TranslationGatewayResponse> {
    return this.translationGatewayPort.call(request);
  }
}
