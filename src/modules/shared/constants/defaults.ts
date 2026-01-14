/**
 * 默认配置常量
 * 包含项目中使用的所有默认设置和配置
 */

import type {
  ApiConfig,
  ApiConfigItem,
  MultilingualConfig,
} from '../types/api';
import type { FloatingBallConfig, TooltipHotkey } from '../types/ui';
import type { UserSettings } from '../types/storage';
import type { LazyLoadingConfig } from '../types/core';
import {
  UserLevel,
  TranslationStyle,
  TriggerMode,
  OriginalWordDisplayMode,
  TranslationPosition,
  TranslationMode,
  PronunciationTriggerMode,
  TranslationTriggerMode,
} from '../types/core';

// 默认API配置
export const DEFAULT_API_CONFIG: ApiConfig = {
  apiKey: import.meta.env.VITE_WXT_DEFAULT_API_KEY || '',
  apiEndpoint:
    import.meta.env.VITE_WXT_DEFAULT_API_ENDPOINT ||
    'https://api.openai.com/v1/chat/completions',
  model: import.meta.env.VITE_WXT_DEFAULT_MODEL || 'gpt-4o-mini',
  temperature: parseFloat(import.meta.env.VITE_WXT_DEFAULT_TEMPERATURE) || 0,
  enable_thinking: false,
  includeThinkingParam: false,
  // 自定义参数 - 支持从环境变量加载
  customParams: import.meta.env.VITE_WXT_DEFAULT_CUSTOM_PARAMS || '',
  phraseEnabled: true,
  requestsPerSecond: 0, // 默认无限制，0表示不限制
  useBackgroundProxy: false, // 默认不使用background代理，保持向后兼容
};

// 默认多语言配置 - 极简化版本
export const DEFAULT_MULTILINGUAL_CONFIG: MultilingualConfig = {
  nativeLanguage: 'zh', // 默认中文为母语
  targetLanguage: 'en', // 默认英语为目标语言
};

// 默认发音快捷键配置
export const DEFAULT_PRONUNCIATION_HOTKEY: TooltipHotkey = {
  enabled: true,
  modifierKeys: [],
  description: '快捷键',
};

// 默认悬浮球配置
export const DEFAULT_FLOATING_BALL_CONFIG: FloatingBallConfig = {
  enabled: true,
  position: 50, // 中间位置
  opacity: 0.8, // 80% 透明度
};

// 默认懒加载配置 - 简化版本
export const DEFAULT_LAZY_LOADING_CONFIG: LazyLoadingConfig = {
  enabled: true, //  懒加载开关
  preloadDistance: 0.5, // 固定提前半屏预加载
};

// 创建默认API配置项的函数
function createDefaultApiConfigItem(): ApiConfigItem {
  return {
    id: 'default-config',
    name: 'defaultConfig',
    provider: 'openai',
    config: DEFAULT_API_CONFIG,
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// 默认用户设置
export const DEFAULT_SETTINGS: UserSettings = {
  userLevel: UserLevel.B1,
  replacementRate: 0.3,
  isEnabled: true,
  useGptApi: true,
  apiConfigs: [createDefaultApiConfigItem()],
  activeApiConfigId: 'default-config',
  translationStyle: TranslationStyle.DEFAULT,
  translationMode: TranslationMode.WORD,
  triggerMode: TriggerMode.MANUAL,
  maxLength: 2000,
  minLength: 80, // 默认最小处理长度
  originalWordDisplayMode: OriginalWordDisplayMode.VISIBLE,
  enablePronunciationTooltip: true,
  multilingualConfig: DEFAULT_MULTILINGUAL_CONFIG,
  pronunciationHotkey: DEFAULT_PRONUNCIATION_HOTKEY,
  floatingBall: DEFAULT_FLOATING_BALL_CONFIG,
  translationPosition: TranslationPosition.AFTER,
  showParentheses: true,
  apiRequestTimeout: 0, // 无限制超时
  customTranslationCSS: '',
  lazyLoading: DEFAULT_LAZY_LOADING_CONFIG,
  // 新增默认设置
  ttsProvider: 'google', // 默认使用Google TTS
  pronunciationTriggerMode: PronunciationTriggerMode.CLICK, // 默认点击触发
  translationTriggerMode: TranslationTriggerMode.AUTO, // 默认自动翻译
  showDebugPanel: true, // 临时开启调试面板
  // 全文TTS设置
  enableFullTextTTSBar: true, // 默认开启底栏
  enableWordLevelAnimation: true, // 默认开启逐词高亮动画
  fullTextTTSBarCollapsed: true, // 默认折叠状态
  fullTextTTSConfigs: [
    {
      id: 'default-tts-config',
      name: 'Google Cloud TTS',
      config: {
        apiEndpoint:
          import.meta.env.VITE_WXT_DEFAULT_TTS_API_ENDPOINT ||
          'https://texttospeech.googleapis.com/v1beta1/text:synthesize',
        apiKey: import.meta.env.VITE_WXT_DEFAULT_TTS_API_KEY || '', // 支持环境变量或用户填写
        customParams: '',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  ],
  activeFullTextTTSConfigId: 'default-tts-config',
  //fullTextTTSVoiceName: 'en-US-Standard-H', // 默认语音模型
  fullTextTTSVoiceName: 'en-US-Chirp3-HD-Erinome', // 默认语音模型
};
