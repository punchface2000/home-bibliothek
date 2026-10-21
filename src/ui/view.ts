/** What each screen returns to main.ts. */
export interface View {
  el: HTMLElement;
  /** called after the element is in the document (for measuring) */
  mounted?(): void;
  /** called before the view is replaced (stop camera, flush saves) */
  cleanup?(): void;
}
