/**
 * TTS提供者接口
 * 定义统一的文本转语音服务规范
 */

import { TTSResult } from '../types';

export interface TTSProviderConfig {
  // Web Speech API配置
  lang?: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;

  // 有道TTS配置
  accent?: 'us' | 'uk'; // 美式或英式发音
}

export interface ITTSProvider {
  readonly name: string;

  /**
   * 朗读文本
   * @param text 要朗读的文本
   * @param config 可选的配置覆盖
   */
  speak(text: string, config?: Partial<TTSProviderConfig>): Promise<TTSResult>;

  /**
   * 停止朗读
   */
  stop(): void;

  /**
   * 检查是否正在朗读
   */
  isSpeaking(): boolean;

  /**
   * 检查TTS是否可用
   */
  isAvailable(): boolean;

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TTSProviderConfig>): void;

  /**
   * 获取当前配置
   */
  getConfig(): TTSProviderConfig;
}
