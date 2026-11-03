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

/**
 * How far a pin must move to stay on its point while the screen is panned. iOS moves `scrollY` with
 * the pan, and rects are read from the screen, so it needs the whole pan added back. Chrome pans
 * without moving `scrollY`, and its rects and fixed things share the layout viewport: nothing to add.
 */
export function pinShift(pan: number, pageTop: number, scrollY: number): number {
  return Math.abs(pageTop - scrollY) < 1 ? pan : 0;
}

/** Whether a real keyboard is up, rather than a toolbar or the accessory bar of a hardware one. */
export function keyboardIsUp(fullHeight: number, height: number): boolean {
  return fullHeight - height > 100;
}

/**
 * The height to measure a keyboard against: the tallest the layout viewport has been at this width.
 * With `interactive-widget=resizes-content`, Android shrinks the layout viewport along with the
 * visual one, so `innerHeight` alone never shows a keyboard. By width, so turning the phone doesn't
 * measure one side against the other.
 */
export function fullHeight(tallest: Map<number, number>, width: number, innerHeight: number): number {
  const full = Math.max(tallest.get(width) ?? 0, innerHeight);
  tallest.set(width, full);
  return full;
}
