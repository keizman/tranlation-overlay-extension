/**
 * 智能内容分段器
 * 负责将DOM结构智能分割为合理的处理单元，避免重复处理嵌套结构
 */

import {
  ContentSegment,
  globalProcessingState,
} from './ProcessingStateManager';
import { BLOCK_TAGS, IGNORE_SELECTORS } from '../shared/constants';

/**
 * 内容分段器配置
 */
export interface SegmenterConfig {
  /** 最大段落长度 */
  maxSegmentLength: number;
  /** 最小段落长度 */
  minSegmentLength: number;
  /** 是否启用智能边界检测 */
  enableSmartBoundary: boolean;
  /** 是否合并小段落 */
  mergeSmallSegments: boolean;
}

const DEFAULT_CONFIG: SegmenterConfig = {
  maxSegmentLength: 2000,
  minSegmentLength: 80,
  enableSmartBoundary: true,
  mergeSmallSegments: true,
};

/**
 * 智能内容分段器
 *
 * 核心功能：
 * 1. 识别真正的内容边界，避免重复处理嵌套结构
 * 2. 智能分割长文本，保持语义完整性
 * 3. 合并碎片化的小段落，提高处理效率
 * 4. 生成唯一的内容段落标识符
 */
export class ContentSegmenter {
  private config: SegmenterConfig;

  constructor(config: Partial<SegmenterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * 将根节点分割为内容段落
   * 主要入口方法，返回所有需要处理的内容段落
   */
  segmentContent(root: Node): ContentSegment[] {
    const segments: ContentSegment[] = [];

    // 第一步：找到所有叶子内容容器
    const leafContainers = this.findLeafContentContainers(root);

    // 第二步：为每个容器提取内容段落
    for (const container of leafContainers) {
      const containerSegments = this.extractSegmentsFromContainer(container);
      segments.push(...containerSegments);
    }

    // 第三步：合并小段落（如果启用）
    if (this.config.mergeSmallSegments) {
      return this.mergeSmallSegments(segments);
    }

    return segments;
  }

  /**
   * 找到所有叶子内容容器
   * 叶子容器：包含文本内容但不包含其他块级元素的元素
   */
  private findLeafContentContainers(root: Node): Element[] {
    const containers: Element[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (node) => {
        const element = node as Element;

        // 跳过忽略的元素
        if (this.shouldIgnoreElement(element)) {
          return NodeFilter.FILTER_REJECT;
        }

        // 检查是否是叶子内容容器
        if (this.isLeafContentContainer(element)) {
          return NodeFilter.FILTER_ACCEPT;
        }

        return NodeFilter.FILTER_SKIP;
      },
    });

    let node: Node | null;
    while ((node = walker.nextNode())) {
      containers.push(node as Element);
    }

    // 去重：过滤掉被其他已收集容器包含的元素
    // 防止父元素和子元素都被收集导致文本重复
    return this.deduplicateNestedContainers(containers);
  }

  /**
   * 去除嵌套的容器，保留最外层的容器
   * 防止父子元素都被收集导致文本重复
   */
  private deduplicateNestedContainers(containers: Element[]): Element[] {
    const result: Element[] = [];

    for (const container of containers) {
      // 检查是否有任何已收集的容器包含当前容器
      const isNested = result.some(
        (existing) => existing.contains(container) && existing !== container,
      );

      if (!isNested) {
        // 检查当前容器是否包含已收集的容器，如果是则移除那些
        const indicesToRemove: number[] = [];
        for (let i = 0; i < result.length; i++) {
          if (container.contains(result[i]) && container !== result[i]) {
            indicesToRemove.push(i);
          }
        }

        // 从后往前移除，避免索引偏移
        for (let i = indicesToRemove.length - 1; i >= 0; i--) {
          result.splice(indicesToRemove[i], 1);
        }

        result.push(container);
      }
    }

    return result;
  }

