/**
 * 选中文本检测工具
 */

import type { WordCardSettings } from '../types';
import { readingService } from '../../../architecture/bootstrap/defaultAdapters';

/**
 * 获取选中文本信息
 */
export interface SelectionInfo {
  text: string;
  rect: DOMRect | null;
  isWord: boolean;
  queryLanguage: string;
}

export function getSelectionInfo(): SelectionInfo | null {
  const snapshot = readingService.getSelectionInfo();
  if (!snapshot) {
    return null;
  }

  return {
    text: snapshot.text,
    rect: snapshot.rect as DOMRect | null,
    isWord: snapshot.isWord,
    queryLanguage: snapshot.queryLanguage,
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

  // 2. 选中文本不能为空
  if (!text || !text.trim()) {
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
