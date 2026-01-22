/**
 * 音标相关类型定义
 */

/**
 * 音标信息接口
 * 包含单词的音标、词义和AI翻译等完整信息
 */
export interface PhoneticInfo {
  /** 单词文本 */
  word: string;
  /** 音标条目数组 */
  phonetics: PhoneticEntry[];
  /** 词义条目数组（可选） */
  meanings?: MeaningEntry[];
  /** AI翻译释义（可选） */
  aiTranslation?: AITranslationEntry;
  /** 错误状态信息（可选） */
  error?: {
    /** 是否有音标获取错误 */
    hasPhoneticError: boolean;
    /** 音标错误信息 */
    phoneticErrorMessage?: string;
  };
}

/**
 * 音标条目接口
 * 包含音标的文本、音频和来源信息
 */
export interface PhoneticEntry {
  /** 音标文本 (如: /ˈhɛloʊ/) */
  text?: string;
  /** 音频文件URL */
  audio?: string;
  /** 数据来源URL */
  sourceUrl?: string;
}

/**
 * 词义条目接口
 * 包含词性和定义信息
 */
export interface MeaningEntry {
  /** 词性 */
  partOfSpeech: string;
  /** 定义条目数组 */
  definitions: DefinitionEntry[];
}

/**
 * 定义条目接口
 * 包含具体的词义定义、例句和同义词
 */
export interface DefinitionEntry {
  /** 词义定义 */
  definition: string;
  /** 使用例句（可选） */
  example?: string;
  /** 同义词数组（可选） */
  synonyms?: string[];
}

/**
 * 音标获取结果接口
 * 包含音标查询操作的完整结果信息
 */
export interface PhoneticResult {
  /** 操作是否成功 */
  success: boolean;
  /** 音标数据（成功时返回） */
  data?: PhoneticInfo;
  /** 错误信息（失败时返回） */
  error?: string;
  /** 是否来自缓存 */
  cached?: boolean;
}

/**
 * 缓存条目接口
 * 用于实现带有TTL的内存缓存
 */
export interface CacheEntry<T> {
  /** 缓存的数据 */
  data: T;
  /** 缓存创建时间戳 */
  timestamp: number;
  /** 生存时间（毫秒） */
  ttl: number;
}

/**
 * AI翻译条目接口
 * 包含AI翻译的词义解释和来源信息
 */
export interface AITranslationEntry {
  /** 词义解释文本 */
  explain: string;
  /** 翻译来源标识 */
  source: string;
}

/**
 * AI翻译结果接口
 * 包含翻译操作的结果状态和数据
 */
export interface AITranslationResult {
  /** 操作是否成功 */
  success: boolean;
  /** 翻译数据（成功时返回） */
  data?: AITranslationEntry;
  /** 错误信息（失败时返回） */
  error?: string;
  /** 是否来自缓存 */
  cached?: boolean;
}

/**
 * TTS提供者类型
 */
export type TTSProviderType = 'browser' | 'google' | 'azure' | 'openai';
