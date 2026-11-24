<script setup lang="ts">
import Input from '@/components/ui/Input.vue';
import Checkbox from '@/components/ui/Checkbox.vue';
import type { DatabaseField, PageEntry } from '@/domain/workspace/types';

defineProps<{ id: string; field: DatabaseField; entry: PageEntry }>();
const emit = defineEmits<{ change: [value: string | number | boolean] }>();
</script>

<template>
  <Checkbox v-if="field.type === 'checkbox'" :id="id" :label="field.name" :model-value="entry.fields?.[field.id] === true" size="sm" variant="surface" @update:model-value="emit('change', $event)" />
  <Input v-else :id="id" :label="field.name" :type="field.type" :model-value="String(entry.fields?.[field.id] ?? '')" size="sm" variant="surface" @update:model-value="emit('change', $event)" />
</template>
