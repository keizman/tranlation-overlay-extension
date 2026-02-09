import { createModuleLogger } from '../../shared/utils/Report';
import i18n from '../../../i18n';

type FeedbackCategory = 'network' | 'business' | 'system';

interface ClassifiedError {
  category: FeedbackCategory;
  statusCode?: number;
  technicalMessage: string;
}

const logger = createModuleLogger('UserFeedbackService');

const TOAST_CONTAINER_ID = 'wxt-feedback-toast-container';
const TOAST_CLASS_NAME = 'wxt-feedback-toast';
const TOAST_DURATION_MS = 3000;
const FALLBACK_MESSAGES = {
  network: 'Network error. Please check your connection and try again.',
  business: 'Service request failed. Please try again later.',
  businessWithStatus:
    'Service error (HTTP {statusCode}). Please try again later.',
  system: 'System error. Please refresh the page and try again.',
} as const;

export class UserFeedbackService {
  private static instance: UserFeedbackService;
  private hideTimer: number | null = null;

  static getInstance(): UserFeedbackService {
    if (!UserFeedbackService.instance) {
      UserFeedbackService.instance = new UserFeedbackService();
    }
    return UserFeedbackService.instance;
  }

  public showActionError(action: string, error: unknown): string {
    const classified = this.classifyError(error);
    const userMessage = this.buildUserMessage(classified);

    this.showToast(userMessage, classified.category);
    logger.error('User action failed', {
      action,
      category: classified.category,
      statusCode: classified.statusCode,
      technicalMessage: classified.technicalMessage,
    });

    return userMessage;
  }

  private classifyError(error: unknown): ClassifiedError {
    const technicalMessage =
      error instanceof Error ? error.message : String(error);
    const lower = technicalMessage.toLowerCase();
    const statusCode = this.extractStatusCode(technicalMessage);

    const hasNetworkHint =
      lower.includes('failed to fetch') ||
      lower.includes('networkerror') ||
      lower.includes('network error') ||
      lower.includes('timed out') ||
      lower.includes('timeout') ||
      lower.includes('aborterror') ||
      lower.includes('connection') ||
      lower.includes('econn') ||
      lower.includes('dns');

    if (hasNetworkHint) {
      return {
        category: 'network',
        technicalMessage,
        statusCode,
      };
    }

    if (statusCode && statusCode >= 400) {
      return {
        category: 'business',
        technicalMessage,
        statusCode,
      };
    }

    return {
      category: 'system',
      technicalMessage,
      statusCode,
    };
  }

  private extractStatusCode(message: string): number | undefined {
    const match = message.match(
      /(?:http|status|code|api 请求失败[:\s]*)\D*(\d{3})/i,
    );
    if (!match) {
      return undefined;
    }

    const parsed = Number(match[1]);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private buildUserMessage(classified: ClassifiedError): string {
    if (classified.category === 'network') {
      return this.translateWithFallback(
        'errors.actionFeedback.network',
        FALLBACK_MESSAGES.network,
      );
    }

    if (classified.category === 'business') {
      if (classified.statusCode) {
        return this.translateWithFallback(
          'errors.actionFeedback.businessWithStatus',
          FALLBACK_MESSAGES.businessWithStatus.replace(
            '{statusCode}',
            String(classified.statusCode),
          ),
          {
            statusCode: classified.statusCode,
          },
        );
      }
      return this.translateWithFallback(
        'errors.actionFeedback.business',
        FALLBACK_MESSAGES.business,
      );
    }

    return this.translateWithFallback(
      'errors.actionFeedback.system',
      FALLBACK_MESSAGES.system,
    );
  }

  private translateWithFallback(
    key: string,
    fallback: string,
    params: Record<string, unknown> = {},
  ): string {
    try {
      const translated = i18n.global.t(key, params);
      if (typeof translated === 'string' && translated !== key) {
        return translated;
      }
    } catch (error) {
      logger.warn('Failed to resolve i18n key for feedback message', {
        key,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return fallback;
  }

  private showToast(message: string, category: FeedbackCategory): void {
    const container = this.getOrCreateContainer();
    const toast = this.createToastElement(message, category);
    container.replaceChildren(toast);

    window.requestAnimationFrame(() => {
      toast.classList.add('is-visible');
    });

    if (this.hideTimer) {
      window.clearTimeout(this.hideTimer);
      this.hideTimer = null;
    }

    this.hideTimer = window.setTimeout(() => {
      toast.classList.remove('is-visible');
      window.setTimeout(() => {
        if (container.firstChild === toast) {
          container.replaceChildren();
        }
      }, 180);
    }, TOAST_DURATION_MS);
  }

  private getOrCreateContainer(): HTMLElement {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (container) {
      return container;
    }

    this.ensureStyles();

    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.style.position = 'fixed';
    container.style.top = '16px';
    container.style.left = '50%';
    container.style.transform = 'translateX(-50%)';
    container.style.zIndex = '2147483647';
    container.style.pointerEvents = 'none';
    container.style.maxWidth = 'min(90vw, 520px)';
    document.documentElement.appendChild(container);
    return container;
  }

  private createToastElement(
    message: string,
    category: FeedbackCategory,
  ): HTMLElement {
    const toast = document.createElement('div');
    toast.className = `${TOAST_CLASS_NAME} ${TOAST_CLASS_NAME}--${category}`;
    toast.textContent = message;
    return toast;
  }

  private ensureStyles(): void {
    if (document.getElementById('wxt-feedback-toast-style')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'wxt-feedback-toast-style';
    style.textContent = `
      .${TOAST_CLASS_NAME} {
        opacity: 0;
        transform: translateY(-8px) scale(0.98);
        transition: opacity 160ms ease, transform 180ms ease;
        color: #ffffff;
        border-radius: 10px;
        padding: 10px 14px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
        backdrop-filter: blur(4px);
        font-size: 13px;
        font-weight: 600;
        line-height: 1.35;
      }

      .${TOAST_CLASS_NAME}.is-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      .${TOAST_CLASS_NAME}--network {
        background: linear-gradient(135deg, #0ea5e9, #2563eb);
      }

      .${TOAST_CLASS_NAME}--business {
        background: linear-gradient(135deg, #ef4444, #dc2626);
      }

      .${TOAST_CLASS_NAME}--system {
        background: linear-gradient(135deg, #fb923c, #ea580c);
      }
    `;
    document.head.appendChild(style);
  }
}
