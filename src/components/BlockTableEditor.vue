<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import { Columns3, Copy, Ellipsis, Heading, Plus, Rows3, Trash2 } from '@lucide/vue';
import Table from '@/components/ui/Table.vue';
import Button from '@/components/ui/Button.vue';
import DropdownMenu from '@/components/ui/DropdownMenu.vue';
import type { MenuItem, MenuSelection } from '@/components/ui/menu';
import { normalizeTableData, readTableCell, tableCellHtml, TABLE_LIMITS, type EditorTableData } from '@/components/block-editor/content';

const props = defineProps<{ id: string; model: EditorTableData }>();
const emit = defineEmits<{ change: [model: EditorTableData, group?: string] }>();

let nextId = 0;
function makeCell(value = '', html = '') {
  return { id: nextId++, initial: tableCellHtml(value, html), value, html };
}
const headers = ref(props.model.headers.map((text, column) => makeCell(text, props.model.headerHtml?.[column])));
const rows = ref(props.model.rows.map((row, index) => ({
  id: nextId++, cells: row.map((text, column) => makeCell(text, props.model.rowHtml?.[index]?.[column])),
})));
const headerless = ref(Boolean(props.model.headerless));
const widths = ref(props.model.columnWidths && [...props.model.columnWidths]);
const widthTotal = computed(() => widths.value?.reduce((total, width) => total + width, 0) ?? 0);
const activeRow = ref(-1);
const activeColumn = ref(0);
const tableRoot = ref<HTMLElement | null>(null);
const menuItems = computed<readonly MenuItem[]>(() => [
  { id: 'insert-row', label: 'Insertar fila debajo', icon: Rows3, disabled: rows.value.length >= TABLE_LIMITS.rows },
  { id: 'duplicate-row', label: 'Duplicar fila', icon: Copy, disabled: activeRow.value < 0 || rows.value.length >= TABLE_LIMITS.rows },
  { id: 'add-column', label: 'Insertar columna a la derecha', icon: Columns3, disabled: headers.value.length >= TABLE_LIMITS.columns },
  { id: 'toggle-header', label: headerless.value ? 'Usar la primera fila como encabezado' : 'Convertir encabezado en fila', icon: Heading, disabled: headerless.value ? rows.value.length < 2 : rows.value.length >= TABLE_LIMITS.rows },
  { id: 'remove-column', label: 'Quitar columna seleccionada', icon: Trash2, destructive: true, disabled: headers.value.length <= 1 },
  { id: 'remove-row', label: 'Quitar fila seleccionada', icon: Trash2, destructive: true, disabled: activeRow.value < 0 || rows.value.length <= 1 },
]);

function save(group?: string): void {
  emit('change', normalizeTableData({
    caption: props.model.caption,
    headers: headers.value.map((cell) => cell.value),
    rows: rows.value.map((row) => row.cells.map((cell) => cell.value)),
    headerless: headerless.value,
    columnWidths: widths.value,
    widthPercent: props.model.widthPercent,
    offsetPercent: props.model.offsetPercent,
    headerHtml: headers.value.map((cell) => cell.html),
    rowHtml: rows.value.map((row) => row.cells.map((cell) => cell.html)),
  }), group);
}

function cellWidth(column: number): string | undefined {
  return widths.value && `${widths.value[column] / widthTotal.value * 100}%`;
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
  const { text, html } = readTableCell(element);
  const value = text.slice(0, row < 0 ? TABLE_LIMITS.header : TABLE_LIMITS.cell);
  if (text !== value) {
    element.textContent = value;
    window.getSelection()?.collapse(element, element.childNodes.length);
  }
  const rich = text === value && html !== tableCellHtml(value) ? html : '';
  if (cell.value === value && cell.html === rich) return;
  cell.value = value;
  cell.html = rich;
  const type = event instanceof InputEvent ? event.inputType : '';
  save(type === 'insertText' || type === 'deleteContentBackward' || type === 'deleteContentForward' ? `${row}-${column}-${type}` : undefined);
}

