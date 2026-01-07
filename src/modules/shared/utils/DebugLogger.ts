/**
 * 全局调试日志工具
 *
 * 已重构：移除调试面板，改用 WebSocket 上报
 * 保留原有 API 以兼容现有模块
 */

import { report, createModuleLogger as createReportLogger } from './Report';

// 调试开关 - 可通过设置控制
let DEBUG_ENABLED = true;

/**
 * 设置调试开关
 */
export function setDebugEnabled(enabled: boolean): void {
  DEBUG_ENABLED = enabled;
  console.log(`[DebugLogger] 调试模式: ${enabled ? '开启' : '关闭'}`);
}

/**
 * 调试日志 - 输出到控制台和 WebSocket
 */
export function debug(module: string, msg: string, ...args: unknown[]): void {
  if (!DEBUG_ENABLED) return;
  report.log(module, msg, ...args);
}

/**
 * 警告日志
 */
export function warn(module: string, msg: string, ...args: unknown[]): void {
  report.warn(module, msg, ...args);
}

/**
 * 错误日志
 */
export function error(module: string, msg: string, ...args: unknown[]): void {
  report.error(module, msg, ...args);
}

/**
 * 创建模块专用 logger
 */
export function createModuleLogger(moduleName: string) {
  const logger = createReportLogger(moduleName);
  return {
    log: (msg: string, ...args: unknown[]) => {
      if (!DEBUG_ENABLED) return;
      logger.log(msg, ...args);
    },
    warn: logger.warn,
    error: logger.error,
  };
}
