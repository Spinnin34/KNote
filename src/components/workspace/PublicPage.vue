<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ArrowLeft, RotateCw } from '@lucide/vue';
import Button from '@/components/ui/Button.vue';
import { initialHtml } from '@/components/block-editor/content';

interface PublicDocument { title: string; content: string; banner: string | null }
const token = window.location.pathname.split('/').filter(Boolean)[1] ?? '';
const documentData = ref<PublicDocument | null>(null);
const html = ref('');
const loading = ref(true);
const failure = ref<'missing' | 'unavailable' | null>(null);
const pageTitle = computed(() => documentData.value?.title?.trim() || 'Documento');
let originalTitle = '';
let pendingRequest: AbortController | undefined;

function renderSafeContent(content: string): string {
  const template = document.createElement('template');
  template.innerHTML = initialHtml(content);
  template.content.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((checkbox) => { checkbox.disabled = true; });
  template.content.querySelectorAll<HTMLImageElement>('img').forEach((image) => {
    image.loading = 'lazy';
    image.referrerPolicy = 'no-referrer';
  });
  template.content.querySelectorAll<HTMLImageElement>('img[data-asset-id]').forEach((image) => {
    const assetId = image.dataset.assetId;
    if (!assetId || !/^[\da-f-]{20,64}$/i.test(assetId)) { image.remove(); return; }
    image.src = `/api/public/${encodeURIComponent(token)}/assets/${encodeURIComponent(assetId)}`;
    image.removeAttribute('data-asset-id');
  });
  template.content.querySelectorAll<HTMLElement>('.knote-table-block').forEach((block) => {
    let data: { caption?: unknown; headers?: unknown; rows?: unknown };
    try { data = JSON.parse(block.dataset.knoteTable || '') as typeof data; }
    catch { block.remove(); return; }
    const table = document.createElement('table');
    if (typeof data.caption === 'string' && data.caption.trim()) {
      const caption = document.createElement('caption');
      caption.textContent = data.caption;
      table.append(caption);
    }
    const headers = Array.isArray(data.headers) ? data.headers.filter((item): item is string => typeof item === 'string') : [];
    const rows = Array.isArray(data.rows) ? data.rows as unknown[] : [];
    if (headers.length) {
      const thead = document.createElement('thead');
      const headRow = document.createElement('tr');
      headers.forEach((value) => { const cell = document.createElement('th'); cell.scope = 'col'; cell.textContent = value; headRow.append(cell); });
      thead.append(headRow);
      table.append(thead);
    }
    const tbody = document.createElement('tbody');
    rows.forEach((row) => {
      if (!Array.isArray(row)) return;
      const tr = document.createElement('tr');
      headers.forEach((_, index) => { const cell = document.createElement('td'); cell.textContent = typeof row[index] === 'string' ? row[index] : ''; tr.append(cell); });
      tbody.append(tr);
    });
    table.append(tbody);
    const scroller = document.createElement('div');
    scroller.className = 'knote-public-table-scroll';
    scroller.append(table);
    block.replaceWith(scroller);
  });
  return template.innerHTML;
}

async function load(): Promise<void> {
  if (pendingRequest) return;
  const request = new AbortController();
  pendingRequest = request;
  loading.value = true;
  failure.value = null;
  try {
    const response = await fetch(`/api/public/${encodeURIComponent(token)}`, {
      cache: 'no-store', credentials: 'omit', signal: request.signal,
    });
    if (request.signal.aborted) return;
    if (!response.ok) {
      failure.value = response.status === 404 ? 'missing' : 'unavailable';
      return;
    }
    const data = await response.json() as PublicDocument;
    if (request.signal.aborted) return;
    documentData.value = data;
    html.value = renderSafeContent(data.content || '');
    document.title = `${data.title || 'Documento'} · KNote`;
  } catch {
    if (!request.signal.aborted) failure.value = 'unavailable';
  } finally {
    pendingRequest = undefined;
    loading.value = false;
  }
}

function openWorkspace(): void { window.location.assign('/'); }

onMounted(() => {
  originalTitle = document.title;
  let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
  if (!robots) { robots = document.createElement('meta'); robots.name = 'robots'; document.head.append(robots); }
  robots.content = 'noindex, nofollow, noarchive';
  void load();
});
onBeforeUnmount(() => {
  pendingRequest?.abort();
  document.title = originalTitle;
});
</script>

<template>
  <main class="knote-public-page">
    <header class="knote-public-topbar">
      <a href="/" class="knote-public-brand" aria-label="KNote">
        <span class="knote-public-mark">K</span><strong>KNote</strong>
      </a>
      <span class="knote-public-readonly">Solo lectura</span>
    </header>

    <div v-if="loading" class="knote-public-message" role="status">Cargando documento…</div>
    <section v-else-if="failure" class="knote-public-message knote-public-message--error" role="alert">
      <h1>{{ failure === 'missing' ? 'Documento no disponible' : 'No se pudo cargar el documento' }}</h1>
      <p>{{ failure === 'missing'
        ? 'El enlace puede haber caducado o el documento puede haber vuelto a ser privado.'
        : 'La conexión con KNote falló. Puedes volver a intentar abrir este enlace.' }}</p>
      <Button v-if="failure === 'unavailable'" variant="solid" color="primary" size="sm" :prefix-icon="RotateCw" @click="load">Reintentar</Button>
      <Button v-else variant="soft" color="neutral" size="sm" :prefix-icon="ArrowLeft" @click="openWorkspace">Abrir KNote</Button>
    </section>
    <article v-else-if="documentData" class="knote-public-document">
      <img v-if="documentData.banner?.startsWith('knote-asset:')" class="knote-public-banner" :src="`/api/public/${encodeURIComponent(token)}/assets/${encodeURIComponent(documentData.banner.slice('knote-asset:'.length))}`" alt="" />
      <h1>{{ pageTitle }}</h1>
      <div class="knote-public-content" v-html="html" />
      <footer>Publicado con KNote</footer>
    </article>
  </main>
</template>
