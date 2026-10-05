import type { Chapter, ReadingProgress } from './model';
export function completion(chapters: Chapter[], index: number, fraction: number) {
  const total = chapters.reduce((n, c) => n + (c.units ?? 1), 0);
  return Math.min(
    1,
    Math.max(
      0,
      (chapters.slice(0, index).reduce((n, c) => n + (c.units ?? 1), 0) +
        (chapters[index]?.units ?? 1) * fraction) /
        Math.max(1, total),
    ),
  );
}
export function captureTextAnchor(stage: HTMLElement): { blockId?: string; offset?: number } {
  const bounds = stage.getBoundingClientRect();
  const block = Array.from(stage.querySelectorAll<HTMLElement>('[data-block]')).find(
    (node) => node.getBoundingClientRect().bottom > bounds.top + 4,
  );
  if (!block) return {};
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const rect = block.getBoundingClientRect();
  const caret = doc.caretRangeFromPoint?.(rect.left + 4, Math.max(bounds.top + 4, rect.top + 4));
  let offset = 0;
  if (caret && block.contains(caret.startContainer)) {
    const range = document.createRange();
    range.selectNodeContents(block);
    range.setEnd(caret.startContainer, caret.startOffset);
    offset = range.toString().length;
  }
  return { blockId: block.dataset.block, offset };
}
export function restoreTextAnchor(stage: HTMLElement, progress: Partial<ReadingProgress> | null) {
  const block = Array.from(stage.querySelectorAll<HTMLElement>('[data-block]')).find(
    (node) => node.dataset.block === progress?.blockId,
  );
  if (!block) {
    stage.scrollTop =
      (progress?.position ?? 0) * Math.max(0, stage.scrollHeight - stage.clientHeight);
    return;
  }
  let top = block.getBoundingClientRect().top;
  const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  let remaining = progress?.offset ?? 0;
  let node;
  while ((node = walker.nextNode())) {
    if (remaining <= (node.textContent?.length ?? 0)) {
      const range = document.createRange();
      range.setStart(node, remaining);
      range.setEnd(node, Math.min(remaining + 1, node.textContent?.length ?? 0));
      const rect = range.getBoundingClientRect();
      if (rect.height) top = rect.top;
      break;
    }
    remaining -= node.textContent?.length ?? 0;
  }
  stage.scrollTop += top - stage.getBoundingClientRect().top;
}
