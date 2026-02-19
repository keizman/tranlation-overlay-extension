type PickerConfirmHandler = (selector: string) => Promise<void> | void;
type PickerCancelHandler = () => void;

interface ElementPickerOptions {
  onConfirm: PickerConfirmHandler;
  onCancel: PickerCancelHandler;
}

interface CandidateParts {
  partsDB: Map<number, string>;
  sliderParts: number[][];
}

export class ElementPickerService {
  private readonly barId = 'illa-element-picker-bar';
  private readonly highlightId = 'illa-element-picker-highlight';
  private readonly modeStyleId = 'illa-element-picker-mode-style';

  private readonly onConfirm: PickerConfirmHandler;
  private readonly onCancel: PickerCancelHandler;

  private barElement: HTMLDivElement | null = null;
  private selectorInput: HTMLInputElement | null = null;
  private statusElement: HTMLSpanElement | null = null;
  private countElement: HTMLSpanElement | null = null;
  private createButton: HTMLButtonElement | null = null;
  private highlightElement: HTMLDivElement | null = null;
  private running = false;

  private readonly handleMouseMoveBound = (event: MouseEvent) =>
    this.handleMouseMove(event);
  private readonly handleClickBound = (event: MouseEvent) =>
    this.handleClick(event);
  private readonly handleKeyDownBound = (event: KeyboardEvent) =>
    this.handleKeyDown(event);
  private readonly handleInputBound = () => this.handleInput();
  private readonly handleCreateBound = () => this.handleCreate();
  private readonly handleCancelBound = () => this.stop(true);

