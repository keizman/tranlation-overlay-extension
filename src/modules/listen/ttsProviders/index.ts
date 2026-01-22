/**
 * TTS功能模块统一导出
 * 包含TTS接口、实现类和工厂类
 */

export { ITTSProvider, TTSProviderConfig } from './ITTSProvider';
export type { TTSResult } from '../types';
export { WebSpeechTTSProvider } from './WebSpeechTTSProvider';
export { YoudaoTTSProvider } from './YoudaoTTSProvider';
export { TTSProviderFactory } from './TTSProviderFactory';
