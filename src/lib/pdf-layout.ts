import { OPS, Util } from 'pdfjs-dist';
import type { PDFOperatorList } from 'pdfjs-dist/types/src/display/api';
import { columnHtml, columnLayout, columnOffset, escapeHtml, normalizeTableData, tableBlockHtml, TABLE_LIMITS } from '@/components/block-editor/content';

export interface PdfBox { left: number; top: number; right: number; bottom: number }
export interface PdfRun extends PdfBox {
  text: string;
  baseline: number;
  size: number;
  bold: boolean;
  italic: boolean;
  rtl: boolean;
}
export interface PdfFigure extends PdfBox { asset: string }
export interface PdfRule { horizontal: boolean; axis: number; from: number; to: number }
interface Line extends PdfBox { runs: PdfRun[]; baseline: number; size: number; rtl: boolean }
interface LayoutBlock extends PdfBox { html: string }
interface Grid { x: number[]; y: number[]; ruled: boolean }

const strokeOps = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);

export function pdfRules(operators: PDFOperatorList, viewport: number[]): PdfRule[] {
  let transform = viewport;
  const stack: number[][] = [];
  const rules: PdfRule[] = [];
  function segment(from: number[], to: number[]): void {
    const first = [...from], second = [...to];
    Util.applyTransform(first, transform);
    Util.applyTransform(second, transform);
    const [x1, y1] = first, [x2, y2] = second;
    if (Math.abs(y1 - y2) <= 1 && Math.abs(x1 - x2) >= 8) {
      rules.push({ horizontal: true, axis: (y1 + y2) / 2, from: Math.min(x1, x2), to: Math.max(x1, x2) });
    } else if (Math.abs(x1 - x2) <= 1 && Math.abs(y1 - y2) >= 5) {
      rules.push({ horizontal: false, axis: (x1 + x2) / 2, from: Math.min(y1, y2), to: Math.max(y1, y2) });
    }
  }
  operators.fnArray.forEach((op, index) => {
    const args = operators.argsArray[index];
    switch (op) {
      case OPS.save: case OPS.paintFormXObjectBegin:
        stack.push(transform);
        if (op === OPS.paintFormXObjectBegin && args?.[0]) transform = Util.transform(transform, args[0]);
        return;
      case OPS.restore: case OPS.paintFormXObjectEnd:
        transform = stack.pop() ?? viewport;
        return;
      case OPS.transform: transform = Util.transform(transform, args); return;
      case OPS.constructPath: break;
      default: return;
    }
    const [paint, [path], bounds] = args;
    if (!path || !bounds || rules.length >= 5_000) return;
    if (paint === OPS.fill || paint === OPS.eoFill) {
      const [x1, y1, x2, y2] = bounds;
      if (x2 - x1 <= 2) segment([(x1 + x2) / 2, y1], [(x1 + x2) / 2, y2]);
      else if (y2 - y1 <= 2) segment([x1, (y1 + y2) / 2], [x2, (y1 + y2) / 2]);
      return;
    }
    if (!strokeOps.has(paint)) return;
    // DrawOPS encodes the path in the PDF.js operator list.
    let start: number[] | undefined;
    let previous: number[] | undefined;
    for (let i = 0; i < path.length && rules.length < 5_000;) {
      const command = path[i++];
      if (command === 4) {
        if (previous && start) segment(previous, start);
        previous = start;
      } else {
        if (command === 2) i += 4;
        if (command === 3) i += 2;
        const point = [path[i++], path[i++]];
        if (command === 0) start = point;
        if (command === 1 && previous) segment(previous, point);
        previous = point;
      }
    }
  });
  return rules;
}

function bounds(boxes: PdfBox[]): PdfBox {
  return boxes.reduce((result, box) => ({
    left: Math.min(result.left, box.left), top: Math.min(result.top, box.top),
    right: Math.max(result.right, box.right), bottom: Math.max(result.bottom, box.bottom),
  }), { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity });
}

function median(values: number[]): number {
  return values.sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)] ?? 11;
}

function lineFor(runs: PdfRun[]): Line {
  return { ...bounds(runs), runs, baseline: median(runs.map((run) => run.baseline)), size: median(runs.filter((run) => run.text.trim()).map((run) => run.size)), rtl: runs.some((run) => run.rtl) };
}

