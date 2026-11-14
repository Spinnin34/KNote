<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import Modal from '@/components/ui/Modal.vue';
import type { CloudConflict } from '@/lib/cloud-workspace-api';

defineProps<{
  modelValue: boolean;
  conflict: CloudConflict | null;
  total: number;
  busy?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  choose: [choice: 'cloud' | 'local' | 'both'];
}>();

function versionTitle(value: unknown): string {
  if (!value || typeof value !== 'object') return 'Página eliminada';
  const title = (value as Record<string, unknown>).title;
  return typeof title === 'string' && title.trim() ? title : 'Sin título';
}
</script>

<template>
  <Modal
    id="cloud-conflict-dialog"
    :model-value="modelValue"
    title="Revisar cambios en conflicto"
    description="Se guardaron ambas versiones. Elige cuál usar o conserva las dos como páginas separadas."
    variant="glass"
    size="md"
    close-label="Revisar el conflicto más tarde"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <p v-if="conflict" class="knote-cloud-dialog-note">
      {{ conflict.kind === 'page' ? 'La página cambió en otro dispositivo.' : 'Las tareas o ajustes cambiaron en otro dispositivo.' }}
      <span v-if="total > 1">Hay {{ total }} conflictos pendientes.</span>
    </p>
    <div v-if="conflict?.kind === 'page'" class="knote-cloud-conflict-versions">
      <section><small>VERSIÓN EN LA NUBE</small><strong>{{ versionTitle(conflict.cloudVersion) }}</strong></section>
      <section><small>CAMBIO DE ESTE DISPOSITIVO</small><strong>{{ versionTitle(conflict.localVersion) }}</strong></section>
    </div>
    <template #footer>
      <template v-if="conflict">
        <Button variant="outline" color="neutral" :disabled="busy" @click="emit('choose', 'cloud')">Usar nube</Button>
        <Button variant="soft" color="neutral" :loading="busy" :disabled="busy" @click="emit('choose', 'local')">Usar este cambio</Button>
        <Button variant="solid" color="primary" :disabled="busy" @click="emit('choose', 'both')">Conservar ambas</Button>
      </template>
    </template>
  </Modal>
</template>
