import type { PageContentPort } from '../../../core/ports';

export class BrowserPageContentAdapter implements PageContentPort {
  getPageTextSample(sampleLength: number): string {
    try {
      return document.body?.innerText?.substring(0, sampleLength) || '';
    } catch (_) {
      return '';
    }
  }
}
