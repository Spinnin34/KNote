<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import DescriptionCell from './DatabaseDescriptionCell.vue';
import TagsSelect from './DatabaseTagsSelect.vue';
import FieldInput from './DatabaseFieldInput.vue';
import Modal from '@/components/ui/Modal.vue';
import { databaseTags } from '@/domain/workspace/database-tags';
import { makeId } from '@/domain/workspace/ids';
import type { LucideIcon } from '@lucide/vue';
import {
  AlignLeft, ArrowDown, ArrowUp, ArrowUpDown, CalendarDays, ChevronDown, ChevronRight, CircleCheck, CircleDashed, CircleDot,
  FileText, Filter, Flag, GripVertical, Hash, PanelRightOpen, SquareCheck, Plus, Search, SlidersHorizontal, Tag, X,
} from '@lucide/vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Checkbox from '@/components/ui/Checkbox.vue';
import DatePicker from '@/components/ui/DatePicker.vue';
import DropdownMenu from '@/components/ui/DropdownMenu.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import Select from '@/components/ui/Select.vue';
import Table from '@/components/ui/Table.vue';
import Tabs from '@/components/ui/Tabs.vue';
import type { CalendarModelValue } from '@/components/ui/Calendar.vue';
import type { MenuItem, MenuSelection } from '@/components/ui/menu';
import type { BoardStatus, DatabaseField, DatabaseProperty, PageEntry, PageSubtask, WorkspacePage } from '@/domain/workspace/types';
import { priorityCellOptions, statusOptions } from '@/domain/workspace/constants';

type ViewTab = { id: string; label: string; icon?: LucideIcon };
type Props = {
  activePage: WorkspacePage;
  visibleBoardStatuses: readonly BoardStatus[];
  boardViewTabs: readonly ViewTab[];
  databaseViewTabs: readonly ViewTab[];
  databaseStatusOptions: readonly { label: string; value: string }[];
  visibleDatabaseProperties: readonly DatabaseProperty[];
  databaseEntries: readonly PageEntry[];
  databaseEntryCount: number;
  databaseSortItems: readonly MenuItem[];
  databasePropertyItems: readonly MenuItem[];
  entryInspectorOpen: boolean;
  detailPageId: string | null;
  detailEntryId: string | null;
  draggedEntryId: string | null;
  dropTargetEntryId: string | null;
  entriesForStatus: (page: WorkspacePage, status: BoardStatus) => PageEntry[];
  entryIcon: (entry: PageEntry) => LucideIcon;
  entryIconStyle: (entry: PageEntry) => Record<string, string>;
  entrySubtasks: (entry: PageEntry) => PageSubtask[];
  entryDescription: (entry: PageEntry) => string;
  entryDateLabel: (entry: PageEntry) => string;
  entryCalendarDate: (entry: PageEntry) => Date | null;
  entryTags: (entry: PageEntry) => string[];
  handleBoardDragStart: (entry: PageEntry, event: DragEvent) => void;
  handleBoardDragOver: (entryId: string, event: DragEvent) => void;
  dropBoardEntry: (status: BoardStatus, event: DragEvent, target?: PageEntry) => void;
  handleBoardDragEnd: () => void;
  openEntryDetails: (page: WorkspacePage, entry: PageEntry) => void;
  openEntryModal: (status?: BoardStatus) => void;
  setEntryStatus: (page: WorkspacePage, entry: PageEntry, value: string | readonly string[] | undefined) => void;
  setEntryPriority: (page: WorkspacePage, entry: PageEntry, value: string | readonly string[] | undefined) => void;
  updateEntryDueFromPicker: (page: WorkspacePage, entry: PageEntry, value: CalendarModelValue) => void;
  updateTableSubtask: (page: WorkspacePage, subtask: PageSubtask, patch: Partial<Pick<PageSubtask, 'title' | 'done'>>) => void;
  toggleTableEntry: (entryId: string) => void;
  openTableSubtaskComposer: (entryId: string) => void;
  addTableSubtask: (page: WorkspacePage, entry: PageEntry) => void;
  addTableEntry: (page: WorkspacePage) => void;
  handleDatabaseSort: (selection: MenuSelection) => void;
  handleDatabaseProperty: (selection: MenuSelection) => void;
  visibleFields: readonly DatabaseField[];
  touchPage: (page: WorkspacePage) => void;
  updateFieldValue: (page: WorkspacePage, entry: PageEntry, field: DatabaseField, value: string | number | boolean) => void;
};

