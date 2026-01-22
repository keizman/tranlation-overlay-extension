/**
 * API相关工具函数
 */

/**
 * 合并自定义参数到基础参数对象
 */
export function mergeCustomParams(
  baseParams: any,
  customParamsJson?: string,
): any {
  const merged = { ...baseParams };
  const protectedKeys = ['model', 'messages', 'apiKey'];

  if (!customParamsJson?.trim()) return merged;

  try {
    const customParams = JSON.parse(customParamsJson);
    Object.entries(customParams).forEach(([key, value]) => {
      if (!protectedKeys.includes(key)) {
        merged[key] = value;
      } else {
        console.warn(`忽略受保护的参数: ${key}`);
      }
    });
  } catch (error) {
    console.warn('自定义参数JSON解析失败:', error);
  }

  return merged;
}

/**
 * 创建通用的错误响应
 */
export function createErrorResponse(originalText: string) {
  return {
    original: originalText,
    processed: originalText,
    replacements: [],
  };
}

/**
 * 验证文本和配置
 */
export function validateInputs(text: string, apiKey?: string): boolean {
  return !!(text?.trim() && apiKey?.trim());
}
