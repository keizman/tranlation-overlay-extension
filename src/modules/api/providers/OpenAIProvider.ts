/**
 * OpenAI 翻译提供者
 */

import { FullTextAnalysisResponse } from '../../shared/types/api';
import { UserSettings } from '../../shared/types/storage';
import { BaseProvider } from '../base/BaseProvider';
import { mergeCustomParams } from '../utils/apiUtils';
import { addPositionsToReplacements } from '../utils/textUtils';
import { sendApiRequest } from '../utils/requestUtils';
import { getSystemPromptByConfig } from '../../core/translation/PromptService';
import { getApiTimeout } from '@/src/utils';
import { rateLimitManager } from '../../infrastructure/ratelimit';
import { StructuredTextParser } from '../utils/structuredTextParser';
import { languageService } from '../../core/translation/LanguageService';

/**
 * OpenAI API 提供者实现
 */
export class OpenAIProvider extends BaseProvider {
  protected getProviderName(): string {
    return 'OpenAI';
  }

  protected async doAnalyzeFullText(
    text: string,
    settings: UserSettings,
  ): Promise<FullTextAnalysisResponse> {
    // 简化后统一使用智能模式
    const systemPrompt = getSystemPromptByConfig({
      targetLanguage: settings.multilingualConfig.targetLanguage,
      userLevel: settings.userLevel,
      replacementRate: settings.replacementRate,
    });

    let requestBody: any = {
      model: this.config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Translate to ${languageService.getTargetLanguageDisplayName(settings.multilingualConfig.targetLanguage)} (original||translation): ${text}`,
        },
      ],
      temperature: this.config.temperature,
      // Extension metadata for server-side caching (removed before forwarding to LLM)
      x_user_level: settings.userLevel,
    };

    if (this.config.includeThinkingParam) {
      requestBody.enable_thinking = this.config.enable_thinking;
    }

    requestBody = mergeCustomParams(requestBody, this.config.customParams);

    const rateLimiter = rateLimitManager.getLimiter(
      this.config.apiEndpoint,
      this.config.requestsPerSecond || 0,
      true,
    );

    const apiRequestFunction = async () => {
      const timeout = getApiTimeout(settings.apiRequestTimeout || 0);
      return sendApiRequest(requestBody, this.config, timeout);
    };

    // Retry logic: 3 attempts with 500ms delay
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 500;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const [response] = await rateLimiter.executeBatch([apiRequestFunction]);

        if (response.ok) {
          const data = await response.json();
          return this.extractReplacements(data, text);
        }

        // Non-200 response
        console.warn(
          `[OpenAI] 请求失败 (尝试 ${attempt + 1}/${MAX_RETRIES}): ${response.status} ${response.statusText}`,
        );
        lastError = new Error(
          `API 请求失败: ${response.status} ${response.statusText}`,
        );

        // Wait before retry (except for last attempt)
        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      } catch (error: any) {
        console.warn(
          `[OpenAI] 请求异常 (尝试 ${attempt + 1}/${MAX_RETRIES}):`,
          error.message,
        );
        lastError = error;

        if (attempt < MAX_RETRIES - 1) {
          await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
        }
      }
    }

    // All retries failed
    console.error(`[OpenAI] 所有 ${MAX_RETRIES} 次重试均失败`);
    throw lastError || new Error('API 请求失败');
  }

  /**
   * 提取替换信息
   */
  private extractReplacements(
    data: any,
    originalText: string,
  ): FullTextAnalysisResponse {
    try {
      if (!data?.choices?.[0]?.message?.content) {
        throw new Error('API响应格式错误');
      }

      const rawContent = data.choices[0].message.content;
      // 使用结构化文本解析器
      const parseResult = StructuredTextParser.parse(rawContent);

      if (!parseResult.success) {
        console.error(`[OpenAI提取] 解析失败:`, parseResult.errors);
        throw new Error(`结构化文本解析失败: ${parseResult.errors.join(', ')}`);
      }

      // 添加位置信息
      const replacements = addPositionsToReplacements(
        originalText,
        parseResult.replacements,
      );

      return {
        original: originalText,
        processed: '',
        replacements,
      };
    } catch (error) {
      console.error('提取替换信息失败:', error);
      throw error;
    }
  }
}
