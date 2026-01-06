/**
 * Google Gemini 翻译提供者
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import { FullTextAnalysisResponse } from '../../shared/types/api';
import { UserSettings } from '../../shared/types/storage';
import { BaseProvider } from '../base/BaseProvider';
import { mergeCustomParams } from '../utils/apiUtils';
import { addPositionsToReplacements } from '../utils/textUtils';
import { getSystemPromptByConfig } from '../../core/translation/PromptService';
import { getApiTimeout, mapParamsForProvider } from '@/src/utils';
import { rateLimitManager } from '../../infrastructure/ratelimit';
import { StructuredTextParser } from '../utils/structuredTextParser';
import { languageService } from '../../core/translation/LanguageService';

/**
 * Google Gemini API 提供者实现
 */
export class GoogleGeminiProvider extends BaseProvider {
  protected getProviderName(): string {
    return 'Google Gemini';
  }

  protected async doAnalyzeFullText(
    text: string,
    settings: UserSettings,
  ): Promise<FullTextAnalysisResponse> {
    const genAI = new GoogleGenerativeAI(this.config.apiKey);

    // 基础生成配置
    const baseGenerationConfig: any = {
      temperature: this.config.temperature,
    };

    // 从 customParams 合并额外参数
    let generationConfig = mergeCustomParams(
      baseGenerationConfig,
      this.config.customParams,
    );

    // 适配参数
    generationConfig = mapParamsForProvider(generationConfig, 'gemini');

    // 请求选项，如超时和代理端点
    const requestOptions: { timeout?: number; baseUrl?: string } = {};
    const timeout = getApiTimeout(settings.apiRequestTimeout);
    if (timeout) {
      requestOptions.timeout = timeout;
    }
    if (this.config.apiEndpoint) {
      requestOptions.baseUrl = this.config.apiEndpoint;
    }

    const model = genAI.getGenerativeModel(
      {
        model: this.config.model,
        generationConfig,
      },
      requestOptions,
    );

    const systemPrompt = getSystemPromptByConfig({
      targetLanguage: settings.multilingualConfig.targetLanguage,
      userLevel: settings.userLevel,
      replacementRate: settings.replacementRate,
      provider: 'gemini', // 指定为gemini获取特定prompt
    });

    const prompt = `${systemPrompt}\n\nTranslate to ${languageService.getTargetLanguageDisplayName(settings.multilingualConfig.targetLanguage)} (original||translation): ${text}`;
    const rateLimiter = rateLimitManager.getLimiter(
      this.config.apiEndpoint || 'google-gemini-native',
      this.config.requestsPerSecond || 0,
      true,
    );

    const apiRequestFunction = () => model.generateContent(prompt);

    const [result] = await rateLimiter.executeBatch([apiRequestFunction]);
    const response = result.response;
    const responseText = response.text();

    // 使用结构化文本解析器
    const parseResult = StructuredTextParser.parse(responseText);

    if (!parseResult.success) {
      console.error('[Gemini] 解析失败:', parseResult.errors);
      throw new Error(`结构化文本解析失败: ${parseResult.errors.join(', ')}`);
    }

    // 方案D: 过滤掉不以完整单词形式出现在原文中的翻译项
    const validatedReplacements = parseResult.replacements.filter((rep) => {
      if (!rep.original || rep.original.length < 2) {
        console.warn('[Gemini] 过滤掉过短的原文:', rep.original);
        return false;
      }
      // 转义正则特殊字符
      const escapedOriginal = rep.original.replace(
        /[.*+?^${}()|[\]\\]/g,
        '\\$&',
      );
      // 使用单词边界检查原文是否以完整单词形式存在
      const wordBoundaryRegex = new RegExp(`\\b${escapedOriginal}\\b`, 'i');
      const isValid = wordBoundaryRegex.test(text);
      if (!isValid) {
        console.warn(
          '[Gemini] 过滤掉非完整单词匹配:',
          rep.original,
          '->',
          rep.translation,
        );
      }
      return isValid;
    });

    const replacements = addPositionsToReplacements(
      text,
      validatedReplacements,
    );

    return {
      original: text,
      processed: '',
      replacements,
    };
  }
}
