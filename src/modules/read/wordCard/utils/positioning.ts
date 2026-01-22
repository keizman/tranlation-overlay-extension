/**
 * 卡片定位工具
 */

import type { CardPosition } from '../types';

const CARD_WIDTH = 360;
const CARD_MAX_HEIGHT = 400;
const PADDING = 10;

/**
 * 计算卡片位置
 * 优先显示在选中文本下方，空间不足时显示在上方
 */
export function calculateCardPosition(selectionRect: DOMRect): CardPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  // 水平位置：居中对齐，但不超出视口
  let x = selectionRect.left + selectionRect.width / 2 - CARD_WIDTH / 2;

  // 左边界检查
  if (x < PADDING) {
    x = PADDING;
  }

  // 右边界检查
  if (x + CARD_WIDTH > viewportWidth - PADDING) {
    x = viewportWidth - CARD_WIDTH - PADDING;
  }

  // 垂直位置：优先下方
  let y = selectionRect.bottom + PADDING;

  // 下方空间不足，显示在上方
  if (y + CARD_MAX_HEIGHT > viewportHeight - PADDING) {
    y = selectionRect.top - CARD_MAX_HEIGHT - PADDING;

    // 上方也不够，就显示在下方，让用户滚动
    if (y < PADDING) {
      y = selectionRect.bottom + PADDING;
    }
  }

  return { x, y };
}

/**
 * 计算拖拽后的新位置
 */
export function clampPosition(
  x: number,
  y: number,
  cardWidth: number = CARD_WIDTH,
  cardHeight: number = CARD_MAX_HEIGHT,
): CardPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  return {
    x: Math.max(PADDING, Math.min(x, viewportWidth - cardWidth - PADDING)),
    y: Math.max(PADDING, Math.min(y, viewportHeight - cardHeight - PADDING)),
  };
}