const {
  activePage, visibleBoardStatuses, boardViewTabs, databaseViewTabs, databaseStatusOptions,
  visibleDatabaseProperties, databaseEntries, databaseEntryCount, databaseSortItems, databasePropertyItems,
  entryInspectorOpen, detailPageId, detailEntryId, draggedEntryId, dropTargetEntryId,
  entriesForStatus, entryIcon, entryIconStyle, entrySubtasks, entryDescription, entryDateLabel,
  entryCalendarDate, entryTags, handleBoardDragStart, handleBoardDragOver, dropBoardEntry,
  handleBoardDragEnd, openEntryDetails, openEntryModal, setEntryStatus, setEntryPriority,
  updateEntryDueFromPicker, updateTableSubtask, toggleTableEntry, openTableSubtaskComposer,
  addTableSubtask, addTableEntry, handleDatabaseSort,
  handleDatabaseProperty, visibleFields, touchPage, updateFieldValue,
} = defineProps<Props>();

const activeView = defineModel<string>('activeView', { required: true });
const databaseQuery = defineModel<string>('databaseQuery', { required: true });
const databaseStatusFilter = defineModel<string>('databaseStatusFilter', { required: true });
const collapsedTableEntries = defineModel<string[]>('collapsedTableEntries', { required: true });
const tableSubtaskComposerId = defineModel<string | null>('tableSubtaskComposerId', { required: true });
const tableSubtaskDraft = defineModel<string>('tableSubtaskDraft', { required: true });
const newTableEntryTitle = defineModel<string>('newTableEntryTitle', { required: true });
const columnOrder = defineModel<string[]>('columnOrder', { required: true });
const columnWidths = defineModel<Record<string, number>>('columnWidths', { required: true });
const emit = defineEmits<{
  setFields: [fields: DatabaseField[]];
  setEntries: [entries: PageEntry[]];
  setTag: [former: string, next: string];
  descriptionConflict: [];
}>();
const currentSort = computed(() => databaseSortItems.find((item) => item.checked)?.id);
function headerSort(key: 'title' | 'due') {
  if (currentSort.value === 'sort:' + key) return 'ascending';
  if (currentSort.value === 'sort:' + key + '-desc') return 'descending';
  return 'none';
}
function sortColumn(key: 'title' | 'due') {
  handleDatabaseSort({ type: 'radio', id: 'sort:' + key + (headerSort(key) === 'ascending' ? '-desc' : '') });
}
const fieldDialog = ref(false);
const fieldId = ref<string | null>(null);
const fieldName = ref('');
const fieldType = ref<DatabaseField['type']>('text');
const fieldTypes = [{ value: 'text', label: 'Texto' }, { value: 'number', label: 'Número' }, { value: 'checkbox', label: 'Casilla' }];
const builtInColumns = {
  title: { name: 'Nombre', icon: FileText, width: 280 },
  content: { name: 'Descripción', icon: AlignLeft, width: 242 },
  status: { name: 'Estado', icon: CircleDot, width: 132 },
  priority: { name: 'Prioridad', icon: Flag, width: 135 },
  due: { name: 'Fecha', icon: CalendarDays, width: 125 },
  tags: { name: 'Etiquetas', icon: Tag, width: 174 },
};
const columns = computed(() => {
  const available = [
    ...(['title', ...visibleDatabaseProperties] as const).map((id) => ({ id: id as string, field: undefined, ...builtInColumns[id] })),
    ...visibleFields.map((field) => ({ id: field.id, name: field.name, field, width: 155, icon: field.type === 'checkbox' ? SquareCheck : field.type === 'number' ? Hash : AlignLeft })),
  ];
  const ordered = [...new Set([...columnOrder.value, ...available.map(({ id }) => id)])];
  return ordered.flatMap((id) => available.find((column) => column.id === id) ?? []);
});
const columnCount = computed(() => columns.value.length);
const draggingColumn = ref('');
const dragOverColumn = ref('');
const resizing = ref<{ id: string; startX: number; startWidth: number; width: number }>();
const minColumnWidth = (id: string) => id === 'title' ? 160 : 96;
function widthOf(column: { id: string; width: number }) {
  return resizing.value?.id === column.id ? resizing.value.width : columnWidths.value[column.id] ?? column.width;
}
const totalWidth = computed(() => columns.value.reduce((sum, column) => sum + widthOf(column), 0));
function clampWidth(id: string, value: number) { return Math.max(minColumnWidth(id), Math.min(Math.round(value), 700)); }
function resizeStart(event: PointerEvent, id: string, width: number) {
  if (event.button !== 0) return;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  resizing.value = { id, startX: event.clientX, startWidth: width, width };
}
function resizeMove(event: PointerEvent) {
  const state = resizing.value;
  if (state) state.width = clampWidth(state.id, state.startWidth + event.clientX - state.startX);
}
function resizeEnd(save: boolean) {
  if (save && resizing.value) columnWidths.value = { ...columnWidths.value, [resizing.value.id]: resizing.value.width };
  resizing.value = undefined;
}
function resizeKey(event: KeyboardEvent, id: string, current: number) {
  const steps: Record<string, number> = { ArrowLeft: -12, ArrowRight: 12, Home: -700, End: 700 };
  if (!Object.hasOwn(steps, event.key)) return;
  event.preventDefault();
  columnWidths.value = { ...columnWidths.value, [id]: clampWidth(id, current + steps[event.key]) };
}
function moveColumn(id: string, target: string) {
  if (id === target) return;
  const order = [...new Set([...columnOrder.value, ...columns.value.map((column) => column.id)])];
  const from = order.indexOf(id);
  const to = order.indexOf(target);
  if (from < 0 || to < 0) return;
  order.splice(from, 1);
  order.splice(to, 0, id);
  columnOrder.value = order;
}
function columnMenu(id: string, index: number): MenuItem[] {
  return [
    { id: 'left', label: 'Mover a la izquierda', disabled: index === 0 },
    { id: 'right', label: 'Mover a la derecha', disabled: index === columnCount.value - 1 },
    { id: 'reset', label: 'Restablecer ancho', disabled: columnWidths.value[id] === undefined },
    ...(columns.value[index]?.field ? [{ id: 'rename', label: 'Cambiar nombre…' }] : []),
  ];
}
function columnAction(selection: MenuSelection, index: number) {
  const column = columns.value[index];
  if (!column) return;
  if (selection.id === 'rename') editField(column.field);
  else if (selection.id === 'reset') {
    const widths = { ...columnWidths.value };
    delete widths[column.id];
    columnWidths.value = widths;
  } else {
    const target = columns.value[index + (selection.id === 'left' ? -1 : 1)];
    if (target) moveColumn(column.id, target.id);
  }
}
const tagList = computed(() => databaseTags(activePage));
const tagDialog = ref(false);
const tagDraft = ref('');
const tagEditing = ref('');
const tagRemoving = ref('');
const tagDuplicate = computed(() => tagList.value.some((tag) =>
  tag !== tagEditing.value && tag.localeCompare(tagDraft.value.trim(), 'es', { sensitivity: 'base' }) === 0));