function textRows(runs: PdfRun[]): PdfRun[][] {
  const rows: PdfRun[][] = [];
  for (const run of [...runs].sort((a, b) => a.baseline - b.baseline || a.left - b.left)) {
    const row = rows.at(-1);
    const first = row?.[0];
    if (row && first && run.baseline - first.baseline <= Math.max(2, Math.min(first.size, run.size) * 0.24)) row.push(run);
    else rows.push([run]);
  }
  rows.forEach((row) => row.sort((a, b) => a.left - b.left));
  return rows;
}

function textLines(row: PdfRun[]): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let index = 1; index < row.length; index++) {
    if (row[index].left - row[index - 1].right < Math.max(16, row[index].size * 1.45)) continue;
    lines.push(lineFor(row.slice(start, index)));
    start = index;
  }
  lines.push(lineFor(row.slice(start)));
  return lines.filter((line) => line.runs.some((run) => run.text.trim()));
}

function linePieces(line: Line): { run: PdfRun; text: string }[] {
  const runs = line.rtl ? [...line.runs].reverse() : line.runs;
  const pieces = runs.map((run, index) => {
    const previous = runs[index - 1];
    const gap = previous && (line.rtl ? previous.left - run.right : run.left - previous.right);
    const space = gap && gap > run.size * 0.14 && !/^\s/.test(run.text) && !/\s$/.test(previous.text) ? ' ' : '';
    return { run, text: space + run.text };
  });
  while (pieces.length && !pieces[0].text.trim()) pieces.shift();
  while (pieces.length && !pieces.at(-1)!.text.trim()) pieces.pop();
  if (pieces.length) {
    pieces[0].text = pieces[0].text.trimStart();
    pieces.at(-1)!.text = pieces.at(-1)!.text.trimEnd();
  }
  return pieces;
}

function lineText(line: Line): string {
  return linePieces(line).map(({ text }) => text).join('');
}

function formatLine(line: Line, prefix = ''): string {
  let remaining = prefix.length;
  return linePieces(line).map(({ run, text: value }) => {
    const cut = Math.min(remaining, value.length);
    remaining -= cut;
    value = value.slice(cut);
    if (!value) return '';
    let text = escapeHtml(value);
    if (run.bold) text = '<strong>' + text + '</strong>';
    if (run.italic) text = '<em>' + text + '</em>';
    const weight = run.bold ? '' : ';font-weight:normal';
    return `<span style="font-size:${run.size}pt${weight}">${text}</span>`;
  }).join('');
}

function coordinates(values: number[]): number[] {
  const result: number[] = [];
  for (const value of values.sort((a, b) => a - b)) {
    if (!result.length || value - result.at(-1)! > 2) result.push(value);
  }
  return result;
}

function ruledGrids(rules: PdfRule[]): Grid[] {
  const horizontal = rules.filter((rule) => rule.horizontal);
  const vertical = rules.filter((rule) => !rule.horizontal);
  const groups = new Map<PdfRule, PdfRule>();
  function root(rule: PdfRule): PdfRule {
    let parent = rule;
    while (groups.has(parent)) parent = groups.get(parent)!;
    if (rule !== parent) groups.set(rule, parent);
    return parent;
  }
  const connected = new Set<PdfRule>();
  for (const h of horizontal) {
    for (const v of vertical) {
      if (v.axis < h.from - 2 || v.axis > h.to + 2 || h.axis < v.from - 2 || h.axis > v.to + 2) continue;
      const a = root(h), b = root(v);
      if (a !== b) groups.set(b, a);
      connected.add(h);
      connected.add(v);
    }
  }
  const components = new Map<PdfRule, PdfRule[]>();
  for (const rule of connected) {
    const parent = root(rule);
    const component = components.get(parent) ?? [];
    component.push(rule);
    components.set(parent, component);
  }
  const grids: Grid[] = [];
  for (const group of components.values()) {
    const x = coordinates(group.filter((rule) => !rule.horizontal).map((rule) => rule.axis));
    const y = coordinates(group.filter((rule) => rule.horizontal).map((rule) => rule.axis));
    if (x.length >= 3 && x.length <= TABLE_LIMITS.columns + 1 && y.length >= 3 && y.length <= TABLE_LIMITS.rows + 2) {
      grids.push({ x, y, ruled: true });
    }
  }
  return grids;
}

