/**
 * 选中文本检测工具
 */

import type { WordCardSettings } from '../types';

/**
 * 判断是否为英文单词
 * 仅包含字母，无空格
 */
export function isEnglishWord(text: string): boolean {
  if (!text || text.length === 0) return false;
  // 仅字母，可含连字符
  return /^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(text.trim());
}

/**
 * 判断是否为单个单词（无空格）
 */
export function isSingleWord(text: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  return trimmed.length > 0 && !trimmed.includes(' ');
}

/**
 * 获取选中文本信息
 */
export interface SelectionInfo {
  text: string;
  rect: DOMRect | null;
  isWord: boolean;
}

export function getSelectionInfo(): SelectionInfo | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const text = selection.toString().trim();
  if (!text) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  return {
    text,
    rect,
    isWord: isSingleWord(text) && isEnglishWord(text),
  };
}

/**
 * 判断是否应该显示词典卡片
 */
export function shouldShowWordCard(
  text: string,
  settings: WordCardSettings,
  triggerType: 'select' | 'dblclick' | 'click',
): boolean {
  // 1. 开关是否开启
  if (!settings.enabled) {
    return false;
  }

  // 2. 是否为单个英文单词
  if (!isSingleWord(text) || !isEnglishWord(text)) {
    return false;
  }

  // 3. 是否符合触发模式
  switch (triggerType) {
    case 'select':
      return settings.selectCaptureMode;
    case 'dblclick':
      return settings.dbClickCaptureMode;
    case 'click':
      return settings.singleClickCaptureMode;
    default:
      return false;
  }
}
