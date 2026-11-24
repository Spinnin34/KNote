<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Columns3, Copy, Ellipsis, Plus, Rows3, Trash2 } from '@lucide/vue';
import Table from '@/components/ui/Table.vue';
import Button from '@/components/ui/Button.vue';
import DropdownMenu from '@/components/ui/DropdownMenu.vue';
import type { MenuItem, MenuSelection } from '@/components/ui/menu';
import { TABLE_LIMITS, type EditorTableData } from '@/components/block-editor/content';

const props = defineProps<{ id: string; model: EditorTableData }>();
const emit = defineEmits<{ change: [model: EditorTableData, group?: string] }>();

let nextId = 0;
function makeCell(value = '') {
  return { id: nextId++, initial: value, value };
}
const headers = ref(props.model.headers.map(makeCell));
const rows = ref(props.model.rows.map((row) => ({ id: nextId++, cells: row.map(makeCell) })));
const activeRow = ref(-1);
const activeColumn = ref(0);
const tableRoot = ref<HTMLElement | null>(null);
const menuItems = computed<readonly MenuItem[]>(() => [
  { id: 'insert-row', label: 'Insertar fila debajo', icon: Rows3, disabled: rows.value.length >= TABLE_LIMITS.rows },
  { id: 'duplicate-row', label: 'Duplicar fila', icon: Copy, disabled: activeRow.value < 0 || rows.value.length >= TABLE_LIMITS.rows },
  { id: 'add-column', label: 'Insertar columna a la derecha', icon: Columns3, disabled: headers.value.length >= TABLE_LIMITS.columns },
  { id: 'remove-column', label: 'Quitar columna seleccionada', icon: Trash2, destructive: true, disabled: headers.value.length <= 1 },
  { id: 'remove-row', label: 'Quitar fila seleccionada', icon: Trash2, destructive: true, disabled: activeRow.value < 0 || rows.value.length <= 1 },
]);

function save(group?: string): void {
  emit('change', {
    caption: props.model.caption,
    headers: headers.value.map((cell) => cell.value),
    rows: rows.value.map((row) => row.cells.map((cell) => cell.value)),
  }, group);
}

function selectCell(row: number, column: number): void {
  activeRow.value = row;
  activeColumn.value = column;
}

function focusCell(row: number, column: number): void {
  void nextTick(() => {
    tableRoot.value?.querySelector<HTMLElement>(`[data-table-row="${row}"][data-table-column="${column}"]`)?.focus();
  });
}

function updateCell(event: Event, row: number, column: number): void {
  if (event instanceof InputEvent && event.isComposing) return;
  const element = event.currentTarget as HTMLElement;
  const cell = row < 0 ? headers.value[column] : rows.value[row].cells[column];
  const text = element.textContent ?? '';
  const value = text.slice(0, row < 0 ? TABLE_LIMITS.header : TABLE_LIMITS.cell);
  if (text !== value) {
    element.textContent = value;
    window.getSelection()?.collapse(element, element.childNodes.length);
  }
  if (cell.value === value) return;
  cell.value = value;
  const type = event instanceof InputEvent ? event.inputType : '';
  save(type === 'insertText' || type === 'deleteContentBackward' || type === 'deleteContentForward' ? `${row}-${column}-${type}` : undefined);
}

function addRow(): void {
  if (rows.value.length >= TABLE_LIMITS.rows) return;
  rows.value.push({ id: nextId++, cells: headers.value.map(() => makeCell()) });
  save();
  focusCell(rows.value.length - 1, 0);
}

function changeTable({ id }: MenuSelection): void {
  const column = activeColumn.value;
  const row = activeRow.value;
  if (id === 'insert-row' || id === 'duplicate-row') {
    const cells = headers.value.map((_, index) => makeCell(id === 'duplicate-row' ? rows.value[row].cells[index].value : ''));
    rows.value.splice(row + 1, 0, { id: nextId++, cells });
    focusCell(row + 1, column);
  } else if (id === 'add-column') {
    headers.value.splice(column + 1, 0, makeCell(`Columna ${headers.value.length + 1}`));
    rows.value.forEach((item) => item.cells.splice(column + 1, 0, makeCell()));
    focusCell(row, column + 1);
  } else if (id === 'remove-column') {
    headers.value.splice(column, 1);
    rows.value.forEach((item) => item.cells.splice(column, 1));
    focusCell(row, Math.min(column, headers.value.length - 1));
  } else if (id === 'remove-row') {
    rows.value.splice(row, 1);
    focusCell(Math.min(row, rows.value.length - 1), column);
  } else return;
  save();
}

function handleCellKey(event: KeyboardEvent, row: number, column: number): void {
  if (event.isComposing) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    if (row + 1 < rows.value.length) focusCell(row + 1, column);
  } else if (event.key === 'Tab') {
    const width = headers.value.length;
    const index = (row + 1) * width + column + (event.shiftKey ? -1 : 1);
    if (index === (rows.value.length + 1) * width && rows.value.length < TABLE_LIMITS.rows) {
      event.preventDefault();
      addRow();
      return;
    }
    if (index < 0 || index >= (rows.value.length + 1) * width) return;
    event.preventDefault();
    focusCell(Math.floor(index / width) - 1, index % width);
  }
}
</script>

<template>
  <div ref="tableRoot" class="knote-table-component" @keydown.stop @input.stop @beforeinput.stop @paste.stop>
    <div class="knote-table-component-tools" role="group" aria-label="Acciones de la tabla">
      <span>{{ model.caption }}</span>
      <Button variant="soft" color="neutral" size="sm" :prefix-icon="Plus" :disabled="rows.length >= TABLE_LIMITS.rows" @click="addRow">Añadir fila</Button>
      <DropdownMenu :id="id" label="Opciones de tabla" :items="menuItems" variant="surface" align="end" @select="changeTable">
        <template #trigger><Ellipsis :size="16" aria-hidden="true" /></template>
      </DropdownMenu>
    </div>
    <Table :caption="model.caption" variant="surface" density="compact" :column-count="headers.length" gridlines :hover="false" rounded="md" class="knote-editable-table">
      <template #header>
        <thead>
          <tr>
            <th
              v-for="(cell, column) in headers" :key="cell.id" scope="col"
              contenteditable="plaintext-only" tabindex="0" spellcheck="false" data-table-row="-1" :data-table-column="column"
              :aria-label="`Encabezado ${column + 1}`" v-text="cell.initial"
              @focus="selectCell(-1, column)" @input="updateCell($event, -1, column)" @keydown="handleCellKey($event, -1, column)"
              @compositionend="updateCell($event, -1, column)"
            />
          </tr>
        </thead>
      </template>
      <tr v-for="(row, rowIndex) in rows" :key="row.id">
        <td
          v-for="(cell, column) in row.cells" :key="cell.id"
          contenteditable="plaintext-only" tabindex="0" :data-table-row="rowIndex" :data-table-column="column"
          :aria-label="`Fila ${rowIndex + 1}, columna ${column + 1}`" v-text="cell.initial"
          @focus="selectCell(rowIndex, column)" @input="updateCell($event, rowIndex, column)" @keydown="handleCellKey($event, rowIndex, column)"
          @compositionend="updateCell($event, rowIndex, column)"
        />
      </tr>
    </Table>
  </div>
</template>
