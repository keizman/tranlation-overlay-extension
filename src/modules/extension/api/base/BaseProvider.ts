/**
 * 基础翻译提供者抽象类
 */

import { ApiConfig, FullTextAnalysisResponse } from '../../../shared/types/api';
import { UserSettings } from '../../../shared/types/storage';
import { ITranslationProvider } from '../types';
import { validateInputs } from '../utils/apiUtils';

/**
 * 基础Provider抽象类
 * 提供公共的功能和错误处理
 */
export abstract class BaseProvider implements ITranslationProvider {
  protected config: ApiConfig;

  constructor(config: ApiConfig) {
    this.config = config;
  }

  /**
   * 分析全文 - 模板方法
   */
  async analyzeFullText(
    text: string,
    settings: UserSettings,
  ): Promise<FullTextAnalysisResponse> {
    const originalText = text || '';

    // 验证输入
    if (!validateInputs(originalText, this.config.apiKey)) {
      throw new Error('API配置无效或输入文本为空');
    }

    try {
      return await this.doAnalyzeFullText(originalText, settings);
    } catch (error: any) {
      console.error(`${this.getProviderName()} API请求失败:`, error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(String(error));
    }
  }

  /**
   * 子类需要实现的具体分析逻辑
   */
  protected abstract doAnalyzeFullText(
    text: string,
    settings: UserSettings,
  ): Promise<FullTextAnalysisResponse>;

  /**
   * 获取提供者名称（用于日志）
   */
  protected abstract getProviderName(): string;

  /**
   * 获取配置
   */
  protected getConfig(): ApiConfig {
    return this.config;
  }
}