  /**
   * 判断元素是否是叶子内容容器
   */
  private isLeafContentContainer(element: Element): boolean {
    // 必须包含文本内容（移除最小长度限制，允许小段落被收集后合并）
    const textContent = this.getTextContent(element);
    if (!textContent) {
      return false;
    }

    // 不能包含块级子元素
    const blockChildren = element.querySelectorAll(
      Array.from(BLOCK_TAGS)
        .map((tag) => tag.toLowerCase())
        .join(', '),
    );

    // 允许包含少量简单的块级元素（如 span 包装）
    if (blockChildren.length > 3) {
      return false;
    }

    // 检查是否有复杂的嵌套结构
    for (const child of blockChildren) {
      if (this.getTextContent(child).length > 100) {
        return false; // 子块级元素包含大量文本，不是叶子容器
      }
    }

    return true;
  }

  /**
   * 从容器中提取内容段落
   */
  private extractSegmentsFromContainer(container: Element): ContentSegment[] {
    const segments: ContentSegment[] = [];
    const textNodes = this.getTextNodes(container);

    if (textNodes.length === 0) {
      return segments;
    }

    // 获取完整文本内容
    const fullText = textNodes.map((node) => node.textContent || '').join('');
    const domPath = globalProcessingState.generateDomPath(container);

    // 如果文本较短，作为单个段落处理
    if (fullText.length <= this.config.maxSegmentLength) {
      const fingerprint = globalProcessingState.generateContentFingerprint(
        fullText,
        domPath,
      );

      segments.push({
        id: `${container.tagName.toLowerCase()}-${fingerprint}`,
        textContent: fullText,
        element: container,
        elements: [container],
        textNodes: textNodes,
        fingerprint: fingerprint,
        domPath: domPath,
      });
    } else {
      // 智能分割长文本
      const subSegments = this.splitLongText(textNodes, container, domPath);
      segments.push(...subSegments);
    }

    return segments;
  }

  /**
   * 智能分割长文本
   */
  private splitLongText(
    textNodes: Text[],
    container: Element,
    domPath: string,
  ): ContentSegment[] {
    const segments: ContentSegment[] = [];
    let currentNodes: Text[] = [];
    let segmentIndex = 0;

    for (const textNode of textNodes) {
      const nodeText = textNode.textContent || '';

      // 计算当前累积的文本长度（使用一致的方式）
      const currentText = currentNodes
        .map((node) => node.textContent || '')
        .join('');

      // 检查是否会超过最大长度
      if (
        currentText.length + nodeText.length > this.config.maxSegmentLength &&
        currentNodes.length > 0
      ) {
        // 创建当前段落（使用一致的文本构建方式）
        const finalText = currentNodes
          .map((node) => node.textContent || '')
          .join('');
        const fingerprint = globalProcessingState.generateContentFingerprint(
          finalText,
          `${domPath}[${segmentIndex}]`,
        );
        segments.push({
          id: `${container.tagName.toLowerCase()}-${fingerprint}-${segmentIndex}`,
          textContent: finalText,
          element: container,
          elements: [container],
          textNodes: [...currentNodes],
          fingerprint: fingerprint,
          domPath: `${domPath}[${segmentIndex}]`,
        });

        // 重置累积器
        currentNodes = [];
        segmentIndex++;
      }

      currentNodes.push(textNode);
    }

    // 处理最后一个段落（使用一致的文本构建方式）
    if (currentNodes.length > 0) {
      const finalText = currentNodes
        .map((node) => node.textContent || '')
        .join('');
      const fingerprint = globalProcessingState.generateContentFingerprint(
        finalText,
        `${domPath}[${segmentIndex}]`,
      );
      segments.push({
        id: `${container.tagName.toLowerCase()}-${fingerprint}-${segmentIndex}`,
        textContent: finalText,
        element: container,
        elements: [container],
        textNodes: currentNodes,
        fingerprint: fingerprint,
        domPath: `${domPath}[${segmentIndex}]`,
      });
    }

    return segments;
  }

