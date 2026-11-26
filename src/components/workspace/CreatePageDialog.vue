<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Checkbox from '@/components/ui/Checkbox.vue';
import Attachment from '@/components/ui/Attachment.vue';
import type { ImportedPdf } from '@/lib/pdf-import';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import Modal from '@/components/ui/Modal.vue';
import Tabs from '@/components/ui/Tabs.vue';
import type { PageType, WorkspacePage } from '@/domain/workspace/types';
import { CalendarDays, Code2, FileText, FileUp, Folder, Inbox, LayoutDashboard, ListTodo, Plus, Table2 } from '@lucide/vue';

const props = defineProps<{
  pages: WorkspacePage[];
  parentId: string | null;
  pageTypeLabel: (type: PageType) => string;
}>();
const isOpen = defineModel<boolean>({ required: true });
const title = defineModel<string>('title', { required: true });
const pageType = defineModel<PageType>('pageType', { required: true });
const emit = defineEmits<{ submit: [close?: () => void]; importPdf: [document: ImportedPdf] }>();
const importMode = ref(false);
const selectedType = computed({
  get: () => importMode.value ? 'pdf' : pageType.value,
  set: (value: string) => {
    importMode.value = value === 'pdf';
    if (value !== 'pdf') pageType.value = value as PageType;
  },
});
const files = ref<readonly File[]>([]);
const preserveLayout = ref(false);
const progress = ref('');
const failure = ref('');
let controller: AbortController | undefined;
function resetImport() {
  controller?.abort();
  controller = undefined;
  progress.value = '';
  failure.value = '';
  files.value = [];
  preserveLayout.value = false;
}
watch(isOpen, () => { resetImport(); importMode.value = false; }, { flush: 'sync' });
watch(importMode, resetImport);
watch(files, () => { failure.value = ''; });
onBeforeUnmount(resetImport);

async function convertPdf() {
  const file = files.value[0];
  if (!file || controller) return;
  const request = new AbortController();
  controller = request;
  progress.value = 'Abriendo PDF…';
  failure.value = '';
  try {
    const { importPdf } = await import('@/lib/pdf-import');
    await importPdf(file, request.signal, preserveLayout.value, (current, total) => { progress.value = `Convirtiendo página ${current} de ${total}…`; },
      (result) => emit('importPdf', result));
  } catch (error) {
    if (!request.signal.aborted) failure.value = error instanceof Error ? error.message : 'No se pudo importar el PDF.';
  } finally {
    if (controller === request) { controller = undefined; progress.value = ''; }
  }
}

const createTypeTabs = [
  { id: 'doc', label: 'Documento', icon: FileText },
  { id: 'code', label: 'Código', icon: Code2 },
  { id: 'board', label: 'Tablero', icon: LayoutDashboard },
  { id: 'database', label: 'Tabla', icon: Table2 },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'tasks', label: 'Tareas', icon: ListTodo },
  { id: 'folder', label: 'Carpeta', icon: Folder },
  { id: 'pdf', label: 'Importar PDF', icon: FileUp },
];

function submitPage(close?: () => void): void {
  if (importMode.value) void convertPdf();
  else emit('submit', close);
}
</script>

<template>
  <Modal id="create-page-dialog" v-model="isOpen" title="Crear una página" description="Elige el tipo y el lugar donde se guardará." presentation="dialog" variant="surface" size="lg" close-label="Cerrar creación de página">
    <div class="knote-create-form">
      <Input id="new-page-name" v-model="title" label="Nombre de la página" :placeholder="importMode ? files[0]?.name.replace(/\.pdf$/i, '') || 'Nombre del archivo' : 'Ej. Ideas para el proyecto'" size="md" variant="surface" @keydown.enter.prevent="submitPage()" />
      <div class="knote-create-type-label"><span>TIPO DE PÁGINA</span><Badge variant="outline" color="secondary" size="sm">{{ importMode ? 'PDF' : props.pageTypeLabel(pageType) }}</Badge></div>
      <Tabs id="new-page-type-tabs" v-model="selectedType" :items="createTypeTabs" label="Tipo de página" type="segmented" variant="surface" size="sm" class="knote-create-tabs">
        <template #pdf>
          <Attachment id="import-pdf-file" v-model="files" label="Archivo PDF" accept=".pdf,application/pdf" :max-size="32 * 1024 * 1024" :disabled="Boolean(progress)" hint="Hasta 32 MB. Se recuperan el texto con formato, las tablas y las imágenes. Las páginas escaneadas se conservan como imágenes." />
          <Checkbox id="import-pdf-layout" v-model="preserveLayout" label="Guardar una vista de referencia de cada página" :disabled="Boolean(progress)" size="sm" />
          <p v-if="progress" role="status">{{ progress }}</p>
          <p v-if="failure" class="knote-cloud-inline-error" role="alert">{{ failure }}</p>
        </template>
        <template #doc>Una página abierta para notas, ideas y texto.</template>
        <template #code>Un editor Python local con ejecución y análisis integrados.</template>
        <template #board>Un tablero con tareas agrupadas por estado.</template>
        <template #database>Una tabla de elementos que también puedes ver como tablero.</template>
        <template #calendar>Fechas y eventos de un vistazo.</template>
        <template #tasks>Una lista breve de pasos y objetivos.</template>
        <template #folder>Una rama para agrupar páginas y proyectos.</template>
      </Tabs>
      <p v-if="props.parentId" class="knote-create-location"><Icon :icon="Folder" size="sm" /> Se guardará en <strong>{{ props.pages.find((page) => page.id === props.parentId)?.title }}</strong></p>
      <p v-else class="knote-create-location"><Icon :icon="Inbox" size="sm" /> Se guardará en tu espacio privado.</p>
    </div>
    <template #footer="{ close }">
      <Button variant="soft" color="neutral" @click="close">Cancelar</Button>
      <Button :prefix-icon="importMode ? FileUp : Plus" :loading="Boolean(progress)" :disabled="importMode && (!files.length || Boolean(progress))" @click="submitPage(close)">{{ importMode ? 'Importar documento' : 'Crear página' }}</Button>
    </template>
  </Modal>
</template>
