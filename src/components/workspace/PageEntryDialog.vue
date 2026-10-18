<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Modal from '@/components/ui/Modal.vue';
import Select from '@/components/ui/Select.vue';
import Tabs from '@/components/ui/Tabs.vue';
import type { BoardStatus, TaskPriority, WorkspacePage } from '@/domain/workspace/types';
import { priorityOptions } from '@/domain/workspace/constants';
import { Check, CircleCheck, CircleDashed, CircleDot } from '@lucide/vue';

defineProps<{ activePage: WorkspacePage | null; dialogTitle: string }>();
const isOpen = defineModel<boolean>({ required: true });
const title = defineModel<string>('entryTitle', { required: true });
const status = defineModel<BoardStatus>('entryStatus', { required: true });
const due = defineModel<string>('entryDue', { required: true });
const tag = defineModel<string>('entryTag', { required: true });
const priority = defineModel<TaskPriority | 'Sin prioridad'>('entryPriority', { required: true });
const emit = defineEmits<{ save: [] }>();

const entryStatusTabs = [
  { id: 'Por hacer', label: 'Por hacer', icon: CircleDashed },
  { id: 'En curso', label: 'En curso', icon: CircleDot },
  { id: 'Hecho', label: 'Hecho', icon: CircleCheck },
];
</script>

<template>
  <Modal id="page-entry-dialog" v-model="isOpen" :title="dialogTitle" description="Organiza el estado, la fecha y el grupo de este elemento." presentation="dialog" variant="glass" size="md" close-label="Cerrar elemento">
    <div class="knote-entry-form">
      <Input id="page-entry-title" v-model="title" label="Nombre" placeholder="Ej. Preparar el siguiente paso" required autofocus @keydown.enter.prevent="emit('save')" />
      <Tabs v-if="activePage && activePage.type !== 'calendar' && activePage.type !== 'tasks'" id="page-entry-status" v-model="status" :items="entryStatusTabs" label="Estado del elemento" type="pills" variant="glass" size="sm" :panel-surface="false" />
      <div class="knote-entry-fields">
        <Input id="page-entry-due" v-model="due" label="Fecha" placeholder="Hoy, 10 oct o AAAA-MM-DD" />
        <Input id="page-entry-tag" v-model="tag" label="Etiquetas" placeholder="Diseño, personal…" hint="Separa las etiquetas con comas." />
        <Select id="page-entry-priority" v-model="priority" label="Prioridad" :options="priorityOptions" size="sm" variant="surface" />
      </div>
    </div>
    <template #footer>
      <Button variant="soft" color="neutral" @click="isOpen = false">Cancelar</Button>
      <Button variant="glass" color="neutral" :prefix-icon="Check" @click="emit('save')">Guardar</Button>
    </template>
  </Modal>
</template>
