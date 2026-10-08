<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Columns3, Plus, Trash2, X } from '@lucide/vue';
import Table from '@/components/ui/Table.vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';

const props = defineProps<{
  model: {
    caption: string;
    headers: string[];
    rows: string[][];
  };
}>();
const emit = defineEmits<{ change: [] }>();
const headers = ref([...props.model.headers]);
const rows = ref(props.model.rows.map((row) => [...row]));
const toolsOpen = ref(false);
const tableRoot = ref<HTMLElement | null>(null);

function addRow(): void {
  if (rows.value.length >= 100) return;
  rows.value.push(Array.from({ length: headers.value.length }, () => ''));
  void nextTick(() => {
    const lastCell = tableRoot.value?.querySelector<HTMLElement>('.knote-editable-table tbody tr:last-child td[contenteditable="true"]');
    lastCell?.focus({ preventScroll: true });
    emit('change');
  });
}
function addColumn(): void {
  if (headers.value.length >= 8) return;
  headers.value.push(`Columna ${headers.value.length + 1}`);
  rows.value.forEach((row) => row.push(''));
  void nextTick(() => emit('change'));
}
function removeRow(): void {
  if (rows.value.length <= 1) return;
  rows.value.pop();
  void nextTick(() => emit('change'));
}
function closeToolsOutside(event: PointerEvent): void {
  if (event.target instanceof Node && tableRoot.value?.contains(event.target)) return;
  toolsOpen.value = false;
}
onMounted(() => document.addEventListener('pointerdown', closeToolsOutside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeToolsOutside));
</script>

<template>
  <div ref="tableRoot" class="knote-table-component" @contextmenu.stop.prevent="toolsOpen = true">
    <div v-if="toolsOpen" class="knote-table-component-tools" contenteditable="false" role="toolbar" aria-label="Opciones de la tabla" @pointerdown.stop>
      <Button variant="soft" color="neutral" size="sm" shape="fab" aria-label="Añadir fila" title="Añadir fila" :disabled="rows.length >= 100" @click="addRow"><Icon :icon="Plus" size="sm" /></Button>
      <Button variant="soft" color="neutral" size="sm" shape="fab" aria-label="Añadir columna" title="Añadir columna" :disabled="headers.length >= 8" @click="addColumn"><Icon :icon="Columns3" size="sm" /></Button>
      <Button variant="soft" color="neutral" size="sm" shape="fab" aria-label="Quitar última fila" title="Quitar última fila" :disabled="rows.length <= 1" @click="removeRow"><Icon :icon="Trash2" size="xs" /></Button>
      <Button variant="soft" color="neutral" size="sm" shape="fab" aria-label="Cerrar opciones de tabla" title="Cerrar" @click="toolsOpen = false"><Icon :icon="X" size="xs" /></Button>
    </div>
    <Table
      :caption="model.caption"
      variant="surface"
      density="comfortable"
      :column-count="headers.length"
      gridlines
      :hover="false"
      rounded="lg"
      class="knote-editable-table"
    >
      <template #header>
        <thead>
          <tr>
            <th
              v-for="(header, columnIndex) in headers"
              :key="`header-${columnIndex}`"
              scope="col"
              contenteditable="true"
              spellcheck="false"
              data-knote-table-cell="header"
            >{{ header }}</th>
          </tr>
        </thead>
      </template>
      <tr v-for="(row, rowIndex) in rows" :key="`row-${rowIndex}`">
        <td
          v-for="(cell, columnIndex) in row"
          :key="`cell-${rowIndex}-${columnIndex}`"
          contenteditable="true"
          spellcheck="true"
          data-knote-table-cell="body"
        >{{ cell }}</td>
      </tr>
    </Table>
  </div>
</template>
