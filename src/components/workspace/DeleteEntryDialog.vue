<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import Modal from '@/components/ui/Modal.vue';
import { Trash2 } from '@lucide/vue';

defineProps<{ entryTitle: string }>();
const isOpen = defineModel<boolean>({ required: true });
const emit = defineEmits<{ delete: [] }>();
</script>

<template>
  <Modal id="delete-entry-dialog" v-model="isOpen" title="Eliminar tarea" :description="'Se eliminará ' + (entryTitle || 'esta tarea') + ' y todas sus subtareas.'" presentation="dialog" variant="surface" size="sm" close-label="Cancelar eliminación">
    <p class="knote-delete-entry-copy">Esta acción no se puede deshacer.</p>
    <template #footer="{ close }"><Button variant="soft" color="neutral" @click="close">Cancelar</Button><Button color="destructive" :prefix-icon="Trash2" @click="emit('delete')">Eliminar tarea</Button></template>
  </Modal>
</template>