function borderlessGrids(rows: Line[][]): Grid[] {
  const grids: Grid[] = [];
  let group: Line[][] = [];
  function flush(): void {
    if (group.length >= 3 && group.length <= TABLE_LIMITS.rows) {
      const columns = group[0].length;
      const x = Array.from({ length: columns }, (_, col) => Math.min(...group.map((row) => row[col].left)) - 3);
      x.push(Math.max(...group.map((row) => row.at(-1)!.right)) + 4);
      const y = group.map((row, index) => index === 0 ? Math.min(...row.map((line) => line.top)) : (group[index - 1][0].baseline + row[0].baseline) / 2);
      y.push(Math.max(...group.at(-1)!.map((line) => line.bottom)) + 2);
      grids.push({ x, y, ruled: false });
    }
    group = [];
  }
  for (const row of rows) {
    // A repeated gutter between long prose lines is a column layout, not a table.
    const valid = row.length >= 2 && row.length <= TABLE_LIMITS.columns &&
      row.every((line) => lineText(line).trim().split(/\s+/).length <= 6) &&
      (row.length > 2 || row.some((line) => /^[-+\d€$£%.,\s]+$/.test(lineText(line))));
    if (!valid) { flush(); continue; }
    const previous = group.at(-1);
    if (previous && (previous.length !== row.length || row[0].baseline - previous[0].baseline > row[0].size * 2.8 ||
      row.some((line, column) => Math.abs(line.left - previous[column].left) > 9 && Math.abs(line.right - previous[column].right) > 9))) flush();
    group.push(row);
  }
  flush();
  return grids;
}

function tableFor(grid: Grid, runs: PdfRun[], used: Set<PdfRun>, area: PdfBox): LayoutBlock | undefined {
  const { x, y } = grid;
  const box = { left: x[0], right: x.at(-1)!, top: y[0], bottom: y.at(-1)! };
  const columns = x.length - 1;
  const cells = Array.from({ length: y.length - 1 }, () => Array.from({ length: columns }, (): PdfRun[] => []));
  const assigned: PdfRun[] = [];
  for (const run of runs) {
    if (used.has(run)) continue;
    const midpoint = (run.top + run.bottom) / 2;
    if (run.left < box.left - 1 || run.right > box.right + 3 || midpoint < box.top || midpoint >= box.bottom) continue;
    const row = y.findIndex((edge) => edge > midpoint) - 1;
    const col = x.findIndex((edge) => edge > Math.max(box.left, run.left)) - 1;
    if (row < 0 || col < 0) continue;
    cells[row][col].push(run);
    assigned.push(run);
  }
  const nonEmpty = (cell: PdfRun[]) => cell.some((run) => run.text.trim());
  if (cells.filter((row) => row.some(nonEmpty)).length < 2 || x.slice(1).filter((_, col) => cells.some((row) => nonEmpty(row[col]))).length < 2) return;
  if (!grid.ruled && cells.some((row) => row.filter(nonEmpty).length < 2)) return;
  const firstRowRuns = cells[0].flat().filter((run) => run.text.trim());
  const bodyRuns = cells.slice(1).flat(2).filter((run) => run.text.trim());
  const header = firstRowRuns.length > 0 && firstRowRuns.every((run) => run.bold) && bodyRuns.some((run) => !run.bold);
  const lines = cells.map((row) => row.map((cell) => textRows(cell).map(lineFor).filter((line) => lineText(line).trim())));
  const values = lines.map((row) => row.map((cell) => cell.map((line) => lineText(line).trim()).join('\n')));
  const html = lines.map((row) => row.map((cell) => cell.map((line) => formatLine(line)).join('<br>')));
  assigned.forEach((run) => used.add(run));
  return {
    ...box,
    html: tableBlockHtml(normalizeTableData({
      caption: '', headers: header ? values[0] : Array<string>(columns).fill(''),
      rows: header ? values.slice(1) : values, headerless: !header,
      headerHtml: header ? html[0] : undefined, rowHtml: header ? html.slice(1) : html,
      columnWidths: x.slice(1).map((edge, index) => Math.round((edge - x[index]) * 10) / 10),
      ...horizontalPlacement(box, area),
    })),
  };
}

