export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface SelectionSnapshot {
  text: string;
  rect: RectLike | null;
}

export interface SelectionPort {
  getSelectionSnapshot(): SelectionSnapshot | null;
}
