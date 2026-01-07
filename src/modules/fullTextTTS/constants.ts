/**
 * 全文TTS常量定义
 * Full-Text TTS Constants
 */

// ==================== API 配置 ====================

/**
 * 默认 Google Cloud TTS API 端点 (v1beta1 支持 timepoints)
 */
export const DEFAULT_TTS_ENDPOINT =
  'https://texttospeech.googleapis.com/v1beta1/text:synthesize';

/**
 * 默认语音配置
 */
export const DEFAULT_VOICE_CONFIG = {
  languageCode: 'en-US',
  name: 'en-US-Neural2-F',
};

/**
 * 默认音频配置
 */
export const DEFAULT_AUDIO_CONFIG = {
  audioEncoding: 'MP3' as const,
};

// ==================== 文本切片配置 ====================

/**
 * 英文文本最大长度 (字符)
 * 官方限制 5000 bytes，但建议 800-1000 字符以获得最佳体验
 */
export const ENG_TTS_MAX_LENGTH = 1000;

/**
 * 切片搜索范围 (字符)
 * 在中心点左右各搜索的最大范围
 */
export const SPLIT_SEARCH_RANGE = 80;

/**
 * 强语义结束符优先级 (从高到低)
 */
export const SPLIT_DELIMITERS = ['\n', '.', '?', '!', ';'] as const;

/**
 * 句子结束符正则 (用于 SSML mark 插入)
 * 在句末 .!?; 后插入 mark，而非按单词间隔
 */
export const SENTENCE_DELIMITERS = /[.!?;]/;

/**
 * 默认语速 (Words Per Minute)
 * 用于 fallback 时估算句子时长
 */
export const DEFAULT_WPM = 150;

/**
 * 单点 drift 阈值 (秒)
 * 如果单个 timepoint 的 drift 超过此值，触发 fallback
 */
export const DRIFT_THRESHOLD_SINGLE = 1.5;

/**
 * 累计 drift 阈值 (秒)
 * 如果累计 drift 超过此值，触发 fallback
 */
export const DRIFT_THRESHOLD_CUMULATIVE = 3.0;

// ==================== 音频播放配置 ====================

/**
 * 音频淡入淡出时间 (秒)
 * 用于平滑拼接，避免爆音
 */
export const FADE_DURATION = 0.05;

/**
 * SSML 片段间隙 (毫秒)
 * 在每个切片头部添加 break，避免拼接过快
 */
export const SSML_BREAK_TIME = 300;

// ==================== 缓存配置 ====================

/**
 * 预缓存前一段数量
 */
export const PRECACHE_BEFORE = 1;

/**
 * 预缓存后续段落数量
 */
export const PRECACHE_AFTER = 2;

// ==================== 请求配置 ====================

/**
 * API 请求超时时间 (毫秒)
 */
export const TTS_REQUEST_TIMEOUT = 30000;

/**
 * 测试连接使用的文本
 */
export const TEST_CONNECTION_TEXT = 'Hello, this is a test.';