  constructor(options: ElementPickerOptions) {
    this.onConfirm = options.onConfirm;
    this.onCancel = options.onCancel;
  }

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.createModeStyle();
    this.createHighlightElement();
    this.createBarElement();
    this.attachEvents();
    this.updateStatus('Click an element to generate a filter selector.');
    this.updateMatchCount(0);
  }

  stop(cancelled: boolean): void {
    if (!this.running) {
      return;
    }

    this.detachEvents();
    this.removeElementById(this.barId);
    this.removeElementById(this.highlightId);
    this.removeElementById(this.modeStyleId);

    this.barElement = null;
    this.selectorInput = null;
    this.statusElement = null;
    this.countElement = null;
    this.createButton = null;
    this.highlightElement = null;
    this.running = false;

    if (cancelled) {
      this.onCancel();
    }
  }

  private attachEvents(): void {
    document.addEventListener('mousemove', this.handleMouseMoveBound, true);
    document.addEventListener('click', this.handleClickBound, true);
    document.addEventListener('keydown', this.handleKeyDownBound, true);
  }

  private detachEvents(): void {
    document.removeEventListener('mousemove', this.handleMouseMoveBound, true);
    document.removeEventListener('click', this.handleClickBound, true);
    document.removeEventListener('keydown', this.handleKeyDownBound, true);
  }

  private createModeStyle(): void {
    const style = document.createElement('style');
    style.id = this.modeStyleId;
    style.textContent = `
      html.illa-element-picker-active,
      html.illa-element-picker-active * {
        cursor: crosshair !important;
      }
      #${this.barId} {
        position: fixed;
        left: 12px;
        right: 12px;
        bottom: 12px;
        z-index: 2147483646;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px;
        border-radius: 10px;
        border: 1px solid #2f3b47;
        background: #101418;
        color: #e6edf3;
        box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
        box-sizing: border-box;
        font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
      }
      #${this.barId} .illa-picker-status {
        flex: 1 1 auto;
        font-size: 12px;
        min-width: 0;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      #${this.barId} .illa-picker-count {
        font-size: 12px;
        color: #9fb0c0;
        white-space: nowrap;
      }
      #${this.barId} input {
        width: min(46vw, 560px);
        min-width: 180px;
        background: #0b0f13;
        color: #e6edf3;
        border: 1px solid #2f3b47;
        border-radius: 8px;
        padding: 7px 8px;
        font-size: 12px;
        box-sizing: border-box;
      }
      #${this.barId} button {
        border: 1px solid #2f3b47;
        border-radius: 8px;
        background: #161c23;
        color: #e6edf3;
        font-size: 12px;
        padding: 7px 10px;
        cursor: pointer;
      }
      #${this.barId} button:hover {
        background: #202833;
      }
      #${this.barId} button[disabled] {
        opacity: 0.45;
        cursor: not-allowed;
      }
      #${this.highlightId} {
        position: fixed;
        z-index: 2147483645;
        border: 2px solid #17a2ff;
        background: rgba(23, 162, 255, 0.16);
        pointer-events: none;
        display: none;
        box-sizing: border-box;
      }
      @media (max-width: 768px) {
        #${this.barId} {
          left: 8px;
          right: 8px;
          bottom: 8px;
          flex-wrap: wrap;
        }
        #${this.barId} input {
          width: 100%;
          min-width: 120px;
          order: 3;
        }
      }
    `;

    document.documentElement.classList.add('illa-element-picker-active');
    document.documentElement.appendChild(style);
  }

  private createHighlightElement(): void {
    const highlight = document.createElement('div');
    highlight.id = this.highlightId;
    document.documentElement.appendChild(highlight);
    this.highlightElement = highlight;
  }

  private createBarElement(): void {
    const bar = document.createElement('div');
    bar.id = this.barId;
    bar.setAttribute('data-illa-picker-bar', 'true');
    bar.innerHTML = `
      <span class="illa-picker-status" data-role="status"></span>
      <span class="illa-picker-count" data-role="count">0</span>
      <input data-role="selector-input" type="text" placeholder="CSS selector" />
      <button type="button" data-role="create" disabled>Create</button>
      <button type="button" data-role="cancel">Cancel</button>
    `;

    document.documentElement.appendChild(bar);
    this.barElement = bar;
    this.selectorInput = bar.querySelector(
      '[data-role="selector-input"]',
    ) as HTMLInputElement;
    this.statusElement = bar.querySelector(
      '[data-role="status"]',
    ) as HTMLSpanElement;
    this.countElement = bar.querySelector(
      '[data-role="count"]',
    ) as HTMLSpanElement;
    this.createButton = bar.querySelector(
      '[data-role="create"]',
    ) as HTMLButtonElement;

    this.selectorInput.addEventListener('input', this.handleInputBound);
    bar
      .querySelector('[data-role="create"]')
      ?.addEventListener('click', this.handleCreateBound);
    bar
      .querySelector('[data-role="cancel"]')
      ?.addEventListener('click', this.handleCancelBound);
  }

  private handleMouseMove(event: MouseEvent): void {
    if (!this.running) {
      return;
    }

    const target = this.elementFromEvent(event);
    if (!target) {
      return;
    }

    this.updateHighlight(target);
  }

  private handleClick(event: MouseEvent): void {
    if (!this.running) {
      return;
    }

    const target = this.elementFromClickEvent(event);
    if (!target) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    this.updateHighlight(target);
    const selector = this.buildBestSelector(target);
    if (this.selectorInput) {
      this.selectorInput.value = selector;
    }
    this.updateSelectorState(selector);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.running) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.stop(true);
      return;
    }

    if (
      event.key === 'Enter' &&
      this.selectorInput &&
      document.activeElement === this.selectorInput
    ) {
      event.preventDefault();
      this.handleCreate();
    }
  }

  private handleInput(): void {
    const selector = this.selectorInput?.value.trim() || '';
    this.updateSelectorState(selector);
  }

  private async handleCreate(): Promise<void> {
    const selector = this.selectorInput?.value.trim() || '';
    if (!selector) {
      this.updateStatus('Selector is empty.');
      return;
    }

    if (!this.isValidSelector(selector)) {
      this.updateStatus('Selector syntax is invalid.');
      return;
    }

    try {
      await this.onConfirm(selector);
      this.stop(false);
    } catch (error) {
      this.updateStatus(
        error instanceof Error ? error.message : 'Failed to save filter.',
      );
    }
  }

  private updateSelectorState(selector: string): void {
    if (!selector) {
      this.updateStatus('Click an element to generate a selector.');
      this.updateMatchCount(0);
      this.setCreateEnabled(false);
      return;
    }

    if (!this.isValidSelector(selector)) {
      this.updateStatus('Selector syntax is invalid.');
      this.updateMatchCount(0);
      this.setCreateEnabled(false);
      return;
    }

    const count = this.getMatchCount(selector);
    this.updateMatchCount(count);
    this.updateStatus(
      count > 0
        ? `Ready to create filter. Matched ${count} element(s).`
        : 'Selector is valid, but no matching element is found.',
    );
    this.setCreateEnabled(count > 0);
  }

  private setCreateEnabled(enabled: boolean): void {
    if (!this.createButton) {
      return;
    }
    this.createButton.disabled = !enabled;
  }

  private updateStatus(message: string): void {
    if (!this.statusElement) {
      return;
    }
    this.statusElement.textContent = message;
  }

  private updateMatchCount(count: number): void {
    if (!this.countElement) {
      return;
    }
    this.countElement.textContent = `${count}`;
  }

  private buildBestSelector(target: HTMLElement): string {
    const candidates = this.buildCandidateSelectors(target);
    if (candidates.length > 0) {
      const ranked = candidates
        .map((selector) => ({
          selector,
          count: this.getMatchCount(selector),
        }))
        .filter((item) => item.count > 0)
        .sort((a, b) => {
          if (a.count !== b.count) {
            return a.count - b.count;
          }
          return a.selector.length - b.selector.length;
        });

      if (ranked.length > 0) {
        return ranked[0].selector;
      }
    }
    return this.buildFallbackSelector(target);
  }

  private getMatchCount(selector: string): number {
    try {
      return document.querySelectorAll(selector).length;
    } catch {
      return 0;
    }
  }

  private isValidSelector(selector: string): boolean {
    try {
      document.querySelector(selector);
      return true;
    } catch {
      return false;
    }
  }

  private updateHighlight(element: HTMLElement): void {
    if (!this.highlightElement) {
      return;
    }

    const rect = element.getBoundingClientRect();
    this.highlightElement.style.display = 'block';
    this.highlightElement.style.left = `${rect.left}px`;
    this.highlightElement.style.top = `${rect.top}px`;
    this.highlightElement.style.width = `${rect.width}px`;
    this.highlightElement.style.height = `${rect.height}px`;
  }

  private elementFromEvent(event: MouseEvent): HTMLElement | null {
    const element = document.elementFromPoint(event.clientX, event.clientY);
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    if (this.isManagedElement(element)) {
      return null;
    }

    return element;
  }

  private elementFromClickEvent(event: MouseEvent): HTMLElement | null {
    const eventTarget = event.target;
    if (
      eventTarget instanceof HTMLElement &&
      this.isManagedElement(eventTarget)
    ) {
      return null;
    }

    const path = event.composedPath();
    if (
      path.some(
        (node) => node instanceof HTMLElement && this.isManagedElement(node),
      )
    ) {
      return null;
    }

    for (const node of path) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      if (this.isManagedElement(node)) {
        continue;
      }
      return node;
    }
    return this.elementFromEvent(event);
  }

  private isManagedElement(element: HTMLElement): boolean {
    return Boolean(
      element.closest(`#${this.barId}`) ||
        element.closest(`#${this.highlightId}`) ||
        element.id === this.barId ||
        element.id === this.highlightId,
    );
  }

  private removeElementById(id: string): void {
    const element = document.getElementById(id);
    if (element) {
      element.remove();
    }

    if (id === this.modeStyleId) {
      document.documentElement.classList.remove('illa-element-picker-active');
    }
  }

  private buildCandidateSelectors(target: HTMLElement): string[] {
    const details = this.getCandidatesFromElement(target);
    if (!details) {
      return [];
    }

    const targetMajor = 0;
    const selectors: string[] = [];
    for (const addresses of details.sliderParts) {
      if (!addresses.some((value) => value >>> 12 === targetMajor)) {
        continue;
      }

      const selector = this.selectorFromAddresses(details.partsDB, addresses);
      if (!selector || this.excludedSelectors.includes(selector)) {
        continue;
      }
      if (!this.isValidSelector(selector)) {
        continue;
      }
      if (selectors.includes(selector)) {
        continue;
      }
      selectors.push(selector);
      if (selectors.length >= 30) {
        break;
      }
    }
    return selectors;
  }

  private getCandidatesFromElement(
    element: HTMLElement,
  ): CandidateParts | null {
    const partsDB = new Map<number, string>();
    const listParts: number[][] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
      const tagName = current.localName;
      if (!tagName) {
        break;
      }

      const addressMajor = listParts.length << 12;
      partsDB.set(addressMajor, this.cssEscape(tagName));
      const parts = [addressMajor];

      if (current.id) {
        const address = addressMajor | (parts.length << 4) | 1;
        partsDB.set(address, `#${this.cssEscape(current.id)}`);
        parts.push(address);
      }

      for (const className of Array.from(current.classList)) {
        const address = addressMajor | (parts.length << 4) | 2;
        partsDB.set(address, `.${this.cssEscape(className)}`);
        parts.push(address);
      }

      for (const attrName of current.getAttributeNames()) {
        if (attrName === 'id' || attrName === 'class') {
          continue;
        }

        const attrValue = current.getAttribute(attrName);
        const address = addressMajor | (parts.length << 4) | 3;
        if (
          this.excludedAttributeExpansion.includes(attrName) ||
          typeof attrValue !== 'string'
        ) {
          partsDB.set(address, `[${this.cssEscape(attrName)}]`);
          parts.push(address);
          continue;
        }

        const lineBreak = attrValue.search(/[\n\r]/);
        const normalizedValue =
          lineBreak === -1 ? attrValue : attrValue.slice(0, lineBreak);
        partsDB.set(
          address,
          `[${this.cssEscape(attrName)}="${this.cssEscape(normalizedValue)}"]`,
        );
        parts.push(address);
      }

      const parentNode = current.parentElement;
      if (
        parentNode &&
        this.safeQuerySelectorAll(
          parentNode,
          `:scope > ${this.selectorFromAddresses(partsDB, parts)}`,
        ).length > 1
      ) {
        let nth = 1;
        let sibling = current.previousElementSibling;
        while (sibling) {
          if (sibling.localName === tagName) {
            nth += 1;
          }
          sibling = sibling.previousElementSibling;
        }
        const address = addressMajor | (parts.length << 4) | 4;
        partsDB.set(address, `:nth-of-type(${nth})`);
        parts.push(address);
      }

      listParts.push(parts);
      current = current.parentElement;
    }

    if (listParts.length === 0) {
      return null;
    }

    const sliderCandidates: number[][] = [];
    for (let i = 0; i < listParts.length; i += 1) {
      sliderCandidates.push([...listParts[i]]);
      for (let j = i + 1; j < listParts.length; j += 1) {
        sliderCandidates.push([...listParts[j], ...sliderCandidates.at(-1)!]);
      }
    }

    const sliderMap = new Map<string, number>();
    for (const candidates of sliderCandidates) {
      if (candidates.some((value) => (value & 0xf) === 1)) {
        const selectorPath = candidates.filter((value) => (value & 0xf) === 1);
        sliderMap.set(JSON.stringify(selectorPath), 0);
      } else if (candidates.some((value) => (value & 0xf) === 4)) {
        const selectorPath = candidates.filter((value) => {
          const descriptor = value & 0xf;
          return descriptor === 0 || descriptor === 4;
        });
        sliderMap.set(JSON.stringify(selectorPath), 0);
      }

      if (candidates.some((value) => (value & 0xf) === 2)) {
        const selectorPath = candidates.filter((value) => {
          const descriptor = value & 0xf;
          return descriptor === 0 || descriptor === 2;
        });
        sliderMap.set(JSON.stringify(selectorPath), 0);
      }

      const selectorPath = candidates.filter((value) => {
        const descriptor = value & 0xf;
        return descriptor === 0 || descriptor === 3;
      });
      sliderMap.set(JSON.stringify(selectorPath), 0);
    }
    sliderMap.delete('[]');

    const elementIdMap = new Map<Element, number>();
    const resultSetMap = new Map<string, number[]>();
    let nextElementId = 1;

    for (const json of sliderMap.keys()) {
      const addresses = JSON.parse(json) as number[];
      const selector = this.selectorFromAddresses(partsDB, addresses);
      if (!selector || this.excludedSelectors.includes(selector)) {
        continue;
      }
      const matchedElements = this.safeQuerySelectorAll(document, selector);
      if (matchedElements.length === 0) {
        continue;
      }

      const resultSet: number[] = [];
      for (const matched of matchedElements) {
        if (!elementIdMap.has(matched)) {
          elementIdMap.set(matched, nextElementId);
          nextElementId += 1;
        }
        resultSet.push(elementIdMap.get(matched)!);
      }

      resultSet.sort((a, b) => a - b);
      const resultSetKey = JSON.stringify(resultSet);
      const currentBest = resultSetMap.get(resultSetKey);
      if (currentBest) {
        if (currentBest.length < addresses.length) {
          continue;
        }
        if (currentBest.length === addresses.length) {
          const newHasClass = addresses.some((value) => (value & 0xf) === 2);
          const bestHasClass = currentBest.some((value) => (value & 0xf) === 2);
          if (!newHasClass && bestHasClass) {
            continue;
          }
        }
      }
      resultSetMap.set(resultSetKey, addresses);
    }

    const sliderParts = Array.from(resultSetMap.values())
      .sort((a, b) => {
        let aMajor = a.at(-1)! >>> 12;
        let bMajor = b.at(-1)! >>> 12;
        if (aMajor !== bMajor) return bMajor - aMajor;

        aMajor = a[0] >>> 12;
        bMajor = b[0] >>> 12;
        if (aMajor !== bMajor) return bMajor - aMajor;

        const aDepth = this.safeQuerySelectorAll(
          document,
          this.selectorFromAddresses(partsDB, a),
        ).length;
        const bDepth = this.safeQuerySelectorAll(
          document,
          this.selectorFromAddresses(partsDB, b),
        ).length;
        if (aDepth !== bDepth) return aDepth - bDepth;

        return a.length - b.length;
      })
      .slice(0, 40);

    return {
      partsDB,
      sliderParts,
    };
  }

  private selectorFromAddresses(
    partsDB: Map<number, string>,
    addresses: number[],
  ): string {
    const selectorParts: string[] = [];
    let previousMajor = -1;
    for (const address of addresses) {
      const major = address >>> 12;
      if (previousMajor !== -1) {
        const delta = previousMajor - major;
        if (delta > 1) {
          selectorParts.push(' ');
        } else if (delta === 1) {
          selectorParts.push(' > ');
        }
      }
      previousMajor = major;

      const part = partsDB.get(address);
      if (!part) continue;
      selectorParts.push(part);
    }
    return selectorParts.join('');
  }

  private buildFallbackSelector(element: HTMLElement): string {
    if (element.id) {
      return `#${this.cssEscape(element.id)}`;
    }

    const segments: string[] = [];
    let current: HTMLElement | null = element;
    while (current && current !== document.body && segments.length < 5) {
      let segment = current.localName || 'div';
      if (current.classList.length > 0) {
        segment += `.${this.cssEscape(current.classList.item(0)!)}`;
      } else {
        const nth = this.getNthOfType(current);
        segment += `:nth-of-type(${nth})`;
      }
      segments.unshift(segment);
      current = current.parentElement;
    }
    return segments.join(' > ');
  }

  private getNthOfType(element: HTMLElement): number {
    const tag = element.localName;
    let count = 1;
    let sibling = element.previousElementSibling;
    while (sibling) {
      if (sibling.localName === tag) {
        count += 1;
      }
      sibling = sibling.previousElementSibling;
    }
    return count;
  }

  private safeQuerySelectorAll(root: ParentNode, selector: string): Element[] {
    try {
      return Array.from(root.querySelectorAll(selector));
    } catch {
      return [];
    }
  }

  private cssEscape(value: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(value);
    }
    return value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  }

  private readonly excludedAttributeExpansion = ['sizes', 'srcset'];
  private readonly excludedSelectors = ['div', 'span'];
}
