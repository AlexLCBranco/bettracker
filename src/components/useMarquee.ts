'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

// BT-45: drag a box over the Bets table to select rows. A press on a row outside any text, box, button or link starts
// it (a press on text still selects text, as before); every row the box touches is selected, and the page scrolls when
// the pointer nears the top or bottom edge.

const INTERACTIVE = 'input, textarea, select, button, a, label, [role=button], [role=dialog], [role=menu], [contenteditable=true]';
const EDGE = 48;
const START = 5;

/** A typing box keeps the focus through a drag; the keys belong to the table then. */
function blurBox() {
  const a = document.activeElement as HTMLElement | null;
  if (a?.matches('input, textarea, select, [contenteditable=true]')) a.blur();
}

/** True when the point is on a character of text (not just near it). */
function onText(x: number, y: number): boolean {
  const d = document as Document & {
    caretPositionFromPoint?(x: number, y: number): { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?(x: number, y: number): Range | null;
  };
  let node: Node | null | undefined;
  let offset = 0;
  if (d.caretPositionFromPoint) {
    const p = d.caretPositionFromPoint(x, y);
    node = p?.offsetNode;
    offset = p?.offset ?? 0;
  } else if (d.caretRangeFromPoint) {
    const r = d.caretRangeFromPoint(x, y);
    node = r?.startContainer;
    offset = r?.startOffset ?? 0;
  }
  if (!node || node.nodeType !== Node.TEXT_NODE) return false;
  const len = (node as Text).length;
  const range = document.createRange();
  for (const o of [offset - 1, offset]) {
    if (o < 0 || o >= len) continue;
    range.setStart(node, o);
    range.setEnd(node, o + 1);
    const r = range.getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
  }
  return false;
}

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * `pick(lineKeys, additive, first)` gets the data-key of every table line the box touches (Ctrl / ⌘ held = add to the
 * selection). Returns the box to draw (viewport coordinates) while dragging. A click that ends a drag is swallowed.
 */
export function useMarquee(container: RefObject<HTMLElement | null>, pick: (lineKeys: string[], additive: boolean, first: boolean) => void): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  const pickRef = useRef(pick);
  useEffect(() => {
    pickRef.current = pick;
  });

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let start: { x: number; y: number; additive: boolean } | null = null;
    let dragging = false;
    let first = false;
    let last = { x: 0, y: 0 };
    let raf = 0;

    const update = () => {
      if (!start) return;
      const x1 = Math.min(start.x, last.x + window.scrollX);
      const x2 = Math.max(start.x, last.x + window.scrollX);
      const y1 = Math.min(start.y, last.y + window.scrollY);
      const y2 = Math.max(start.y, last.y + window.scrollY);
      setBox({ left: x1 - window.scrollX, top: y1 - window.scrollY, width: x2 - x1, height: y2 - y1 });
      const keys: string[] = [];
      for (const tr of el.querySelectorAll<HTMLElement>('tr[data-key]')) {
        const r = tr.getBoundingClientRect();
        const top = r.top + window.scrollY;
        const bottom = r.bottom + window.scrollY;
        const left = r.left + window.scrollX;
        const right = r.right + window.scrollX;
        if (bottom >= y1 && top <= y2 && right >= x1 && left <= x2) keys.push(tr.dataset.key!);
      }
      pickRef.current(keys, start.additive, first);
      first = false;
    };

    const scroll = () => {
      raf = 0;
      if (!dragging) return;
      const dy = last.y < EDGE ? -Math.ceil((EDGE - last.y) / 4) : last.y > window.innerHeight - EDGE ? Math.ceil((last.y - (window.innerHeight - EDGE)) / 4) : 0;
      if (dy) {
        window.scrollBy(0, dy);
        update();
      }
      raf = requestAnimationFrame(scroll);
    };

    const down = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (!t.closest('tr[data-key]') || t.closest(INTERACTIVE)) return;
      // Shift+click selects a range: keep the browser from extending a text selection (and the keys on the table)
      if (e.shiftKey) {
        e.preventDefault();
        blurBox();
        return;
      }
      if (onText(e.clientX, e.clientY)) return;
      // no preventDefault: the press must still move the focus (out of the search box) as a normal click does
      start = { x: e.clientX + window.scrollX, y: e.clientY + window.scrollY, additive: e.ctrlKey || e.metaKey };
      last = { x: e.clientX, y: e.clientY };
      dragging = false;
    };
    const move = (e: MouseEvent) => {
      if (!start) return;
      last = { x: e.clientX, y: e.clientY };
      if (!dragging) {
        if (Math.abs(e.clientX + window.scrollX - start.x) < START && Math.abs(e.clientY + window.scrollY - start.y) < START) return;
        dragging = true;
        first = true;
        document.body.style.userSelect = 'none';
        window.getSelection()?.removeAllRanges();
        blurBox();
        raf = requestAnimationFrame(scroll);
      }
      update();
    };
    const up = () => {
      if (!start) return;
      if (dragging) {
        // the click that ends the drag does not also select one row
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        window.addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      }
      start = null;
      dragging = false;
      document.body.style.userSelect = '';
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      setBox(null);
    };

    el.addEventListener('mousedown', down);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      el.removeEventListener('mousedown', down);
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [container]);

  return box;
}
