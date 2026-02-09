export interface PageLanguageSnapshot {
  htmlLang: string | null;
  metaContentLanguage: string | null;
  textSample: string;
}

export interface PageLanguagePort {
  getSnapshot(sampleLength: number): PageLanguageSnapshot;
}
