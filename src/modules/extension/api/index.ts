/**
 * API 模块统一导出
 */

// 类型和接口
export { ITranslationProvider } from './types';

// 工厂和服务
export { ApiServiceFactory } from './factory/ApiServiceFactory';
export {
  UniversalApiService,
  universalApi,
  callAI,
  quickAI,
  type UniversalApiOptions,
  type UniversalApiResult,
} from './services/UniversalApiService';

// 提供者
export { GoogleGeminiProvider, OpenAIProvider } from './providers';

// 基础类
export { BaseProvider } from './base/BaseProvider';

// 工具函数
export {
  mergeCustomParams,
  createErrorResponse,
  validateInputs,
} from './utils/apiUtils';
export { addPositionsToReplacements } from './utils/textUtils';
export { sendApiRequest } from './utils/requestUtils';
