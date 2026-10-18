<script setup lang="ts">
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import Modal from '@/components/ui/Modal.vue';
import Tabs from '@/components/ui/Tabs.vue';
import type { PageType, WorkspacePage } from '@/domain/workspace/types';
import { CalendarDays, Code2, FileText, Folder, Inbox, LayoutDashboard, ListTodo, Plus, Table2 } from '@lucide/vue';

const props = defineProps<{
  pages: WorkspacePage[];
  parentId: string | null;
  pageTypeLabel: (type: PageType) => string;
}>();
const isOpen = defineModel<boolean>({ required: true });
const title = defineModel<string>('title', { required: true });
const pageType = defineModel<PageType>('pageType', { required: true });
const emit = defineEmits<{ submit: [close?: () => void] }>();

const createTypeTabs = [
  { id: 'doc', label: 'Documento', icon: FileText },
  { id: 'code', label: 'Código', icon: Code2 },
  { id: 'board', label: 'Tablero', icon: LayoutDashboard },
  { id: 'database', label: 'Tabla', icon: Table2 },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'tasks', label: 'Tareas', icon: ListTodo },
  { id: 'folder', label: 'Carpeta', icon: Folder },
];

function submitPage(close?: () => void): void { emit('submit', close); }
</script>

<template>
  <Modal id="create-page-dialog" v-model="isOpen" title="Crear una página" description="Elige el tipo y el lugar donde se guardará." presentation="dialog" variant="surface" size="lg" close-label="Cerrar creación de página">
    <div class="knote-create-form">
      <Input id="new-page-name" v-model="title" label="Nombre de la página" placeholder="Ej. Ideas para el proyecto" size="md" variant="surface" @keydown.enter.prevent="submitPage()" />
      <div class="knote-create-type-label"><span>TIPO DE PÁGINA</span><Badge variant="outline" color="secondary" size="sm">{{ props.pageTypeLabel(pageType) }}</Badge></div>
      <Tabs id="new-page-type-tabs" v-model="pageType" :items="createTypeTabs" label="Tipo de página" type="segmented" variant="surface" size="sm" class="knote-create-tabs">
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
      <Button :prefix-icon="Plus" @click="submitPage(close)">Crear página</Button>
    </template>
  </Modal>
</template>
