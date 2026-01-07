/**
 * 全文TTS相关类型定义
 * Full-Text TTS Types
 */

// ==================== TTS 配置类型 ====================

/**
 * TTS API 配置
 */
export interface FullTextTTSConfig {
  apiEndpoint: string; // 默认: https://texttospeech.googleapis.com/v1beta1/text:synthesize
  apiKey: string;
  customParams?: string; // 可选添加额外 JSON 参数
}

/**
 * TTS 配置项 (包含元数据)
 */
export interface FullTextTTSConfigItem {
  id: string;
  name: string;
  config: FullTextTTSConfig;
  createdAt: number;
  updatedAt: number;
}

// ==================== 播放状态类型 ====================

/**
 * 播放状态
 */
export type FullTextTTSPlayState = 'IDLE' | 'PLAYING' | 'PAUSED' | 'LOADING';

// ==================== 文本切片类型 ====================

/**
 * SSML Mark 标记 (句子级别)
 */
export interface SSMLMark {
  name: string; // mark 名称，如 "s0", "s1" (sentence index)
  charOffset: number; // 在原文中的字符偏移
  sentenceIndex: number; // 句子索引 (用于 fallback)
  sentenceText: string; // 句子文本 (用于 fallback 估算时长)
  wordCount: number; // 句子词数 (用于 fallback 估算时长)
}

/**
 * 句子信息 (用于 fallback 估算)
 */
export interface SentenceInfo {
  text: string;
  startOffset: number;
  endOffset: number;
  wordCount: number;
  estimatedDuration?: number; // 估算时长 (秒)
}

/**
 * 文本切片
 */
export interface TextSlice {
  text: string; // 原始文本
  startOffset: number; // 在原文中的起始位置
  endOffset: number; // 在原文中的结束位置
  ssml: string; // SSML 格式文本 (带 mark 标签)
  marks: SSMLMark[]; // mark 标记列表
  sentences: SentenceInfo[]; // 句子列表 (用于 fallback)
}

/**
 * API 响应中的时间点
 */
export interface TTSTimepoint {
  markName: string;
  timeSeconds: number;
  type: 'SSML_MARK';
}

/**
 * Timepoint 验证结果
 */
export interface TimepointValidation {
  isValid: boolean;
  invalidReason?: string;
  fallbackTimes?: number[]; // 估算的句子起始时间 (fallback 用)
  useFallback: boolean;
}

/**
 * TTS 合成响应
 */
export interface TTSSynthesizeResponse {
  audioContent: string; // base64 编码的音频
  timepoints?: TTSTimepoint[];
}

// ==================== 缓存类型 ====================

/**
 * 音频缓存条目
 */
export interface AudioCacheEntry {
  sliceIndex: number;
  audioBuffer: ArrayBuffer;
  timepoints: TTSTimepoint[];
  blob?: Blob;
}

// ==================== 段落信息类型 ====================

/**
 * 段落信息
 */
export interface ParagraphInfo {
  element: HTMLElement;
  text: string;
  slices: TextSlice[];
}

// ==================== 事件回调类型 ====================

/**
 * 状态变更回调
 */
export type StateChangeCallback = (state: FullTextTTSPlayState) => void;

/**
 * 位置更新回调
 */
export type PositionUpdateCallback = (
  element: HTMLElement,
  charOffset: number,
  word: string,
) => void;

/**
 * 播放进度信息
 */
export interface PlaybackProgress {
  paragraphIndex: number;
  sliceIndex: number;
  charOffset: number;
  totalParagraphs: number;
}
