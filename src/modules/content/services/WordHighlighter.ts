/**
 * 词高亮服务
 * 负责包装段落文本为词节点并控制高亮
 */

// 高亮样式类名
const WORD_CLASS = 'wxt-tts-word';
const WORD_ACTIVE_CLASS = 'wxt-tts-word--active';
const PARAGRAPH_PLAYING_CLASS = 'wxt-tts-playing';

export class WordHighlighter {
  private originalHtml: string = '';
  private targetElement: HTMLElement | null = null;
  private wordSpans: HTMLSpanElement[] = [];
  private currentWordIndex: number = -1;

  /**
   * 准备段落用于高亮
   * 将文本包装为词节点
   */
  prepare(element: HTMLElement): void {
    if (this.targetElement === element) return;

    // 清理之前的
    this.cleanup();

    this.targetElement = element;
    this.originalHtml = element.innerHTML;

    // 获取纯文本并分词
    const text = element.innerText;
    const words = this.tokenize(text);

    // 构建带 span 的 HTML
    let html = '';
    let charIndex = 0;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (word.isWord) {
        html += `<span class="${WORD_CLASS}" data-word-index="${i}" data-char-index="${charIndex}">${this.escapeHtml(word.text)}</span>`;
      } else {
        html += this.escapeHtml(word.text);
      }
      charIndex += word.text.length;
    }

    element.innerHTML = html;
    element.classList.add(PARAGRAPH_PLAYING_CLASS);

    // 缓存所有词节点
    this.wordSpans = Array.from(
      element.querySelectorAll(`.${WORD_CLASS}`),
    ) as HTMLSpanElement[];
  }

  /**
   * 高亮指定位置的词
   */
  highlightByCharIndex(charIndex: number): void {
    // 找到对应的词
    let targetIndex = -1;

    for (let i = 0; i < this.wordSpans.length; i++) {
      const span = this.wordSpans[i];
      const spanCharIndex = parseInt(span.dataset.charIndex || '0', 10);
      const spanLength = span.textContent?.length || 0;

      if (
        charIndex >= spanCharIndex &&
        charIndex < spanCharIndex + spanLength
      ) {
        targetIndex = i;
        break;
      }
    }

    if (targetIndex >= 0) {
      this.highlightWordAt(targetIndex);
    }
  }

  /**
   * 高亮指定索引的词
   */
  highlightWordAt(index: number): void {
    if (index === this.currentWordIndex) return;

    // 移除之前的高亮
    if (this.currentWordIndex >= 0 && this.wordSpans[this.currentWordIndex]) {
      this.wordSpans[this.currentWordIndex].classList.remove(WORD_ACTIVE_CLASS);
    }

    // 添加新高亮
    if (index >= 0 && index < this.wordSpans.length) {
      this.wordSpans[index].classList.add(WORD_ACTIVE_CLASS);
      this.currentWordIndex = index;

      // 滚动到可见
      this.wordSpans[index].scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }

  /**
   * 清除所有高亮并恢复原始内容
   */
  cleanup(): void {
    if (this.targetElement && this.originalHtml) {
      this.targetElement.innerHTML = this.originalHtml;
      this.targetElement.classList.remove(PARAGRAPH_PLAYING_CLASS);
    }
    this.targetElement = null;
    this.originalHtml = '';
    this.wordSpans = [];
    this.currentWordIndex = -1;
  }

  /**
   * 获取当前目标元素
   */
  getTargetElement(): HTMLElement | null {
    return this.targetElement;
  }

  /**
   * 分词 - 分离单词和空白/标点
   */
  private tokenize(text: string): Array<{ text: string; isWord: boolean }> {
    const tokens: Array<{ text: string; isWord: boolean }> = [];
    const regex = /(\s+|[^\s\w])/g;
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      // 词部分
      if (match.index > lastIndex) {
        tokens.push({
          text: text.slice(lastIndex, match.index),
          isWord: true,
        });
      }
      // 空白/标点
      tokens.push({
        text: match[0],
        isWord: false,
      });
      lastIndex = regex.lastIndex;
    }

    // 最后一个词
    if (lastIndex < text.length) {
      tokens.push({
        text: text.slice(lastIndex),
        isWord: true,
      });
    }

    return tokens;
  }

  /**
   * HTML 转义
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * 注入高亮样式
 */
export function injectTTSHighlightStyles(): void {
  const styleId = 'wxt-tts-highlight-styles';
  if (document.getElementById(styleId)) return;

  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = `
    .${WORD_CLASS} {
      transition: background 0.15s ease, color 0.15s ease;
      padding: 1px 2px;
      border-radius: 3px;
    }
    .${WORD_ACTIVE_CLASS} {
      background: linear-gradient(120deg, #a8edea 0%, #fed6e3 100%);
      color: #333;
    }
    .${PARAGRAPH_PLAYING_CLASS} {
      position: relative;
    }
    .${PARAGRAPH_PLAYING_CLASS}::before {
      content: '🔊';
      position: absolute;
      left: -24px;
      top: 0;
      font-size: 14px;
      opacity: 0.7;
    }
  `;
  document.head.appendChild(style);
}
