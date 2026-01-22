/**
 * 词典卡片组件
 */

import type { DictionaryResponse } from '../types';
import { i18n } from '@/src/i18n';

// i18n helper
const t = (key: string) => i18n.global.t(key);

// ============================================================================
// 图标 SVG
// ============================================================================

const ICONS = {
  logo: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>`,
  pin: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
  star: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`,
  starOutline: `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z"/></svg>`,
  volume: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>`,
  chevronDown: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>`,
  arrowRight: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/></svg>`,
  search: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>`,
};

// ============================================================================
// 渲染函数
// ============================================================================

/**
 * 创建卡片 HTML
 */
export function createCardHTML(
  data: DictionaryResponse,
  options: { starred?: boolean; pinned?: boolean } = {},
): string {
  const { starred = false, pinned = false } = options;

  return `
    <div class="wxt-word-card-header">
      <div class="wxt-word-card-header-left">
        ${ICONS.logo}
        <span class="wxt-word-card-title">${t('wordCardUI.title')}</span>
      </div>
      <div class="wxt-word-card-header-right">
        <button class="wxt-word-card-header-btn ${pinned ? 'pinned' : ''}" data-action="pin" title="${t('common.pin')}">
          ${ICONS.pin}
        </button>
        <button class="wxt-word-card-header-btn" data-action="close" title="${t('common.close')}">
          ${ICONS.close}
        </button>
      </div>
    </div>

    <div class="wxt-word-card-headword">
      <span class="wxt-word-card-word">${escapeHtml(data.word)}</span>
      <button class="wxt-word-card-star ${starred ? 'starred' : ''}" data-action="star" title="${t('common.star')}">
        ${starred ? ICONS.star : ICONS.starOutline}
      </button>
    </div>

    ${renderPhonetics(data.phonetics)}

    <div class="wxt-word-card-content">
      ${renderTranslations(data.translations)}
      ${renderDefinitions(data.definitions)}
      ${renderExchange(data.exchange)}
    </div>

    <div class="wxt-word-card-footer">
      <div class="wxt-word-card-footer-left">
        <button class="wxt-word-card-menu-btn" data-action="menu" title="${t('common.more')}">
          ${ICONS.menu}
        </button>
      </div>
      <a class="wxt-word-card-detail-link" href="${escapeHtml(data.detailUrl)}" target="_blank" rel="noopener">
        ${t('wordCardUI.detail')} ${ICONS.arrowRight}
      </a>
    </div>
  `;
}

/**
 * 渲染音标区
 */
function renderPhonetics(phonetics: DictionaryResponse['phonetics']): string {
  // Always render US option for TTS fallback, or if US phonetics exist
  // Render UK only if UK phonetics exist

  return `
    <div class="wxt-word-card-phonetics">
      <div class="wxt-word-card-phonetic">
        <button class="wxt-word-card-phonetic-btn" data-action="speak" data-accent="us" title="US">
          ${ICONS.volume}
        </button>
        <span class="wxt-word-card-phonetic-label">US</span>
        ${phonetics.us ? `<span class="wxt-word-card-phonetic-text">/${escapeHtml(phonetics.us)}/</span>` : ''}
      </div>

      ${
        phonetics.uk
          ? `
        <div class="wxt-word-card-phonetic">
          <button class="wxt-word-card-phonetic-btn" data-action="speak" data-accent="uk" title="UK">
            ${ICONS.volume}
          </button>
          <span class="wxt-word-card-phonetic-label">UK</span>
          <span class="wxt-word-card-phonetic-text">/${escapeHtml(phonetics.uk)}/</span>
        </div>
        `
          : ''
      }
    </div>
  `;
}

/**
 * 渲染中文翻译
 */
function renderTranslations(
  translations: DictionaryResponse['translations'],
): string {
  if (!translations || translations.length === 0) {
    return '';
  }

  const items = translations
    .map((t, i) => {
      const pos = t.pos
        ? `<span class="wxt-word-card-definition-pos">${escapeHtml(t.pos)}</span>`
        : '';
      const meanings = t.meanings.join('；');
      return `
      <div class="wxt-word-card-definition">
        <span class="wxt-word-card-definition-num">${i + 1}.</span>
        <div class="wxt-word-card-definition-content">
          ${pos}
          <span class="wxt-word-card-definition-text">${escapeHtml(meanings)}</span>
        </div>
      </div>
    `;
    })
    .join('');

  return `
    <div class="wxt-word-card-dict">
      <div class="wxt-word-card-dict-header" data-action="toggle-dict">
        ${ICONS.chevronDown}
        <span class="wxt-word-card-dict-name">${t('wordCardUI.enZh')}</span>
      </div>
      <div class="wxt-word-card-definitions">
        ${items}
      </div>
    </div>
  `;
}