  /**
   * 合并小段落
   * 策略：将短段落与后续段落合并，直到总长度接近 maxSegmentLength（目标70%）
   * 确保：
   * 1. 小于 minLength 的短段落向后积累
   * 2. 累计达到 70% 目标时输出
   * 3. 如果加入下一段会超过 maxLength，则强制输出当前批次
   * 4. 章节末尾剩余文本强制翻译，不留残余
   */
  private mergeSmallSegments(segments: ContentSegment[]): ContentSegment[] {
    if (segments.length === 0) {
      return segments;
    }

    if (segments.length === 1) {
      // 单个段落直接返回（即使短也要翻译）
      return segments;
    }

    const merged: ContentSegment[] = [];
    let currentGroup: ContentSegment[] = [];
    // 目标合并长度：maxSegmentLength 的 70%
    const targetMergeLength = Math.floor(this.config.maxSegmentLength * 0.7);
    const maxLength = this.config.maxSegmentLength;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // 计算当前组的总长度
      const currentLength = currentGroup.reduce(
        (sum, seg) => sum + seg.textContent.length,
        0,
      );
      const newLength = currentLength + segment.textContent.length;

      // 条件1：加入新段落后超过 maxLength，先输出当前组
      if (newLength > maxLength && currentGroup.length > 0) {
        // 输出当前组
        if (currentGroup.length === 1) {
          merged.push(currentGroup[0]);
        } else {
          merged.push(this.createMergedSegment(currentGroup));
        }
        // 新段落开始新组
        currentGroup = [segment];
      }
      // 条件2：达到目标长度 70%，输出当前组
      else if (newLength >= targetMergeLength && currentGroup.length > 0) {
        // 把当前段落也加入后一起输出
        currentGroup.push(segment);
        if (currentGroup.length === 1) {
          merged.push(currentGroup[0]);
        } else {
          merged.push(this.createMergedSegment(currentGroup));
        }
        currentGroup = [];
      }
      // 条件3：继续累积
      else {
        currentGroup.push(segment);
      }
    }

    // 处理末尾剩余的段落（强制翻译，不留残余）
    if (currentGroup.length > 0) {
      if (currentGroup.length === 1) {
        merged.push(currentGroup[0]);
      } else {
        merged.push(this.createMergedSegment(currentGroup));
      }
    }

    return merged;
  }

  /**
   * 创建合并段落
   */
  private createMergedSegment(segments: ContentSegment[]): ContentSegment {
    const combinedText = segments.map((seg) => seg.textContent).join('');
    const combinedNodes = segments.reduce(
      (acc, seg) => acc.concat(seg.textNodes),
      [] as Text[],
    );
    const primaryElement = segments[0].element;
    // 收集所有相关的DOM元素
    const allElements = segments.map((seg) => seg.element);
    const combinedDomPath = segments.map((seg) => seg.domPath).join('|');

    const fingerprint = globalProcessingState.generateContentFingerprint(
      combinedText,
      combinedDomPath,
    );

    return {
      id: `merged-${fingerprint}`,
      textContent: combinedText,
      element: primaryElement,
      elements: allElements,
      textNodes: combinedNodes,
      fingerprint: fingerprint,
      domPath: combinedDomPath,
    };
  }

  /**
   * 获取元素的所有文本节点
   */
  private getTextNodes(element: Element): Text[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const text = node.textContent?.trim();
        if (!text) {
          return NodeFilter.FILTER_REJECT;
        }

        // 检查父元素是否被忽略
        const parent = node.parentElement;
        if (parent && this.shouldIgnoreElement(parent)) {
          return NodeFilter.FILTER_REJECT;
        }

        return NodeFilter.FILTER_ACCEPT;
      },
    });

    let node: Node | null;
    while ((node = walker.nextNode())) {
      textNodes.push(node as Text);
    }

    return textNodes;
  }

  /**
   * 获取元素的纯文本内容
   */
  private getTextContent(element: Element): string {
    const textNodes = this.getTextNodes(element);
    return textNodes
      .map((node) => node.textContent || '')
      .join('')
      .trim();
  }

  /**
   * 判断元素是否应该被忽略
   */
  private shouldIgnoreElement(element: Element): boolean {
    // 检查是否匹配忽略选择器
    if (element.matches(IGNORE_SELECTORS)) {
      return true;
    }

    // 检查是否隐藏
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden') {
      return true;
    }

    // 检查是否已处理过
    if (
      element.hasAttribute('data-wxt-text-processed') ||
      element.hasAttribute('data-wxt-word-processed')
    ) {
      return true;
    }

    return false;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<SegmenterConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 获取当前配置
   */
  getConfig(): SegmenterConfig {
    return { ...this.config };
  }
}
