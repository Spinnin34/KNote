import { getDocument, GlobalWorkerOptions, OPS, Util } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFPageProxy, TextContent } from 'pdfjs-dist/types/src/display/api';
import { RICH_PREFIX, safeFontSize } from '@/components/block-editor/content';
import { deleteBlockImage, retainBlockImage, saveBlockImage } from './block-images';
import { editablePdfPage, pdfRules, type PdfBox, type PdfFigure, type PdfRun } from './pdf-layout';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface ImportedPdf { title: string; content: string; scannedPages: number }

interface PdfFont { name?: string; bold?: boolean; black?: boolean; italic?: boolean }

function textRuns(page: PDFPageProxy, content: TextContent): PdfRun[] {
  const viewport = page.getViewport({ scale: 1 });
  const fonts = new Map<string, { bold: boolean; italic: boolean }>();
  return content.items.flatMap((item) => {
    if (!('str' in item) || !item.str) return [];
    const [a, b, c, d, x, baseline] = Util.transform(viewport.transform, item.transform);
    const size = safeFontSize(String(Math.round(Math.hypot(c, d) * 10) / 10)) ?? 11;
    const height = Math.hypot(c, d) || Math.abs(item.height) || size;
    const style = content.styles[item.fontName];
    let font = fonts.get(item.fontName);
    if (!font) {
      const obj: PdfFont | undefined = page.commonObjs.has(item.fontName) ? page.commonObjs.get(item.fontName) : undefined;
      const name = obj?.name ?? '';
      font = {
        // pdfmake uses Roboto Medium for its bold face.
        bold: Boolean(obj?.bold || obj?.black || /bold|black|heavy|demi|roboto[-_, ]?medium/i.test(name)),
        italic: Boolean(obj?.italic || /italic|oblique|slanted/i.test(name)),
      };
      fonts.set(item.fontName, font);
    }
    const advance = Math.abs(item.width * viewport.scale);
    const horizontal = Math.abs(a) >= Math.abs(b);
    const left = horizontal && a < 0 ? x - advance : x;
    return [{
      text: item.str, ...font, baseline, size, rtl: item.dir === 'rtl',
      left, right: left + (horizontal ? advance : height),
      top: baseline - height * (style?.ascent || 0.85),
      bottom: baseline + height * Math.abs(style?.descent || 0.2),
    }];
  });
}

function imageBoxes(coords: ArrayLike<number> | undefined, width: number, height: number): PdfBox[] {
  const result: PdfBox[] = [];
  if (!coords) return result;
  for (let i = 0; i + 5 < coords.length && result.length < 100; i += 6) {
    const [x1, y1, x2, y2, x3, y3] = Array.from({ length: 6 }, (_, offset) => coords[i + offset]);
    const x4 = x2 + x3 - x1, y4 = y2 + y3 - y1;
    const box = {
      left: Math.max(0, Math.min(x1, x2, x3, x4) * width), right: Math.min(width, Math.max(x1, x2, x3, x4) * width),
      top: Math.max(0, Math.min(y1, y2, y3, y4) * height), bottom: Math.min(height, Math.max(y1, y2, y3, y4) * height),
    };
    if (box.right - box.left < 4 || box.bottom - box.top < 4) continue;
    if (result.some((other) => Math.abs(other.left - box.left) < 1 && Math.abs(other.top - box.top) < 1 &&
      Math.abs(other.right - box.right) < 1 && Math.abs(other.bottom - box.bottom) < 1)) continue;
    result.push(box);
  }
  return result;
}

function jpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('No se pudo guardar una imagen del PDF.')), 'image/jpeg', 0.92,
  ));
}

async function cropImage(canvas: HTMLCanvasElement, box: PdfBox, scale: number): Promise<Blob> {
  const crop = document.createElement('canvas');
  const left = Math.floor(box.left * scale), top = Math.floor(box.top * scale);
  crop.width = Math.max(1, Math.ceil(box.right * scale) - left);
  crop.height = Math.max(1, Math.ceil(box.bottom * scale) - top);
  try {
    const context = crop.getContext('2d');
    if (!context) throw new Error('No se pudo preparar una imagen del PDF.');
    context.drawImage(canvas, left, top, crop.width, crop.height, 0, 0, crop.width, crop.height);
    return await jpeg(crop);
  } finally { crop.width = crop.height = 0; }
}

function imageHtml(asset: string, alt: string): string {
  return `<figure class="knote-image-block"><img src="knote-asset:${asset}" data-asset-id="${asset}" alt="${alt}"><figcaption></figcaption></figure>`;
}

