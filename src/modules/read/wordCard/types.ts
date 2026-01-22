/**
 * 词典卡片类型定义
 */

// ============================================================================
// 设置类型
// ============================================================================

/**
 * 词典卡片设置
 */
export interface WordCardSettings {
  /** 总开关 */
  enabled: boolean;
  /** 后端 API 地址 */
  apiEndpoint: string;
  /** 划选取词 */
  selectCaptureMode: boolean;
  /** 双击取词 */
  dbClickCaptureMode: boolean;
  /** 单击取词 */
  singleClickCaptureMode: boolean;
  /** 显示查词图标 */
  showExplainIcon: boolean;
  /** 自动发音 */
  autoSpeak: boolean;
  /** 显示英文释义 */
  showEnglishDefinition: boolean;
}

/**
 * 默认词典卡片设置
 */
export const DEFAULT_WORD_CARD_SETTINGS: WordCardSettings = {
  enabled: false,
  apiEndpoint: 'http://148.135.95.44:9001',
  selectCaptureMode: true,
  dbClickCaptureMode: false,
  singleClickCaptureMode: false,
  showExplainIcon: true,
  autoSpeak: false,
  showEnglishDefinition: false,
};

// ============================================================================
// API 响应类型
// ============================================================================

/**
 * 音标信息
 */
export interface Phonetics {
  uk: string;
  us: string;
}

/**
 * 音频 URL
 */
export interface AudioUrls {
  uk: string;
  us: string;
}

/**
 * 中文翻译条目
 */
export interface Translation {
  pos: string;
  meanings: string[];
}

/**
 * 英文释义条目
 */
export interface Definition {
  partOfSpeech: string;
  definition: string;
  example: string;
  synonyms: string[];
  antonyms: string[];
}

/**
 * 词形变化
 */
export interface WordForms {
  past: string;
  pastParticiple: string;
  presentParticiple: string;
  thirdPerson: string;
  plural: string;
  comparative: string;
  superlative: string;
  lemma: string;
}

/**
 * 词频信息
 */
export interface Frequency {
  collins: number;
  oxford: number;
  bnc: number;
  frq: number;
  tag: string[];
}

/**
 * 词典 API 响应
 */
export interface DictionaryResponse {
  word: string;
  phonetics: Phonetics;
  audio: AudioUrls;
  translations: Translation[];
  definitions: Definition[];
  exchange: WordForms;
  frequency: Frequency;
  source: string;
  cached: boolean;
  detailUrl: string;
}

// ============================================================================
// 卡片状态
// ============================================================================

/**
 * 卡片位置
 */
export interface CardPosition {
  x: number;
  y: number;
}

/**
 * 卡片状态
 */
export interface WordCardState {
  visible: boolean;
  loading: boolean;
  word: string;
  position: CardPosition;
  pinned: boolean;
  starred: boolean;
  data: DictionaryResponse | null;
  error: string | null;
}
