/** The on-screen keyboard's share of the screen, worked out from the visual viewport. */

export type ViewportReading = {
  /** `window.innerHeight`: the layout viewport, which iOS leaves full height under the keyboard. */
  innerHeight: number;
  /** `visualViewport.height`: what's left on screen. */
  height: number;
  /** `visualViewport.offsetTop`: how far iOS has panned to reveal a field. */
  offsetTop: number;
  /** `visualViewport.scale`: above 1 the visitor has pinched in. */
  scale: number;
};

/**
 * How far a thing fixed to the bottom must rise to sit above the keyboard. A panned page has
 * already carried fixed things up by `offsetTop`, so that part is not counted twice. A pinch shrinks
 * the visual viewport too, without any keyboard, and rising for it would crush the sheet.
 */
export function keyboardInset({ innerHeight, height, offsetTop, scale }: ViewportReading): number {
  if (scale > 1.01) return 0;
  return Math.max(0, Math.round(innerHeight - height - offsetTop));
}

/**
 * How far iOS has panned the screen across the layout viewport. While the keyboard is up, scrolling
 * pans first, which moves the page under fixed things: `getBoundingClientRect` reads from the screen
 * but `position: fixed` places from the layout viewport, so a fixed thing marking a point on the
 * page has to add this back. A pinch's pan is left out, as the inset leaves out its height.
 */
export function viewportPan({ offsetTop, scale }: ViewportReading): number {
  return scale > 1.01 ? 0 : Math.round(offsetTop);
}

/** Whether a real keyboard is up, rather than a toolbar or the accessory bar of a hardware one. */
export function keyboardIsUp(innerHeight: number, height: number): boolean {
  return innerHeight - height > 100;
}