function saveTag() {
  const name = tagDraft.value.trim();
  if (!name || tagDuplicate.value) return;
  emit('setTag', tagEditing.value, name);
  tagEditing.value = '';
  tagDraft.value = '';
}
function renameTag(tag: string) {
  tagRemoving.value = '';
  tagEditing.value = tag;
  tagDraft.value = tag;
  void nextTick(() => document.querySelector<HTMLInputElement>('#database-tag-name')?.select());
}
function toggleProperties(selection: MenuSelection) {
  if (selection.id === 'add-property') editField();
  else if (selection.id === 'manage-tags') {
    tagDraft.value = tagEditing.value = tagRemoving.value = '';
    tagDialog.value = true;
  } else handleDatabaseProperty(selection);
}
const manualSort = computed(() => currentSort.value === 'sort:manual');
const rowDrag = ref('');
const rowTarget = ref('');
function dropRow(id: string) {
  if (rowDrag.value) reorderRow(rowDrag.value, id);
  rowDrag.value = rowTarget.value = '';
}
function reorderRow(id: string, target: string) {
  if (!manualSort.value || id === target) return;
  const from = activePage.entries.findIndex((entry) => entry.id === id);
  const to = activePage.entries.findIndex((entry) => entry.id === target);
  if (from < 0 || to < 0) return;
  const entries = [...activePage.entries];
  const [entry] = entries.splice(from, 1);
  entries.splice(to, 0, entry);
  emit('setEntries', entries);
}
function rowOrderKey(event: KeyboardEvent, index: number) {
  if (!(event.altKey && ['ArrowUp', 'ArrowDown'].includes(event.key))) return;
  event.preventDefault();
  const target = databaseEntries[index + (event.key === 'ArrowUp' ? -1 : 1)];
  if (target) reorderRow(databaseEntries[index].id, target.id);
}
function updateTags(entry: PageEntry, tags: string[]) {
  entry.tags = tags;
  entry.tag = tags[0];
  touchPage(activePage);
}
function updateDescription(entry: PageEntry, content: string) {
  entry.content = content;
  touchPage(activePage);
}
function editField(field?: DatabaseField) {
  fieldId.value = field?.id ?? null;
  fieldName.value = field?.name ?? '';
  fieldType.value = field?.type ?? 'text';
  fieldDialog.value = true;
}
function saveField() {
  const name = fieldName.value.trim();
  if (!name) return;
  const fields = activePage.fields || [];
  const updated = fieldId.value
    ? fields.map((field) => field.id === fieldId.value ? { ...field, name } : field)
    : [...fields, { id: 'field-' + makeId(), name, type: fieldType.value }];
  emit('setFields', updated);
  fieldDialog.value = false;
}
const renameId = ref<string | null>(null);
const nameDraft = ref('');
function rename(entry: PageEntry) {
  renameId.value = entry.id;
  nameDraft.value = entry.title;
  void nextTick(() => document.querySelector<HTMLInputElement>('#database-rename')?.select());
}
function finishRename(entry: PageEntry) {
  if (renameId.value !== entry.id) return;
  renameId.value = null;
  const name = nameDraft.value.trim();
  if (name && name !== entry.title) { entry.title = name; touchPage(activePage); }
}
</script>

