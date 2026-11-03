/** The keyboard's inset, with readings taken from Safari on an iPhone 17 Pro. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fullHeight, keyboardInset, keyboardIsUp, pinShift, viewportPan } from "../src/viewport";

const reading = { innerHeight: 714, height: 714, offsetTop: 0, scale: 1 };

test("no keyboard, no inset", () => {
  assert.equal(keyboardInset(reading), 0);
});

test("the keyboard over a page that stayed put", () => {
  assert.equal(keyboardInset({ ...reading, height: 377 }), 337);
});

test("a page iOS panned all the way has already carried fixed things up", () => {
  assert.equal(keyboardInset({ ...reading, height: 377, offsetTop: 337 }), 0);
});

test("a page panned part of the way only needs the rest", () => {
  assert.equal(keyboardInset({ ...reading, height: 377, offsetTop: 100 }), 237);
});

test("a pinch is not a keyboard", () => {
  assert.equal(keyboardInset({ ...reading, height: 357, offsetTop: 40, scale: 2 }), 0);
});

test("never below zero, as when the toolbars settle", () => {
  assert.equal(keyboardInset({ ...reading, height: 720 }), 0);
});

test("a keyboard is up when it takes real room, not for a bar", () => {
  assert.equal(keyboardIsUp(714, 377), true);
  assert.equal(keyboardIsUp(714, 712), false);
  assert.equal(keyboardIsUp(714, 714), false);
});

test("the pan is what a fixed pin has to add back", () => {
  assert.equal(viewportPan({ ...reading, height: 377, offsetTop: 205 }), 205);
  assert.equal(viewportPan(reading), 0);
});

test("a pinch's pan is not the keyboard's", () => {
  assert.equal(viewportPan({ ...reading, height: 357, offsetTop: 40, scale: 2 }), 0);
});

/* Readings from Chrome on an Android 15 emulator, with interactive-widget=resizes-content. */
test("a layout that shrinks with the keyboard still counts as one", () => {
  const tallest = new Map<number, number>();
  assert.equal(keyboardIsUp(fullHeight(tallest, 412, 783), 783), false);
  assert.equal(keyboardIsUp(fullHeight(tallest, 412, 471), 471), true);
  assert.equal(keyboardIsUp(fullHeight(tallest, 412, 783), 783), false);
});

test("the address bar coming and going isn't a keyboard", () => {
  const tallest = new Map<number, number>();
  fullHeight(tallest, 412, 839);
  assert.equal(keyboardIsUp(fullHeight(tallest, 412, 783), 783), false);
});

test("each width keeps its own height", () => {
  const tallest = new Map<number, number>();
  fullHeight(tallest, 412, 783);
  assert.equal(fullHeight(tallest, 915, 360), 360);
  assert.equal(fullHeight(tallest, 412, 471), 783);
});

test("a pin shifts by the pan only where scrollY moves with it", () => {
  assert.equal(pinShift(245, 245, 245), 245); // Safari on iOS
  assert.equal(pinShift(145, 145, 0), 0); // Chrome on Android
});