function pasteCell(event: ClipboardEvent): void {
  event.preventDefault();
  const value = event.clipboardData?.getData('text/plain');
  if (value) document.execCommand('insertText', false, value);
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
    const cells = id === 'duplicate-row'
      ? rows.value[row].cells.map((cell) => makeCell(cell.value, cell.html))
      : headers.value.map(() => makeCell());
    rows.value.splice(row + 1, 0, { id: nextId++, cells });
    focusCell(row + 1, column);
  } else if (id === 'add-column') {
    headers.value.splice(column + 1, 0, makeCell(`Columna ${headers.value.length + 1}`));
    rows.value.forEach((item) => item.cells.splice(column + 1, 0, makeCell()));
    widths.value?.splice(column + 1, 0, widths.value[column]);
    focusCell(headerless.value ? Math.max(0, row) : row, column + 1);
  } else if (id === 'remove-column') {
    headers.value.splice(column, 1);
    rows.value.forEach((item) => item.cells.splice(column, 1));
    widths.value?.splice(column, 1);
    focusCell(headerless.value ? Math.max(0, row) : row, Math.min(column, headers.value.length - 1));
  } else if (id === 'remove-row') {
    rows.value.splice(row, 1);
    focusCell(Math.min(row, rows.value.length - 1), column);
  } else if (id === 'toggle-header') {
    const recreate = (cell: ReturnType<typeof makeCell>) => makeCell(cell.value, cell.html);
    if (headerless.value) {
      const first = rows.value.shift();
      if (!first) return;
      headers.value = first.cells.map(recreate);
    } else {
      if (rows.value.length >= TABLE_LIMITS.rows) return;
      rows.value.unshift({ id: nextId++, cells: headers.value.map(recreate) });
      headers.value = headers.value.map(() => makeCell());
    }
    headerless.value = !headerless.value;
    focusCell(headerless.value ? 0 : -1, column);
  } else return;
  save();
}

function handleCellKey(event: KeyboardEvent, row: number, column: number): void {
  if (event.isComposing) return;
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(event.currentTarget as HTMLElement);
    selection?.removeAllRanges();
    selection?.addRange(range);
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (row + 1 < rows.value.length) focusCell(row + 1, column);
  } else if (event.key === 'Tab') {
    const width = headers.value.length;
    const headerRows = headerless.value ? 0 : 1;
    const index = (row + headerRows) * width + column + (event.shiftKey ? -1 : 1);
    const length = (rows.value.length + headerRows) * width;
    if (index === length && rows.value.length < TABLE_LIMITS.rows) {
      event.preventDefault();
      addRow();
      return;
    }
    if (index < 0 || index >= length) return;
    event.preventDefault();
    focusCell(Math.floor(index / width) - headerRows, index % width);
  }
}
</script>

<template>
  <div ref="tableRoot" class="knote-table-component" @keydown.stop @input.stop @beforeinput.stop @paste.stop>
    <div class="knote-table-component-tools" role="group" aria-label="Acciones de la tabla">
      <span>{{ model.caption || 'Tabla' }}</span>
      <Button variant="soft" color="neutral" size="sm" :prefix-icon="Plus" :disabled="rows.length >= TABLE_LIMITS.rows" @click="addRow">Añadir fila</Button>
      <DropdownMenu :id="id" label="Opciones de tabla" :items="menuItems" variant="surface" align="end" @select="changeTable">
        <template #trigger><Ellipsis :size="16" aria-hidden="true" /></template>
      </DropdownMenu>
    </div>
    <Table :caption="model.caption || 'Tabla'" variant="surface" density="compact" :column-count="headers.length" gridlines :hover="false" rounded="md" class="knote-editable-table" :class="{ 'knote-sized-table': widths }">
      <template #header>
        <thead v-if="!headerless">
          <tr>
            <th
              v-for="(cell, column) in headers" :key="cell.id" scope="col"
              contenteditable="true" tabindex="0" spellcheck="false" data-table-row="-1" :data-table-column="column"
              :aria-label="`Encabezado ${column + 1}`" :style="{ width: cellWidth(column) }" v-html="cell.initial"
              @focus="selectCell(-1, column)" @input="updateCell($event, -1, column)" @keydown="handleCellKey($event, -1, column)"
              @compositionend="updateCell($event, -1, column)" @paste="pasteCell" @drop.prevent
            />
          </tr>
        </thead>
      </template>
      <tr v-for="(row, rowIndex) in rows" :key="row.id">
        <td
          v-for="(cell, column) in row.cells" :key="cell.id"
          contenteditable="true" tabindex="0" :data-table-row="rowIndex" :data-table-column="column"
          :aria-label="`Fila ${rowIndex + 1}, columna ${column + 1}`" :style="{ width: cellWidth(column) }" v-html="cell.initial"
          @focus="selectCell(rowIndex, column)" @input="updateCell($event, rowIndex, column)" @keydown="handleCellKey($event, rowIndex, column)"
          @compositionend="updateCell($event, rowIndex, column)" @paste="pasteCell" @drop.prevent
        />
      </tr>
    </Table>
  </div>
</template>
