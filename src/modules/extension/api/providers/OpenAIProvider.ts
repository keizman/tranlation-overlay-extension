/**
 * OpenAI 翻译提供者
 */

import { FullTextAnalysisResponse } from '../../../shared/types/api';
import { UserSettings } from '../../../shared/types/storage';
import { BaseProvider } from '../base/BaseProvider';
import { mergeCustomParams } from '../utils/apiUtils';
import { addPositionsToReplacements } from '../utils/textUtils';
import { sendApiRequest } from '../utils/requestUtils';
import { getSystemPromptByConfig } from '../../../core/translation/PromptService';
import { getApiTimeout } from '@/src/utils';
import { rateLimitManager } from '../../../infrastructure/ratelimit';
import { StructuredTextParser } from '../utils/structuredTextParser';
import { languageService } from '../../../core/translation/LanguageService';

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

    // Retry logic: 3 attempts with exponential backoff
    const MAX_RETRIES = 3;
    const INITIAL_RETRY_DELAY_MS = 1000;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const [response] = await rateLimiter.executeBatch([apiRequestFunction]);

        if (response.ok) {
          const data = await response.json();
          return this.extractReplacements(data, text);
        }

        // Handle non-200 responses
        // Only retry on 429 (Rate Limit) or 5xx (Server Errors)
        const shouldRetry = response.status === 429 || response.status >= 500;

        if (!shouldRetry) {
          console.warn(
            `[OpenAI] 请求失败 (不可重试): ${response.status} ${response.statusText}`,
          );
          throw new Error(
            `API 请求失败: ${response.status} ${response.statusText}`,
          );
        }

        console.warn(
          `[OpenAI] 请求失败 (尝试 ${attempt + 1}/${MAX_RETRIES}): ${response.status} ${response.statusText}`,
        );
        lastError = new Error(
          `API 请求失败: ${response.status} ${response.statusText}`,
        );

        // Exponential backoff: 1s, 2s, 4s...
        if (attempt < MAX_RETRIES - 1) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error: any) {
        console.warn(
          `[OpenAI] 请求异常 (尝试 ${attempt + 1}/${MAX_RETRIES}):`,
          error.message,
        );
        lastError = error;

        // For network errors/exceptions, always retry with backoff
        if (attempt < MAX_RETRIES - 1) {
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
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

      // 方案D: 过滤掉不以完整单词形式出现在原文中的翻译项
      const validatedReplacements = parseResult.replacements.filter((rep) => {
        if (!rep.original || rep.original.length < 2) {
          console.warn('[OpenAI] 过滤掉过短的原文:', rep.original);
          return false;
        }
        // 转义正则特殊字符
        const escapedOriginal = rep.original.replace(
          /[.*+?^${}()|[\]\\]/g,
          '\\$&',
        );
        // 使用单词边界检查原文是否以完整单词形式存在
        const wordBoundaryRegex = new RegExp(`\\b${escapedOriginal}\\b`, 'i');
        const isValid = wordBoundaryRegex.test(originalText);
        if (!isValid) {
          console.warn(
            '[OpenAI] 过滤掉非完整单词匹配:',
            rep.original,
            '->',
            rep.translation,
          );
        }
        return isValid;
      });

      // 添加位置信息
      const replacements = addPositionsToReplacements(
        originalText,
        validatedReplacements,
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
