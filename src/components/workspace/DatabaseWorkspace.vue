<script setup lang="ts">
import type { Component } from 'vue';
import {
  AlignLeft, ArrowUpDown, CalendarDays, ChevronDown, ChevronRight, CircleCheck, CircleDashed, CircleDot,
  FileText, Filter, Plus, Search, SlidersHorizontal, StickyNote,
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
import type { BoardStatus, DatabaseProperty, PageEntry, PageSubtask, WorkspacePage } from '@/domain/workspace/types';

type ViewTab = { id: string; label: string; icon?: Component };
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
  entryIcon: (entry: PageEntry) => Component;
  entryIconStyle: (entry: PageEntry) => Record<string, string>;
  entrySubtasks: (entry: PageEntry) => PageSubtask[];
  entryDescription: (entry: PageEntry) => string;
  entryDateLabel: (entry: PageEntry) => string;
  entryCalendarDate: (entry: PageEntry) => Date | null;
  entryTags: (entry: PageEntry) => string[];
  entryTagsLabel: (entry: PageEntry) => string;
  handleBoardDragStart: (entry: PageEntry, event: DragEvent) => void;
  handleBoardDragOver: (entryId: string, event: DragEvent) => void;
  dropBoardEntry: (status: BoardStatus, event: DragEvent, target?: PageEntry) => void;
  handleBoardDragEnd: () => void;
  openEntryDetails: (page: WorkspacePage, entry: PageEntry) => void;
  openEntryModal: (status?: BoardStatus) => void;
  setEntryStatus: (page: WorkspacePage, entry: PageEntry, value: string | readonly string[] | undefined) => void;
  setEntryPriority: (page: WorkspacePage, entry: PageEntry, value: string | readonly string[] | undefined) => void;
  updateEntryDueFromPicker: (page: WorkspacePage, entry: PageEntry, value: CalendarModelValue) => void;
  updateEntryTagsDraft: (value: string | number) => void;
  finishEntryTagsEdit: (page: WorkspacePage, entry: PageEntry) => void;
  cancelEntryTagsEdit: (entry: PageEntry) => void;
  beginEntryTagsEdit: (entry: PageEntry) => void;
  updateTableSubtask: (page: WorkspacePage, subtask: PageSubtask, patch: Partial<Pick<PageSubtask, 'title' | 'done'>>) => void;
  toggleTableEntry: (entryId: string) => void;
  openTableSubtaskComposer: (entryId: string) => void;
  addTableSubtask: (page: WorkspacePage, entry: PageEntry) => void;
  addTableEntry: (page: WorkspacePage) => void;
  openEntryDescription: (page: WorkspacePage, entry: PageEntry) => void;
  handleDatabaseSort: (selection: MenuSelection) => void;
  handleDatabaseProperty: (selection: MenuSelection) => void;
  focusNewTableEntry: () => void;
};

const {
  activePage, visibleBoardStatuses, boardViewTabs, databaseViewTabs, databaseStatusOptions,
  visibleDatabaseProperties, databaseEntries, databaseEntryCount, databaseSortItems, databasePropertyItems,
  entryInspectorOpen, detailPageId, detailEntryId, draggedEntryId, dropTargetEntryId,
  entriesForStatus, entryIcon, entryIconStyle, entrySubtasks, entryDescription, entryDateLabel,
  entryCalendarDate, entryTags, entryTagsLabel, handleBoardDragStart, handleBoardDragOver, dropBoardEntry,
  handleBoardDragEnd, openEntryDetails, openEntryModal, setEntryStatus, setEntryPriority,
  updateEntryDueFromPicker, updateEntryTagsDraft, finishEntryTagsEdit, cancelEntryTagsEdit,
  beginEntryTagsEdit, updateTableSubtask, toggleTableEntry, openTableSubtaskComposer,
  addTableSubtask, addTableEntry, openEntryDescription, handleDatabaseSort,
  handleDatabaseProperty, focusNewTableEntry,
} = defineProps<Props>();

const activeView = defineModel<string>('activeView', { required: true });
const databaseQuery = defineModel<string>('databaseQuery', { required: true });
const databaseStatusFilter = defineModel<string>('databaseStatusFilter', { required: true });
const collapsedTableEntries = defineModel<string[]>('collapsedTableEntries', { required: true });
const tableSubtaskComposerId = defineModel<string | null>('tableSubtaskComposerId', { required: true });
const tableSubtaskDraft = defineModel<string>('tableSubtaskDraft', { required: true });
const newTableEntryTitle = defineModel<string>('newTableEntryTitle', { required: true });
const editingTagsEntryId = defineModel<string | null>('editingTagsEntryId', { required: true });
const databaseTagsDraft = defineModel<string>('databaseTagsDraft', { required: true });
</script>