function roundPercent(value: number): number { return Math.round(value * 1000) / 10; }

function horizontalPlacement(box: PdfBox, area: PdfBox): { widthPercent: number; offsetPercent: number } {
  const widthPercent = Math.min(100, Math.max(1, roundPercent((box.right - box.left) / (area.right - area.left))));
  const offsetPercent = Math.min(100 - widthPercent, Math.max(0, roundPercent((box.left - area.left) / (area.right - area.left))));
  return { widthPercent, offsetPercent };
}

function figureHtml(figure: PdfFigure, area: PdfBox): string {
  const { widthPercent, offsetPercent } = horizontalPlacement(figure, area);
  return `<figure class="knote-image-block" data-width="${widthPercent}" data-offset="${offsetPercent}"><img src="knote-asset:${figure.asset}" data-asset-id="${figure.asset}" alt="Imagen del PDF"><figcaption></figcaption></figure>`;
}

function paragraphs(lines: Line[], area: PdfBox, bodySize: number): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  let group: Line[] = [];
  function marker(line: Line): RegExpExecArray | null {
    return /^(?:([•◦▪‣])|(\d{1,5})[.)])\s+/.exec(lineText(line));
  }
  function flush(): void {
    if (!group.length) return;
    const box = bounds(group);
    const first = group[0];
    const text = lineText(first).trim();
    const heading = group.length === 1 && first.size >= bodySize * 1.22 && text.length <= 160;
    const tag = heading ? (first.size >= bodySize * 1.75 ? 'h1' : first.size >= bodySize * 1.42 ? 'h2' : 'h3') : 'p';
    const centered = box.left - area.left > 10 && Math.abs((area.left + area.right) - (box.left + box.right)) < 14;
    const right = first.rtl || (Math.abs(area.right - box.right) < 8 && box.left - area.left > 18);
    const align = centered ? ' style="text-align:center"' : right ? ' style="text-align:right"' : '';
    blocks.push({ ...box, html: `<${tag}${align}>${group.map((line) => formatLine(line)).join('<br>')}</${tag}>` });
    group = [];
  }
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const prefix = marker(line);
    if (prefix) {
      const items = [line];
      while (index + items.length < lines.length) {
        const next = lines[index + items.length];
        const previous = items.at(-1)!;
        const nextPrefix = marker(next);
        if (!nextPrefix || Math.abs(next.left - line.left) > 9 || next.baseline <= previous.baseline ||
          next.baseline - previous.baseline > line.size * 2.2) break;
        if (prefix[2] ? Number(nextPrefix[2]) !== Number(prefix[2]) + items.length : !nextPrefix[1]) break;
        items.push(next);
      }
      if (prefix[1] || items.length > 1) {
        flush();
        const tag = prefix[2] ? 'ol' : 'ul';
        const start = prefix[2] && Number(prefix[2]) !== 1 ? ` start="${Number(prefix[2])}"` : '';
        blocks.push({ ...bounds(items), html: `<${tag}${start}>${items.map((item) => `<li>${formatLine(item, marker(item)?.[0])}</li>`).join('')}</${tag}>` });
        index += items.length - 1;
        continue;
      }
    }
    const previous = group.at(-1);
    if (previous && (line.baseline <= previous.baseline || line.baseline - previous.baseline > Math.max(line.size, previous.size) * 1.7 ||
      Math.abs(line.size - previous.size) > 1.5 || (Math.abs(line.left - previous.left) > 14 && Math.abs(line.right - previous.right) > 14))) flush();
    group.push(line);
  }
  flush();
  return blocks;
}

function sideBySide(sides: LayoutBlock[]): LayoutBlock {
  const box = bounds(sides);
  const widths = sides.map((side) => Math.max(1, Math.round((side.right - side.left) * 10) / 10));
  const html = sides.map((side) => columnHtml(side.html, columnOffset(String(side.top - box.top)))).join('');
  return { ...box, html: `<div ${columnLayout(sides.length, widths)}>${html}</div>` };
}

