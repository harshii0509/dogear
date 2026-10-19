import { spring, stagger } from "motion";
import { animate } from "motion/mini";

/**
 * The layer's motion, on motion's small build: `animate` runs on the browser's own animations
 * (WAAPI), and `spring` becomes a CSS `linear()` curve, so it costs a few kB rather than all of
 * motion. It animates real CSS properties only: `scale`, `rotate` in deg, `translate` in px.
 *
 * A press goes in fast with no bounce, so it answers at once; letting go springs back with a
 * little, so it feels alive. The rare, happy moments (a reaction you just left) may be playful.
 * With reduced motion, the callers skip all of it.
 */

export { animate, stagger };

export const PRESS_IN = { duration: 0.08, ease: [0.25, 0.46, 0.45, 0.94] } as const;
export const RELEASE = { type: spring, visualDuration: 0.35, bounce: 0.45 };
export const POP = { type: spring, visualDuration: 0.4, bounce: 0.5 };
export const ROLL = { type: spring, visualDuration: 0.28, bounce: 0.2 };
export const EASE_OUT = [0.215, 0.61, 0.355, 1] as const;

export const reduced = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
export const finePointer = () =>
  typeof matchMedia === "function" && matchMedia("(hover: hover) and (pointer: fine)").matches;

/** What a transform property is when nothing has set it. */
const AT_REST: Record<string, string> = { scale: "1", rotate: "0deg", translate: "0px 0px" };

/** The properties an animation moves, or none if it can't say. */
function moves(animation: Animation): string[] {
  const effect = animation.effect;
  if (!(effect instanceof KeyframeEffect)) return [];
  if (animation instanceof CSSTransition) return [animation.transitionProperty];
  return effect.getKeyframes().flatMap((frame) => Object.keys(frame));
}

/**
 * Animates from wherever the element is now, cutting off whatever was running on the same
 * properties, so a press let go mid-squash springs back from that point rather than jumping.
 * Anything else running on it (an entrance's fade) carries on: cancelled, it would leave the
 * fade's first frame behind and the element invisible.
 */
export function to(
  element: Element,
  target: Record<string, string>,
  options: Parameters<typeof animate>[2],
) {
  const now = getComputedStyle(element);
  const keyframes: Record<string, string[]> = {};
  for (const [property, value] of Object.entries(target)) {
    const current = now.getPropertyValue(property);
    keyframes[property] = [!current || current === "none" ? (AT_REST[property] ?? "") : current, value];
  }
  for (const running of element.getAnimations()) {
    if (moves(running).some((property) => property in target)) running.cancel();
  }
  return animate(element, keyframes, options);
}
