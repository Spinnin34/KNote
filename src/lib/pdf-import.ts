import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFPageProxy, TextItem } from 'pdfjs-dist/types/src/display/api';
import { escapeHtml, RICH_PREFIX } from '@/components/block-editor/content';
import { deleteBlockImage, retainBlockImage, saveBlockImage } from './block-images';

GlobalWorkerOptions.workerSrc = workerUrl;

export interface ImportedPdf { title: string; content: string; scannedPages: number }

function editablePage(items: TextItem[]): string {
  const lines: { text: string; y: number; height: number }[] = [];
  let newLine = true;
  let lastRight = 0;
  for (const item of items) {
    const [a, b, , , x, y] = item.transform;
    const height = item.height || Math.hypot(a, b) || 12;
    const previous = lines.at(-1);
    if (item.str && (newLine || !previous || Math.abs(previous.y - y) > height * 0.5)) {
      lines.push({ text: item.str, y, height });
    } else if (item.str && previous) {
      previous.text += (x - lastRight > height * 0.15 ? ' ' : '') + item.str;
    }
    lastRight = x + item.width;
    newLine = item.hasEOL;
  }
  const nonEmpty = lines.filter((line) => line.text.trim());
  const heights = nonEmpty.map((line) => line.height).sort((a, b) => a - b);
  const median = heights[Math.floor(heights.length / 2)] ?? 12;
  const blocks: string[] = [];
  let paragraph: string[] = [];
  function flush() {
    if (paragraph.length) blocks.push('<p>' + paragraph.join(' ') + '</p>');
    paragraph = [];
  }
  nonEmpty.forEach((line, index) => {
    const text = escapeHtml(line.text.trim());
    if (line.height > median * 1.22 && text.length < 180) {
      flush();
      blocks.push('<h2>' + text + '</h2>');
    } else {
      if (index && Math.abs(nonEmpty[index - 1].y - line.y) > line.height * 1.65) flush();
      paragraph.push(text);
    }
  });
  flush();
  return blocks.join('');
}

async function scanImage(page: PDFPageProxy): Promise<Blob> {
  const original = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: 1700 / Math.max(original.width, original.height) });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  try {
    await page.render({ canvas, viewport, background: 'white' }).promise;
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('No se pudo convertir la página escaneada.')), 'image/jpeg', 0.88,
    ));
  } finally { canvas.width = canvas.height = 0; }
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
    wasmUrl: resources + 'wasm/', iccUrl: resources + 'iccs/', useSystemFonts: true,
  });
  const abort = () => { void task.destroy(); };
  signal.addEventListener('abort', abort, { once: true });
  const retained = new Map<string, () => void>();
  let committed = false;
  try {
    const pdf = await task.promise;
    let content = RICH_PREFIX;
    let scannedPages = 0;
    for (let n = 1; n <= pdf.numPages; n++) {
      signal.throwIfAborted();
      progress(n, pdf.numPages);
      const page = await pdf.getPage(n);
      const { items } = await page.getTextContent();
      let html = editablePage(items.filter((item): item is TextItem => 'str' in item));
      if (!html || preserveLayout) {
        const blob = await scanImage(page);
        signal.throwIfAborted();
        const id = crypto.randomUUID();
        retained.set(id, retainBlockImage(id));
        await saveBlockImage(blob, id);
        const image = `<figure class="knote-image-block"><img src="knote-asset:${id}" data-asset-id="${id}" alt="Página ${n} del PDF"><figcaption></figcaption></figure>`;
        if (html) html += `<details><summary>Original de la página ${n}</summary><div>${image}</div></details>`;
        else { html = image; scannedPages++; }
      }
      content += (n > 1 ? '<hr class="knote-page-break">' : '') + html;
      page.cleanup();
      if (content.length > 2_000_000) throw new Error('El texto supera el tamaño de una página de KNote. Divide el PDF e inténtalo de nuevo.');
    }
    signal.throwIfAborted();
    accept({ title: file.name.replace(/\.pdf$/i, '').trim().slice(0, 500) || 'Documento importado', content, scannedPages });
    committed = true;
  } catch (error) {
    if (error instanceof Error && error.name === 'PasswordException') throw new Error('El PDF está protegido. Importa una copia desbloqueada.', { cause: error });
    if (error instanceof Error && error.name === 'InvalidPDFException') throw new Error('El archivo no es un PDF legible.', { cause: error });
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    for (const release of retained.values()) release();
    if (!committed) await Promise.allSettled(Array.from(retained.keys(), deleteBlockImage));
    await task.destroy();
  }
}