<template>
<div class="knote-database-shell" :style="activeView === 'table' ? { maxWidth: 'max(38rem, ' + (totalWidth + 2) + 'px)' } : undefined">
              <Tabs id="page-view-tabs" v-model="activeView" :items="activePage.type === 'database' ? databaseViewTabs : boardViewTabs" label="Vistas de la página" type="segmented" variant="surface" rounded="full" size="sm" :panel-surface="false" class="knote-view-tabs">
              <template #board>
                <div class="knote-board" aria-label="Tablero por estado">
                  <section v-for="status in visibleBoardStatuses" :key="status" class="knote-board-column" :data-status="status" @dragover.prevent @drop.prevent="dropBoardEntry(status, $event)">
                    <div class="knote-board-column-title"><span :class="'knote-status-mark knote-status-' + (status === 'Hecho' ? 'done' : status === 'En curso' ? 'active' : 'todo')"><Icon :icon="status === 'Hecho' ? CircleCheck : status === 'En curso' ? CircleDot : CircleDashed" size="xs" /></span><h2>{{ status }}</h2><Badge variant="outline" color="secondary" size="sm">{{ entriesForStatus(activePage, status).length }}</Badge><Button variant="glass" color="neutral" size="sm" shape="fab" :prefix-icon="Plus" :aria-label="'Añadir tarjeta en ' + status" :title="'Añadir tarjeta en ' + status" @click="openEntryModal(status)" /></div>
                    <div class="knote-board-cards">
                      <Card v-for="entry in entriesForStatus(activePage, status)" :key="entry.id" :data-entry-id="entry.id" variant="glass" padding="sm" class="knote-board-card" :class="{ 'knote-board-card--dragging': draggedEntryId === entry.id, 'knote-board-card--drop-target': dropTargetEntryId === entry.id }" role="button" tabindex="0" draggable="true" :aria-label="'Abrir ' + entry.title + '. Mantén y arrastra para cambiar su posición o estado.'" @click="openEntryDetails(activePage, entry)" @keydown.enter.prevent="openEntryDetails(activePage, entry)" @keydown.space.prevent="openEntryDetails(activePage, entry)" @dragstart.stop="handleBoardDragStart(entry, $event)" @dragover="handleBoardDragOver(entry.id, $event)" @drop.stop.prevent="dropBoardEntry(status, $event, entry)" @dragend="handleBoardDragEnd">
                        <h3 class="knote-board-card-heading"><Icon :icon="entryIcon(entry)" size="sm" :style="entryIconStyle(entry)" aria-hidden="true" /><span>{{ entry.title }}</span></h3>
                        <div v-if="entrySubtasks(entry).length" class="knote-board-subtasks" :aria-label="entrySubtasks(entry).length + ' subtareas'">
                          <span v-for="subtask in entrySubtasks(entry).slice(0, 3)" :key="subtask.id" :class="{ 'knote-subtask-is-done': subtask.done }"><Icon :icon="subtask.done ? CircleCheck : CircleDashed" size="xs" /><span>{{ subtask.title }}</span></span>
                          <small v-if="entrySubtasks(entry).length > 3">+{{ entrySubtasks(entry).length - 3 }} más</small>
                        </div>
                        <p v-else-if="entryDescription(entry)" class="knote-board-card-content">{{ entryDescription(entry) }}</p>
                        <div class="knote-board-card-meta">
                          <div class="knote-board-card-tags"><Badge v-for="tag in entryTags(entry)" :key="tag" variant="soft" color="secondary" size="sm">{{ tag }}</Badge></div>
                          <span v-if="entry.due" class="knote-board-card-date">{{ entryDateLabel(entry) }}</span>
                        </div>
                        <div v-if="entry.priority" class="knote-entry-priority" :data-priority="entry.priority"><span class="knote-priority-dot" />{{ entry.priority }} prioridad</div>
                      </Card>
                      <p v-if="!entriesForStatus(activePage, status).length" class="knote-column-empty" @dragover.prevent @drop.stop.prevent="dropBoardEntry(status, $event)">Suelta aquí una tarjeta o crea una nueva.</p>
                    </div>
                  </section>
                </div>
              </template>
    <template #table>
      <Table class="knote-database-table knote-sheet" :caption="'Elementos de ' + activePage.title" variant="surface" density="compact"
        :column-count="columnCount" :hover="false" :style="{ '--knote-sheet-width': totalWidth + 'px' }">
        <template #header>
          <thead><tr>
            <th v-for="(column, index) in columns" :key="column.id" scope="col" :data-column="column.id"
              :data-drop="dragOverColumn === column.id || undefined" :style="{ width: widthOf(column) + 'px' }"
              :aria-sort="column.id === 'title' || column.id === 'due' ? headerSort(column.id) : undefined"
              @dragover.prevent="dragOverColumn = draggingColumn ? column.id : ''"
              @dragleave="dragOverColumn = ''"
              @drop.prevent="moveColumn(draggingColumn, column.id); draggingColumn = dragOverColumn = ''">
              <div class="knote-column-heading">
                <Button v-if="column.id === 'title' || column.id === 'due'" variant="soft" color="neutral" size="sm" class="knote-column-label"
                  :aria-label="'Ordenar por ' + column.name.toLowerCase()" :prefix-icon="column.icon" @click="sortColumn(column.id === 'title' ? 'title' : 'due')">
                  <span>{{ column.name }}</span><Icon v-if="headerSort(column.id) !== 'none'" :icon="headerSort(column.id) === 'ascending' ? ArrowUp : ArrowDown" size="xs" />
                </Button>
                <span v-else class="knote-column-label" :title="column.name"><Icon :icon="column.icon" size="xs" /><span>{{ column.name }}</span></span>
                <span class="knote-column-drag" draggable="true"
                  @dragstart="draggingColumn = column.id; $event.dataTransfer?.setData('text/plain', column.name)"
                  @dragend="draggingColumn = dragOverColumn = ''">
                  <DropdownMenu :id="'column-menu-' + column.id" :label="'Opciones de columna ' + column.name" :items="columnMenu(column.id, index)"
                    variant="surface" align="end" class="knote-column-menu" @select="columnAction($event, index)">
                    <template #trigger><Icon :icon="GripVertical" size="xs" /></template>
                  </DropdownMenu>
                </span>
              </div>
              <span class="knote-column-resizer" role="separator" aria-orientation="vertical" tabindex="0" :aria-label="'Ancho de ' + column.name"
                :aria-valuenow="widthOf(column)" :aria-valuemin="minColumnWidth(column.id)" :aria-valuemax="700"
                @keydown="resizeKey($event, column.id, widthOf(column))" @pointerdown.stop.prevent="resizeStart($event, column.id, widthOf(column))"
                @pointermove="resizeMove" @pointerup="resizeEnd(true)" @pointercancel="resizeEnd(false)" @lostpointercapture="resizeEnd(false)" />
            </th>
          </tr></thead>
        </template>
        <tbody>
          <tr v-if="!databaseEntries.length"><td :colspan="columnCount" class="knote-empty-cell">{{ activePage.entries.length ? 'Ninguna tarea coincide con los filtros.' : 'La tabla todavía no tiene tareas.' }}</td></tr>
          <template v-for="(entry, rowIndex) in databaseEntries" :key="entry.id">
            <tr class="knote-table-entry-row" :class="{ 'knote-table-entry-row--selected': entryInspectorOpen && detailPageId === activePage.id && detailEntryId === entry.id }"
              :data-drop="rowTarget === entry.id || undefined" @dragover.prevent="rowTarget = rowDrag ? entry.id : ''" @drop.prevent="dropRow(entry.id)">
              <template v-for="column in columns" :key="column.id">
                <th v-if="column.id === 'title'" scope="row" data-column="title">
                  <div class="knote-row-title">
                    <Button v-if="manualSort" variant="soft" color="neutral" size="sm" :prefix-icon="GripVertical" class="knote-row-grip"
                      :aria-label="'Mover ' + entry.title" title="Arrastra para mover · Alt + ↑ o ↓" draggable="true"
                      @keydown="rowOrderKey($event, rowIndex)"
                      @dragstart="rowDrag = entry.id; $event.dataTransfer?.setData('text/plain', entry.title)" @dragend="rowDrag = rowTarget = ''" />
                    <Button v-if="entrySubtasks(entry).length" variant="soft" color="neutral" size="sm" class="knote-row-toggle"
                      :prefix-icon="collapsedTableEntries.includes(entry.id) ? ChevronRight : ChevronDown"
                      :aria-expanded="!collapsedTableEntries.includes(entry.id)" :aria-label="'Subtareas de ' + entry.title" @click="toggleTableEntry(entry.id)" />
                    <Button v-else variant="soft" color="neutral" size="sm" class="knote-row-toggle knote-row-add"
                      :prefix-icon="Plus" :aria-label="'Añadir subtarea a ' + entry.title" @click="openTableSubtaskComposer(entry.id)" />
                    <Input v-if="renameId === entry.id" id="database-rename" v-model="nameDraft" label="Nombre de la tarea" size="sm" variant="surface"
                      class="knote-row-rename" maxlength="500" @blur="finishRename(entry)" @keydown.enter.prevent="finishRename(entry)" @keydown.escape.stop.prevent="renameId = null" />
                    <Button v-else variant="soft" color="neutral" size="sm" class="knote-row-name" :title="entry.title" :aria-label="'Renombrar ' + entry.title" @click="rename(entry)">
                      <Icon :icon="entryIcon(entry)" size="sm" :style="entryIconStyle(entry)" /><span>{{ entry.title || 'Sin título' }}</span>
                    </Button>
                    <Button variant="soft" color="neutral" size="sm" :prefix-icon="PanelRightOpen" class="knote-row-page"
                      :aria-label="'Abrir tarea ' + entry.title" title="Abrir página de tarea" @click="openEntryDetails(activePage, entry)" />
                  </div>
                </th>
                <td v-else :data-column="column.id">
                  <DescriptionCell v-if="column.id === 'content'" :id="'description-' + entry.id" :title="entry.title" :content="entry.content || ''"
                  @change="updateDescription(entry, $event)" @conflict="emit('descriptionConflict')" />
                  <Select v-else-if="column.id === 'status'" :id="'database-entry-status-' + entry.id" :model-value="entry.status"
                    :label="'Estado de ' + entry.title" :options="statusOptions" size="sm" variant="soft" rounded="md" class="knote-sheet-choice"
                    @update:model-value="setEntryStatus(activePage, entry, $event)">
                    <template #selected="{ text }"><span class="knote-property-value" :data-status="text"><i />{{ text }}</span></template>
                    <template #option="{ option }"><span class="knote-property-value" :data-status="option.value"><i />{{ option.label }}</span></template>
                  </Select>
                  <Select v-else-if="column.id === 'priority'" :id="'database-entry-priority-' + entry.id" :model-value="entry.priority || 'Sin prioridad'"
                    :label="'Prioridad de ' + entry.title" :options="priorityCellOptions" size="sm" variant="soft" rounded="md" class="knote-sheet-choice"
                    @update:model-value="setEntryPriority(activePage, entry, $event)">
                    <template #selected="{ text }"><span class="knote-property-value" :data-priority="text"><Icon :icon="Flag" size="xs" />{{ text }}</span></template>
                    <template #option="{ option }"><span class="knote-property-value" :data-priority="option.value"><Icon :icon="Flag" size="xs" />{{ option.label }}</span></template>
                  </Select>
                  <DatePicker v-else-if="column.id === 'due'" :id="'database-due-' + entry.id" :model-value="entryCalendarDate(entry)"
                    :label="'Fecha de ' + entry.title" locale="es-ES" :display-format="{ day: 'numeric', month: 'short' }"
                    :placeholder="entry.due ? entryDateLabel(entry) : 'Sin fecha'" clear-label="Quitar fecha" rounded="md" class="knote-table-date-picker"
                    @update:model-value="updateEntryDueFromPicker(activePage, entry, $event)" />
                  <TagsSelect v-else-if="column.id === 'tags'" :id="'database-tags-' + entry.id" :label="'Etiquetas de ' + entry.title" :tags="entryTags(entry)" :options="tagList"
                    @change="updateTags(entry, $event)" />
                  <FieldInput v-else-if="column.field" :id="'cell-' + column.id + '-' + entry.id" :field="column.field" :entry="entry"
                    @change="(value) => column.field && updateFieldValue(activePage, entry, column.field, value)" />
                </td>
              </template>
            </tr>
            <template v-if="!collapsedTableEntries.includes(entry.id)">
              <tr v-for="subtask in entrySubtasks(entry)" :key="subtask.id" class="knote-sheet-child-row" :class="{ 'is-complete': subtask.done }">
                <template v-for="column in columns" :key="column.id">
                  <th v-if="column.id === 'title'" scope="row" data-column="title">
                    <div class="knote-sheet-child">
                      <Checkbox :id="'table-subtask-' + subtask.id" :model-value="subtask.done" :label="'Completar ' + subtask.title"
                        size="sm" rounded="sm" variant="outline" class="knote-subtask-tick" @update:model-value="updateTableSubtask(activePage, subtask, { done: $event })" />
                      <Input :id="'table-subtask-title-' + subtask.id" :model-value="subtask.title" :label="'Subtarea de ' + entry.title"
                        size="sm" variant="surface" class="knote-subtask-text" @update:model-value="updateTableSubtask(activePage, subtask, { title: String($event) })" />
                    </div>
                  </th>
                  <td v-else />
                </template>
              </tr>
              <tr v-if="entrySubtasks(entry).length || tableSubtaskComposerId === entry.id" class="knote-sheet-add-child">
                <td :colspan="columnCount">
                  <form v-if="tableSubtaskComposerId === entry.id" class="knote-sheet-inline-form" @submit.prevent="addTableSubtask(activePage, entry)">
                    <Input :id="'table-new-subtask-' + entry.id" v-model="tableSubtaskDraft" :label="'Nueva subtarea de ' + entry.title"
                      placeholder="Nombre de la subtarea" size="sm" variant="surface" @keydown.escape.stop.prevent="tableSubtaskComposerId = null" />
                    <Button type="submit" variant="soft" color="neutral" size="sm" :disabled="!tableSubtaskDraft.trim()">Añadir</Button>
                  </form>
                  <Button v-else variant="soft" color="neutral" size="sm" :prefix-icon="Plus" class="knote-sheet-add-child-button" @click="openTableSubtaskComposer(entry.id)">Nueva subtarea</Button>
                </td>
              </tr>
            </template>
          </template>
          <tr class="knote-sheet-footer"><td :colspan="columnCount">
            <form class="knote-sheet-inline-form" @submit.prevent="addTableEntry(activePage)">
              <Icon :icon="Plus" size="sm" />
              <Input id="table-new-entry" v-model="newTableEntryTitle" label="Nueva tarea" placeholder="Nueva tarea" size="sm" variant="surface"
                @keydown.escape.stop.prevent="newTableEntryTitle = ''" />
              <Button v-if="newTableEntryTitle.trim()" type="submit" variant="soft" color="neutral" size="sm">Crear</Button>
            </form>
          </td></tr>
        </tbody>
      </Table>
    </template>
              </Tabs>
              <div class="knote-database-toolbar">
                <span class="knote-database-count">{{ databaseEntryCount }} {{ databaseEntryCount === 1 ? 'tarea' : 'tareas' }}</span>
                <div class="knote-database-tools">
                  <label class="knote-database-search"><Icon :icon="Search" size="sm" /><input v-model="databaseQuery" type="search" placeholder="Buscar" aria-label="Buscar elementos" /></label>
                  <Select id="database-status-filter" v-model="databaseStatusFilter" label="Filtrar por estado" :options="databaseStatusOptions" size="sm" variant="soft" rounded="md" class="knote-database-filter">
                    <template #selected="{ text }"><span class="knote-database-select-value"><Icon :icon="Filter" size="xs" />{{ text }}</span></template>
                  </Select>
                  <DropdownMenu id="database-sort" label="Ordenar elementos" :items="databaseSortItems" side="bottom" align="end" variant="surface" rounded="lg" class="knote-database-menu knote-database-action" @select="handleDatabaseSort"><template #trigger><Icon :icon="ArrowUpDown" size="sm" /><span>Ordenar</span></template></DropdownMenu>
                  <DropdownMenu id="database-properties" label="Mostrar propiedades" :items="databasePropertyItems" side="bottom" align="end" variant="surface" rounded="lg" class="knote-database-menu knote-database-action" @select="toggleProperties"><template #trigger><Icon :icon="SlidersHorizontal" size="sm" /><span>Propiedades</span></template></DropdownMenu>
                  <Button variant="solid" color="primary" size="sm" :prefix-icon="Plus" @click="openEntryModal(databaseStatusFilter === 'Todas' ? undefined : databaseStatusFilter as BoardStatus)">Nuevo</Button>
                </div>
              </div>
              </div>
  <Modal id="database-field-dialog" v-model="fieldDialog" :title="fieldId ? 'Renombrar propiedad' : 'Nueva propiedad'" close-label="Cerrar propiedad">
    <Input id="database-field-name" v-model="fieldName" label="Nombre de la propiedad" placeholder="Ej. Responsable" maxlength="100" @keydown.enter.prevent="saveField" />
    <Select v-if="!fieldId" id="database-field-type" v-model="fieldType" label="Tipo de propiedad" :options="fieldTypes" />
    <template #footer><Button variant="soft" color="neutral" @click="fieldDialog = false">Cancelar</Button><Button :disabled="!fieldName.trim()" @click="saveField">Guardar</Button></template>
  </Modal>
  <Modal id="database-tag-dialog" v-model="tagDialog" title="Gestionar etiquetas" size="md" close-label="Cerrar etiquetas">
    <form class="knote-tag-form" @submit.prevent="saveTag">
      <Input id="database-tag-name" v-model="tagDraft" :label="tagEditing ? 'Nuevo nombre' : 'Nombre de la etiqueta'" maxlength="80" placeholder="Ej. Diseño" />
      <Button type="submit" :disabled="!tagDraft.trim() || tagDuplicate">{{ tagEditing ? 'Guardar' : 'Crear etiqueta' }}</Button>
    </form>
    <p v-if="tagDuplicate" class="knote-tag-message" role="status">Ya existe una etiqueta con ese nombre.</p>
    <ul v-if="tagList.length" class="knote-tag-list">
      <li v-for="tag in tagList" :key="tag">
        <span class="knote-tag-chip">{{ tag }}</span>
        <div>
          <Button v-if="tagRemoving === tag" variant="soft" color="destructive" size="sm" @click="emit('setTag', tag, ''); tagRemoving = ''; if (tagEditing === tag) { tagEditing = ''; tagDraft = ''; }">Quitar de la tabla y sus tareas</Button>
          <template v-else>
            <Button variant="soft" color="neutral" size="sm" @click="renameTag(tag)">Renombrar</Button>
            <Button variant="soft" color="neutral" size="sm" :prefix-icon="X" :aria-label="'Quitar etiqueta ' + tag" @click="tagRemoving = tag" />
          </template>
        </div>
      </li>
    </ul>
  </Modal>
</template>