<template>
<div class="knote-database-shell">
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
                <Table class="knote-database-table" :caption="'Elementos de ' + activePage.title" variant="surface" density="comfortable" :column-count="1 + visibleDatabaseProperties.length" :hover="false">
                  <template #header><thead><tr><th scope="col"><Icon :icon="FileText" size="xs" />Nombre</th><th v-if="visibleDatabaseProperties.includes('content')" class="knote-table-description-heading" scope="col"><Icon :icon="AlignLeft" size="xs" />Descripción</th><th v-if="visibleDatabaseProperties.includes('status')" class="knote-table-status-heading" scope="col"><Icon :icon="CircleDot" size="xs" />Estado</th><th v-if="visibleDatabaseProperties.includes('priority')" class="knote-table-priority-heading" scope="col"><Icon :icon="Filter" size="xs" />Prioridad</th><th v-if="visibleDatabaseProperties.includes('due')" class="knote-table-date-heading" scope="col"><Icon :icon="CalendarDays" size="xs" />Fecha</th><th v-if="visibleDatabaseProperties.includes('tags')" class="knote-table-tags-heading" scope="col"><Icon :icon="StickyNote" size="xs" />Etiquetas</th></tr></thead></template>
                  <tbody v-if="databaseEntries.length">
                    <template v-for="entry in databaseEntries" :key="entry.id">
                      <tr class="knote-table-entry-row" :class="{ 'knote-table-entry-row--selected': entryInspectorOpen && detailPageId === activePage.id && detailEntryId === entry.id }">
                        <th scope="row"><span class="knote-table-entry-title"><Button v-if="entrySubtasks(entry).length" variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="collapsedTableEntries.includes(entry.id) ? ChevronRight : ChevronDown" :aria-label="(collapsedTableEntries.includes(entry.id) ? 'Mostrar' : 'Ocultar') + ' subtareas de ' + entry.title" :title="(collapsedTableEntries.includes(entry.id) ? 'Mostrar' : 'Ocultar') + ' subtareas'" class="knote-table-entry-expand" @click.stop="toggleTableEntry(entry.id)" @keydown.enter.stop @keydown.space.stop /><Button v-else variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="Plus" :aria-label="'Añadir subtarea a ' + entry.title" :title="'Añadir subtarea a ' + entry.title" class="knote-table-entry-expand knote-table-entry-add" @click.stop="openTableSubtaskComposer(entry.id)" /><Button variant="glass" color="neutral" size="sm" class="knote-table-entry-open" :aria-label="'Abrir tarea ' + entry.title" @click="openEntryDetails(activePage, entry)"><Icon :icon="entryIcon(entry)" size="sm" :style="entryIconStyle(entry)" /><span class="knote-table-entry-name">{{ entry.title }}</span></Button></span></th>
                        <td v-if="visibleDatabaseProperties.includes('content')" class="knote-table-description-cell" @click.stop>
                          <Button
                            variant="soft"
                            color="neutral"
                            size="sm"
                            class="knote-table-cell-trigger knote-table-description-trigger"
                            :aria-label="'Editar descripción de ' + entry.title"
                            :title="entryDescription(entry) || 'Añadir una descripción'"
                            @click.stop="openEntryDescription(activePage, entry)"
                          ><span class="knote-table-description-preview">{{ entryDescription(entry) || 'Añadir descripción' }}</span></Button>
                        </td>
                        <td v-if="visibleDatabaseProperties.includes('status')" class="knote-table-property-cell knote-table-status-cell">
                          <Select :id="'database-entry-status-' + entry.id" :model-value="entry.status" :label="'Estado de ' + entry.title" :options="statusOptions" size="sm" variant="soft" rounded="full" class="knote-table-property-select" @update:model-value="(value) => setEntryStatus(activePage, entry, value)">
                            <template #selected="{ text }"><Badge variant="soft" :color="text === 'Hecho' ? 'success' : text === 'En curso' ? 'info' : 'secondary'" size="sm">{{ text }}</Badge></template>
                            <template #option="{ option }"><span class="knote-status-option" :data-status="option.value"><span class="knote-status-option-dot" />{{ option.label }}</span></template>
                          </Select>
                        </td>
                        <td v-if="visibleDatabaseProperties.includes('priority')" class="knote-table-property-cell knote-table-priority-cell">
                          <Select :id="'database-entry-priority-' + entry.id" :model-value="entry.priority || 'Sin prioridad'" :label="'Prioridad de ' + entry.title" :options="priorityCellOptions" size="sm" variant="soft" rounded="full" class="knote-table-property-select" @update:model-value="(value) => setEntryPriority(activePage, entry, value)">
                            <template #selected="{ text }"><span v-if="entry.priority" class="knote-entry-priority" :data-priority="entry.priority"><span class="knote-priority-dot" />{{ text }}</span><span v-else class="knote-table-unprioritized" title="Sin prioridad">{{ text }}</span></template>
                          </Select>
                        </td>
                        <td v-if="visibleDatabaseProperties.includes('due')" class="knote-table-date-cell" @click.stop>
                          <DatePicker
                            :id="'database-due-' + entry.id"
                            :model-value="entryCalendarDate(entry)"
                            :label="'Fecha de ' + entry.title"
                            locale="es-ES"
                            :display-format="{ day: 'numeric', month: 'short' }"
                            :placeholder="entry.due ? entryDateLabel(entry) : 'Añadir fecha'"
                            clear-label="Quitar fecha"
                            rounded="md"
                            class="knote-table-date-picker"
                            @update:model-value="(value) => updateEntryDueFromPicker(activePage, entry, value)"
                          />
                        </td>
                        <td v-if="visibleDatabaseProperties.includes('tags')" class="knote-table-tags-cell" @click.stop>
                          <Input
                            v-if="editingTagsEntryId === entry.id"
                            :id="'database-tags-' + entry.id"
                            :model-value="databaseTagsDraft"
                            :label="'Etiquetas de ' + entry.title"
                            placeholder="Diseño, pruebas…"
                            size="sm"
                            variant="surface"
                            class="knote-table-inline-tags"
                            @update:model-value="updateEntryTagsDraft"
                            @keydown.enter.stop.prevent="finishEntryTagsEdit(activePage, entry)"
                            @keydown.escape.stop.prevent="cancelEntryTagsEdit(entry)"
                            @blur="finishEntryTagsEdit(activePage, entry)"
                          />
                          <Button
                            v-else
                            variant="soft"
                            color="neutral"
                            size="sm"
                            class="knote-table-cell-trigger knote-table-tags-trigger"
                            :aria-label="'Editar etiquetas de ' + entry.title"
                            :title="entryTagsLabel(entry)"
                            @click.stop="beginEntryTagsEdit(entry)"
                          ><template v-if="entryTags(entry).length"><Badge v-for="tag in entryTags(entry).slice(0, 2)" :key="tag" variant="soft" color="secondary" size="sm">{{ tag }}</Badge><span v-if="entryTags(entry).length > 2" class="knote-table-tag-overflow">+{{ entryTags(entry).length - 2 }}</span></template><span v-else>Añadir etiqueta</span></Button>
                        </td>
                      </tr>
                      <tr v-for="subtask in (collapsedTableEntries.includes(entry.id) ? [] : entrySubtasks(entry))" :key="subtask.id" class="knote-table-subtask-row">
                        <th scope="row"><span class="knote-table-subtask-title"><Checkbox :id="'table-subtask-' + subtask.id" :model-value="subtask.done" :label="'Completar ' + subtask.title" size="sm" variant="surface" class="knote-table-subtask-check" @update:model-value="(done) => updateTableSubtask(activePage, subtask, { done })" /><Input :id="'table-subtask-title-' + subtask.id" :model-value="subtask.title" :label="'Subtarea de ' + entry.title" size="sm" variant="surface" class="knote-table-subtask-input" @update:model-value="(title) => updateTableSubtask(activePage, subtask, { title: String(title) })" /></span></th>
                        <td v-if="visibleDatabaseProperties.includes('content')" class="knote-table-description knote-table-description--empty">—</td>
                        <td v-if="visibleDatabaseProperties.includes('status')"><Badge variant="soft" :color="subtask.done ? 'success' : 'secondary'" size="sm">{{ subtask.done ? 'Hecho' : 'Pendiente' }}</Badge></td>
                        <td v-if="visibleDatabaseProperties.includes('priority')">—</td>
                        <td v-if="visibleDatabaseProperties.includes('due')">—</td>
                        <td v-if="visibleDatabaseProperties.includes('tags')">—</td>
                      </tr>
                      <tr v-if="!collapsedTableEntries.includes(entry.id) && (entrySubtasks(entry).length || tableSubtaskComposerId === entry.id)" :key="entry.id + '-add-subtask'" class="knote-table-add-subtask-row">
                        <td :colspan="1 + visibleDatabaseProperties.length"><span class="knote-table-add-subtask"><template v-if="tableSubtaskComposerId === entry.id"><Input :id="'table-new-subtask-' + entry.id" v-model="tableSubtaskDraft" :label="'Nueva subtarea de ' + entry.title" placeholder="Nombre de la subtarea" size="sm" variant="surface" class="knote-table-new-subtask-input" @keydown.enter.stop.prevent="addTableSubtask(activePage, entry)" @keydown.escape.stop.prevent="tableSubtaskComposerId = null" /><Button variant="soft" color="neutral" size="sm" :disabled="!tableSubtaskDraft.trim()" @click="addTableSubtask(activePage, entry)">Añadir</Button></template><Button v-else variant="soft" color="neutral" size="sm" :prefix-icon="Plus" @click="openTableSubtaskComposer(entry.id)">Nueva subtarea</Button></span></td>
                      </tr>
                    </template>
                    <tr class="knote-table-new-entry-row"><td :colspan="1 + visibleDatabaseProperties.length"><span class="knote-table-new-entry"><Icon :icon="Plus" size="sm" /><Input id="table-new-entry" v-model="newTableEntryTitle" label="Nueva tarea" placeholder="Nueva tarea · Intro para crear" size="sm" variant="surface" class="knote-table-new-entry-input" @keydown.enter.stop.prevent="addTableEntry(activePage)" @keydown.escape.stop.prevent="newTableEntryTitle = ''" /></span></td></tr>
                  </tbody>
                  <tbody v-else><tr><td :colspan="1 + visibleDatabaseProperties.length" class="knote-empty-cell">{{ activePage.entries.length ? 'No hay elementos que coincidan con esos filtros.' : 'La tabla todavía no tiene elementos.' }}</td></tr><tr class="knote-table-new-entry-row"><td :colspan="1 + visibleDatabaseProperties.length"><span class="knote-table-new-entry"><Icon :icon="Plus" size="sm" /><Input id="table-new-entry" v-model="newTableEntryTitle" label="Nueva tarea" placeholder="Nueva tarea · Intro para crear" size="sm" variant="surface" class="knote-table-new-entry-input" @keydown.enter.stop.prevent="addTableEntry(activePage)" /></span></td></tr></tbody>
                </Table>
              </template>
              </Tabs>
              <div class="knote-database-toolbar">
                <span class="knote-database-count">{{ databaseEntryCount }} elementos</span>
                <div class="knote-database-tools">
                  <label class="knote-database-search"><Icon :icon="Search" size="sm" /><input v-model="databaseQuery" type="search" placeholder="Buscar" aria-label="Buscar elementos" /></label>
                  <Select id="database-status-filter" v-model="databaseStatusFilter" label="Filtrar por estado" :options="databaseStatusOptions" size="sm" variant="soft" rounded="xl" class="knote-database-filter"><template #selected="{ text }"><span class="knote-database-select-value"><Icon :icon="Filter" size="sm" />{{ text }}</span></template></Select>
                  <DropdownMenu id="database-sort" label="Ordenar elementos" :items="databaseSortItems" side="bottom" align="end" variant="surface" rounded="lg" class="knote-database-menu knote-database-action" @select="handleDatabaseSort"><template #trigger><Icon :icon="ArrowUpDown" size="sm" /><span>Ordenar</span></template></DropdownMenu>
                  <DropdownMenu id="database-properties" label="Mostrar propiedades" :items="databasePropertyItems" side="bottom" align="end" variant="surface" rounded="lg" class="knote-database-menu knote-database-action" @select="handleDatabaseProperty"><template #trigger><Icon :icon="SlidersHorizontal" size="sm" /><span>Propiedades</span></template></DropdownMenu>
                  <Button variant="soft" color="neutral" size="sm" :prefix-icon="Plus" class="knote-database-action" @click="activeView === 'table' ? focusNewTableEntry() : openEntryModal()">Nuevo</Button>
                </div>
              </div>
              </div>
</template>