async function convertPage(
  page: PDFPageProxy, preserveLayout: boolean, signal: AbortSignal, storeImage: (blob: Blob) => Promise<string>,
): Promise<{ html: string; scanned: boolean }> {
  const original = page.getViewport({ scale: 1 });
  const scale = Math.min(3, 1700 / Math.max(original.width, original.height));
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const graphics = document.createElement('canvas');
  try {
    const render = page.render({ canvas, viewport, recordImages: true, background: 'white' });
    const [text, operators] = await Promise.all([page.getTextContent(), page.getOperatorList(), render.promise]);
    signal.throwIfAborted();
    const runs = textRuns(page, text);
    const number = page.pageNumber;
    if (!runs.some((run) => run.text.trim())) {
      return { html: imageHtml(await storeImage(await jpeg(canvas)), `Página ${number} del PDF`), scanned: true };
    }
    const boxes = imageBoxes(render.imageCoordinates, canvas.width / scale, canvas.height / scale);
    const coversPage = (box: PdfBox) => box.right - box.left > original.width * 0.88 && box.bottom - box.top > original.height * 0.84;
    const hasScanWithText = boxes.some(coversPage);
    const figures: PdfFigure[] = [];
    const overlapsText = (box: PdfBox) => runs.some((run) => run.text.trim() &&
      run.left < box.right - 2 && run.right > box.left + 2 && run.top < box.bottom - 2 && run.bottom > box.top + 2);
    if (boxes.some((box) => !coversPage(box) && overlapsText(box))) {
      graphics.width = canvas.width;
      graphics.height = canvas.height;
      await page.render({
        canvas: graphics, viewport, background: 'white',
        operationsFilter: (index, list) => list.fnArray[index] !== OPS.showText && list.fnArray[index] !== OPS.showSpacedText,
      }).promise;
    }
    for (const box of boxes) {
      if (coversPage(box)) continue;
      signal.throwIfAborted();
      const source = graphics.width === canvas.width && overlapsText(box) ? graphics : canvas;
      figures.push({ ...box, asset: await storeImage(await cropImage(source, box, scale)) });
    }
    let html = editablePdfPage(runs, figures, pdfRules(operators, original.transform), original.width);
    if (preserveLayout || hasScanWithText) {
      const image = imageHtml(await storeImage(await jpeg(canvas)), `Página ${number} del PDF`);
      html += `<details class="knote-pdf-reference"><summary>Original de la página ${number}</summary><div>${image}</div></details>`;
    }
    return { html, scanned: false };
  } finally {
    canvas.width = canvas.height = graphics.width = graphics.height = 0;
    page.cleanup();
  }
}

export async function importPdf(
  file: File, signal: AbortSignal, preserveLayout: boolean, progress: (current: number, total: number) => void,
  accept: (document: ImportedPdf) => void,
): Promise<void> {
  signal.throwIfAborted();
  const data = new Uint8Array(await file.arrayBuffer());
  signal.throwIfAborted();
  const resources = new URL(import.meta.env.BASE_URL + 'pdf-resources/', location.origin).href;
  const task = getDocument({
    data, cMapUrl: resources + 'cmaps/', cMapPacked: true, standardFontDataUrl: resources + 'standard_fonts/',
    wasmUrl: resources + 'wasm/', iccUrl: resources + 'iccs/', useSystemFonts: true, fontExtraProperties: true,
  });
  let destruction: Promise<void> | undefined;
  const destroy = () => destruction ??= task.destroy();
  const abort = () => { void destroy().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  const retained = new Map<string, () => void>();
  let committed = false;
  async function storeImage(blob: Blob): Promise<string> {
    signal.throwIfAborted();
    const id = crypto.randomUUID();
    retained.set(id, retainBlockImage(id));
    return saveBlockImage(blob, id);
  }
  try {
    const pdf = await task.promise;
    let content = RICH_PREFIX;
    let scannedPages = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      signal.throwIfAborted();
      progress(n, pdf.numPages);
      const page = await convertPage(await pdf.getPage(n), preserveLayout, signal, storeImage);
      if (page.scanned) scannedPages++;
      content += (n > 1 ? '<hr class="knote-page-break">' : '') + page.html;
      if (content.length > 2_000_000) throw new Error('El texto supera el tamaño de una página de KNote. Divide el PDF e inténtalo de nuevo.');
    }
    signal.throwIfAborted();
    accept({ title: file.name.replace(/\.pdf$/i, '').trim().slice(0, 500) || 'Documento importado', content, scannedPages });
    committed = true;
  } catch (error) {
    signal.throwIfAborted();
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('El PDF está protegido. Importa una copia desbloqueada.', { cause: error });
    if (error instanceof Error && error.name === 'InvalidPDFException') throw new Error('El archivo no es un PDF legible.', { cause: error });
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    for (const release of retained.values()) release();
    if (!committed) await Promise.allSettled(Array.from(retained.keys(), deleteBlockImage));
    await destroy().catch(() => {});
  }
}