/**
 * 渲染英文释义
 */
function renderDefinitions(
  definitions: DictionaryResponse['definitions'],
): string {
  if (!definitions || definitions.length === 0) {
    return '';
  }

  const items = definitions
    .slice(0, 4)
    .map((d, i) => {
      const pos = d.partOfSpeech
        ? `<span class="wxt-word-card-definition-pos">${escapeHtml(d.partOfSpeech)}</span>`
        : '';
      return `
      <div class="wxt-word-card-definition">
        <span class="wxt-word-card-definition-num">${i + 1}.</span>
        <div class="wxt-word-card-definition-content">
          ${pos}
          <span class="wxt-word-card-definition-text">${escapeHtml(d.definition)}</span>
        </div>
      </div>
    `;
    })
    .join('');

  return `
    <div class="wxt-word-card-dict">
      <div class="wxt-word-card-dict-header" data-action="toggle-dict">
        ${ICONS.chevronDown}
        <span class="wxt-word-card-dict-name">${t('wordCardUI.enEn')}</span>
      </div>
      <div class="wxt-word-card-definitions">
        ${items}
      </div>
    </div>
  `;
}

/**
 * 渲染词形变化
 */
function renderExchange(exchange: DictionaryResponse['exchange']): string {
  if (!exchange) {
    return '';
  }

  const forms: { label: string; value: string }[] = [];

  if (exchange.past)
    forms.push({ label: t('wordCardUI.grammar.past'), value: exchange.past });
  if (exchange.pastParticiple)
    forms.push({
      label: t('wordCardUI.grammar.pastParticiple'),
      value: exchange.pastParticiple,
    });
  if (exchange.presentParticiple)
    forms.push({
      label: t('wordCardUI.grammar.presentParticiple'),
      value: exchange.presentParticiple,
    });
  if (exchange.thirdPerson)
    forms.push({
      label: t('wordCardUI.grammar.thirdPerson'),
      value: exchange.thirdPerson,
    });
  if (exchange.plural)
    forms.push({
      label: t('wordCardUI.grammar.plural'),
      value: exchange.plural,
    });
  if (exchange.comparative)
    forms.push({
      label: t('wordCardUI.grammar.comparative'),
      value: exchange.comparative,
    });
  if (exchange.superlative)
    forms.push({
      label: t('wordCardUI.grammar.superlative'),
      value: exchange.superlative,
    });

  if (forms.length === 0) {
    return '';
  }

  const rows = forms
    .map(
      (f) => `
    <div class="wxt-word-card-exchange-row">
      <span class="wxt-word-card-exchange-label">${f.label}:</span>
      <span class="wxt-word-card-exchange-tag" data-action="lookup" data-word="${escapeHtml(f.value)}">${escapeHtml(f.value)}</span>
    </div>
  `,
    )
    .join('');

  return `
    <div class="wxt-word-card-exchange">
      ${rows}
    </div>
  `;
}

/**
 * 创建加载状态 HTML
 */
export function createLoadingHTML(): string {
  return `
    <div class="wxt-word-card-header">
      <div class="wxt-word-card-header-left">
        ${ICONS.logo}
        <span class="wxt-word-card-title">${t('wordCardUI.title')}</span>
      </div>
      <div class="wxt-word-card-header-right">
        <button class="wxt-word-card-header-btn" data-action="close" title="${t('common.close')}">
          ${ICONS.close}
        </button>
      </div>
    </div>
    <div class="wxt-word-card-loading">
      <div class="wxt-word-card-spinner"></div>
    </div>
  `;
}

/**
 * 创建错误状态 HTML
 */
export function createErrorHTML(message: string): string {
  return `
    <div class="wxt-word-card-header">
      <div class="wxt-word-card-header-left">
        ${ICONS.logo}
        <span class="wxt-word-card-title">${t('wordCardUI.title')}</span>
      </div>
      <div class="wxt-word-card-header-right">
        <button class="wxt-word-card-header-btn" data-action="close" title="${t('common.close')}">
          ${ICONS.close}
        </button>
      </div>
    </div>
    <div class="wxt-word-card-error">
      <div class="wxt-word-card-error-icon">😔</div>
      <div class="wxt-word-card-error-text">${escapeHtml(message)}</div>
    </div>
  `;
}

/**
 * 创建查词图标 HTML
 */
export function createIconHTML(): string {
  return ICONS.search;
}

// ============================================================================
// 工具函数
// ============================================================================

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
