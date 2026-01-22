/**
 * Google Cloud TTS API Provider
 * FullTextTTSProvider - 全文TTS API客户端
 *
 * 简化版本：不使用 SSML mark，通过 Web Audio API 获取精确音频时长
 */

import type {
  FullTextTTSConfig,
  TTSSynthesizeResponse,
  TTSTimepoint,
} from '../../shared/types/fullTextTTS';
import {
  DEFAULT_TTS_ENDPOINT,
  DEFAULT_VOICE_CONFIG,
  DEFAULT_AUDIO_CONFIG,
  TTS_REQUEST_TIMEOUT,
  TEST_CONNECTION_TEXT,
} from './constants';
import { createModuleLogger } from '../../shared/utils/DebugLogger';

const logger = createModuleLogger('FullTextTTSProvider');

/**
 * TTS 合成请求体
 */
interface SynthesizeRequest {
  input: {
    ssml?: string;
    text?: string;
  };
  voice: {
    languageCode: string;
    name: string;
  };
  audioConfig: {
    audioEncoding: 'MP3' | 'OGG_OPUS' | 'LINEAR16';
  };
}

/**
 * API 响应原始结构
 */
interface APIResponse {
  audioContent?: string;
  timepoints?: TTSTimepoint[];
  error?: {
    code: number;
    message: string;
    status: string;
  };
}

/**
 * 全文 TTS Provider
 */
export class FullTextTTSProvider {
  private config: FullTextTTSConfig;
  private customParams: Record<string, unknown> = {};
  private voiceName: string = DEFAULT_VOICE_CONFIG.name;

  constructor(config: FullTextTTSConfig) {
    this.config = config;
    this.parseCustomParams();
  }

  /**
   * 解析自定义参数
   */
  private parseCustomParams(): void {
    if (this.config.customParams) {
      try {
        this.customParams = JSON.parse(this.config.customParams);
      } catch (e) {
        logger.warn('解析自定义参数失败:', e);
        this.customParams = {};
      }
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: FullTextTTSConfig): void {
    this.config = config;
    this.parseCustomParams();
  }

  /**
   * 设置语音模型名称
   */
  setVoiceName(voiceName: string): void {
    this.voiceName = voiceName;
    logger.log(`语音模型已更新: ${voiceName}`);
  }

  /**
   * 合成语音
   * @param ssml SSML 格式的文本
   * @returns 音频内容和时间点
   */
  async synthesize(ssml: string): Promise<TTSSynthesizeResponse> {
    const endpoint = this.config.apiEndpoint || DEFAULT_TTS_ENDPOINT;
    const url = `${endpoint}?key=${this.config.apiKey}`;

    // 从存储中读取最新的语音模型设置 (使用 StorageService，更可靠)
    let voiceName = this.voiceName;
    try {
      const { StorageService } = await import(
        '../../core/storage/StorageService'
      );
      const storageService = StorageService.getInstance();
      const userSettings = await storageService.getUserSettings();

      logger.log('读取存储中的语音模型设置:', {
        storedVoiceName: userSettings?.fullTextTTSVoiceName,
        defaultVoiceName: this.voiceName,
      });

      if (userSettings?.fullTextTTSVoiceName) {
        voiceName = userSettings.fullTextTTSVoiceName;
        logger.log('使用存储中的语音模型:', voiceName);
      } else {
        logger.log('未找到存储中的语音模型设置，使用默认值:', voiceName);
      }
    } catch (e) {
      logger.warn('读取语音模型设置失败:', String(e));
      // 忽略存储读取错误，使用默认值
    }

    // 构建请求体
    const requestBody: SynthesizeRequest = {
      input: { ssml },
      voice: {
        languageCode: DEFAULT_VOICE_CONFIG.languageCode,
        name: voiceName || DEFAULT_VOICE_CONFIG.name,
        ...((this.customParams.voice as Record<string, string>) || {}),
      },
      audioConfig: {
        audioEncoding: DEFAULT_AUDIO_CONFIG.audioEncoding,
        ...((this.customParams.audioConfig as Record<string, string>) || {}),
      },
    };

    logger.log('发送 TTS 请求:', {
      endpoint,
      ssmlLength: ssml.length,
      voice: requestBody.voice,
    });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        TTS_REQUEST_TIMEOUT,
      );

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData: APIResponse = await response.json().catch(() => ({}));
        const errorMessage = errorData.error?.message || response.statusText;
        throw new Error(`TTS API 错误 (${response.status}): ${errorMessage}`);
      }

      const data: APIResponse = await response.json();

      if (!data.audioContent) {
        throw new Error('TTS API 返回空音频内容');
      }

      logger.log('TTS 合成成功:', {
        audioLength: data.audioContent.length,
        timepointsCount: data.timepoints?.length || 0,
      });

      return {
        audioContent: data.audioContent,
        timepoints: data.timepoints || [],
      };
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('TTS API 请求超时');
        }
        throw error;
      }
      throw new Error('TTS API 请求失败');
    }
  }

  /**
   * 合成并返回 ArrayBuffer 和音频时长
   * @param ssml SSML 格式的文本
   * @returns 音频 ArrayBuffer 和时长 (秒)
   */
  async synthesizeToArrayBuffer(ssml: string): Promise<{
    audioBuffer: ArrayBuffer;
    audioDuration: number;
  }> {
    const response = await this.synthesize(ssml);

    // base64 解码
    const binaryString = atob(response.audioContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const audioBuffer = bytes.buffer;

    // 使用 Web Audio API 获取精确音频时长
    let audioDuration = 0;
    try {
      const audioContext = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
      const decodedBuffer = await audioContext.decodeAudioData(
        audioBuffer.slice(0),
      );
      audioDuration = decodedBuffer.duration;
      audioContext.close();
      logger.log(`音频时长: ${audioDuration.toFixed(2)}s`);
    } catch (error) {
      // 如果 Web Audio API 失败，估算时长 (基于 MP3 平均比特率)
      // MP3 128kbps = 16 bytes/ms ≈ 16000 bytes/s
      audioDuration = audioBuffer.byteLength / 16000;
      logger.warn(
        `Web Audio API 解码失败，估算时长: ${audioDuration.toFixed(2)}s`,
        error,
      );
    }

    return {
      audioBuffer,
      audioDuration,
    };
  }

  /**
   * 测试连接
   * @returns 测试结果
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // 使用简单的测试文本
      const testSSML = `<speak>${TEST_CONNECTION_TEXT}</speak>`;
      await this.synthesize(testSSML);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      logger.error('连接测试失败:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): FullTextTTSConfig {
    return { ...this.config };
  }
}

/**
 * Provider 实例缓存
 */
let providerInstance: FullTextTTSProvider | null = null;

/**
 * 获取或创建 Provider 实例
 */
export function getFullTextTTSProvider(
  config: FullTextTTSConfig,
): FullTextTTSProvider {
  if (!providerInstance) {
    providerInstance = new FullTextTTSProvider(config);
  } else {
    providerInstance.updateConfig(config);
  }
  return providerInstance;
}

/**
 * 清除 Provider 实例
 */
export function clearFullTextTTSProvider(): void {
  providerInstance = null;
}
