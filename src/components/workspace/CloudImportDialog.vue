<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import Modal from '@/components/ui/Modal.vue';

defineProps<{
  modelValue: boolean;
  preview: { localPages: number; cloudPages: number; localTasks: number; cloudTasks: number } | null;
  busy?: boolean;
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  choose: [choice: 'merge' | 'cloud'];
}>();
</script>

<template>
  <Modal
    id="cloud-import-dialog"
    :model-value="modelValue"
    title="Elige qué espacio usar"
    description="Encontramos datos en este dispositivo y en tu cuenta. La copia local se conservará aunque uses la nube."
    variant="glass"
    size="md"
    close-label="Usar el espacio de la nube"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div v-if="preview" class="knote-cloud-import-counts" aria-label="Resumen de datos encontrados">
      <section><strong>Este dispositivo</strong><span>{{ preview.localPages }} páginas · {{ preview.localTasks }} tareas</span></section>
      <section><strong>Tu cuenta</strong><span>{{ preview.cloudPages }} páginas · {{ preview.cloudTasks }} tareas</span></section>
    </div>
    <p class="knote-cloud-dialog-note">Al fusionar, se añaden los elementos locales que no están en la cuenta. Los cambios que coincidan se conservarán para que puedas revisarlos.</p>
    <template #footer>
      <Button variant="outline" color="neutral" :disabled="busy" @click="emit('choose', 'cloud')">Usar la nube</Button>
      <Button variant="solid" color="primary" :loading="busy" :disabled="busy" @click="emit('choose', 'merge')">Fusionar espacios</Button>
    </template>
  </Modal>
</template>