export function editablePdfPage(runs: PdfRun[], figures: PdfFigure[], rules: PdfRule[], pageWidth: number): string {
  const occupied = bounds([...runs, ...figures]);
  const margin = Math.max(0, Math.min(occupied.left, pageWidth - occupied.right, pageWidth * 0.12));
  const area = { ...occupied, left: margin, right: pageWidth - margin };
  const used = new Set<PdfRun>();
  const blocks: LayoutBlock[] = [];
  const grids = [...ruledGrids(rules), ...borderlessGrids(textRows(runs).map(textLines))];
  for (const grid of grids) {
    const block = tableFor(grid, runs, used, area);
    if (block) blocks.push(block);
  }
  const rows = textRows(runs.filter((run) => !used.has(run))).map(textLines);
  const lines = rows.flat();
  const bodySize = median(lines.map((line) => line.size));
  const placed = new Set<Line>();
  for (const figure of figures.sort((a, b) => a.top - b.top)) {
    const beside = lines.filter((line) => !placed.has(line) && line.bottom > figure.top &&
      line.top < figure.bottom && (line.right <= figure.left - 5 || line.left >= figure.right + 5));
    const left = beside.filter((line) => line.right <= figure.left - 5);
    const right = beside.filter((line) => line.left >= figure.right + 5);
    if (left.length || right.length) {
      const sides: LayoutBlock[] = [];
      const start = left.length ? (Math.max(...left.map((line) => line.right)) + figure.left) / 2 : area.left;
      const end = right.length ? (Math.min(...right.map((line) => line.left)) + figure.right) / 2 : area.right;
      const photo = { ...figure, left: start, right: end };
      if (left.length) {
        const box = { ...bounds(left), left: area.left, right: start };
        sides.push({ ...box, html: paragraphs(left, box, bodySize).map((block) => block.html).join('') });
      }
      sides.push({ ...photo, html: figureHtml(figure, photo) });
      if (right.length) {
        const box = { ...bounds(right), left: end, right: area.right };
        sides.push({ ...box, html: paragraphs(right, box, bodySize).map((block) => block.html).join('') });
      }
      blocks.push(sideBySide(sides));
      beside.forEach((line) => placed.add(line));
    } else blocks.push({ ...figure, html: figureHtml(figure, area) });
  }
  let parallel: Line[][] = [];
  function flushColumns(): void {
    if (parallel.length >= 2) {
      const left = parallel.map((row) => row[0]), right = parallel.map((row) => row[1]);
      const leftBounds = bounds(left), rightBounds = bounds(right);
      if (leftBounds.right + 14 < rightBounds.left) {
        const split = (leftBounds.right + rightBounds.left) / 2;
        const areas = [{ ...leftBounds, left: area.left, right: split }, { ...rightBounds, left: split, right: area.right }];
        blocks.push(sideBySide([left, right].map((track, index) => ({
          ...areas[index], html: paragraphs(track, areas[index], bodySize).map((block) => block.html).join(''),
        }))));
        parallel.flat().forEach((line) => placed.add(line));
      }
    }
    parallel = [];
  }
  for (const pair of rows) {
    const previous = parallel.at(-1);
    if (pair.length !== 2 || pair.some((line) => placed.has(line))) { flushColumns(); continue; }
    if (previous && (pair[0].baseline - previous[0].baseline > pair[0].size * 3 ||
      pair.some((line, index) => Math.abs(line.left - previous[index].left) > 12))) flushColumns();
    parallel.push(pair);
  }
  flushColumns();
  // Keep text before and after a table or figure in separate paragraphs.
  let pending: Line[] = [];
  const ordered = [...blocks, ...lines.filter((line) => !placed.has(line))].sort((a, b) => a.top - b.top || a.left - b.left);
  const html: string[] = [];
  for (const item of ordered) {
    if ('runs' in item) { pending.push(item); continue; }
    html.push(...paragraphs(pending, area, bodySize).map((block) => block.html), item.html);
    pending = [];
  }
  html.push(...paragraphs(pending, area, bodySize).map((block) => block.html));
  return html.join('');
}
