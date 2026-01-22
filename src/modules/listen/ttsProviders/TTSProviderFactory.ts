/**
 * TTS提供者工厂
 * 负责创建和管理不同的TTS提供者实例
 */

import { ITTSProvider, TTSProviderConfig } from './ITTSProvider';
import { WebSpeechTTSProvider } from './WebSpeechTTSProvider';
import { YoudaoTTSProvider } from './YoudaoTTSProvider';
import { GoogleTTSProvider } from './GoogleTTSProvider';
import { TTSProviderType } from '../types';

export class TTSProviderFactory {
  /**
   * 创建TTS提供者实例
   * @param providerType 提供者类型
   * @param config 配置参数
   * @returns TTS提供者实例
   */
  static createProvider(
    providerType: TTSProviderType,
    config?: TTSProviderConfig,
  ): ITTSProvider {
    switch (providerType) {
      case 'google':
        return new GoogleTTSProvider(config);

      case 'web-speech':
        return new WebSpeechTTSProvider(config);

      case 'youdao':
        return new YoudaoTTSProvider(config);

      default:
        throw new Error(`不支持的TTS提供者类型: ${providerType}`);
    }
  }

  /**
   * 获取所有支持的提供者类型
   */
  static getSupportedProviders(): TTSProviderType[] {
    return ['google', 'web-speech', 'youdao'];
  }

  /**
   * 检查提供者类型是否支持
   * @param providerType 提供者类型
   */
  static isProviderSupported(
    providerType: string,
  ): providerType is TTSProviderType {
    return this.getSupportedProviders().includes(
      providerType as TTSProviderType,
    );
  }

  /**
   * 获取提供者的显示名称
   * @param providerType 提供者类型
   */
  static getProviderDisplayName(providerType: TTSProviderType): string {
    const displayNames: Record<TTSProviderType, string> = {
      google: 'Google翻译',
      'web-speech': '浏览器语音',
      youdao: '有道词典',
    };

    return displayNames[providerType] || providerType;
  }

  /**
   * 获取提供者的描述
   * @param providerType 提供者类型
   */
  static getProviderDescription(providerType: TTSProviderType): string {
    const descriptions: Record<TTSProviderType, string> = {
      google: '使用Google翻译语音服务，音质清晰自然',
      'web-speech': '使用浏览器内置的语音合成功能，支持多种语言和语音',
      youdao: '使用有道词典的在线语音服务，支持美式和英式发音',
    };

    return descriptions[providerType] || '';
  }
}
