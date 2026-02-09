export interface TextInjectionPort {
  replaceSelection(text: string): boolean;
  insertAtCursor(text: string): boolean;
}
