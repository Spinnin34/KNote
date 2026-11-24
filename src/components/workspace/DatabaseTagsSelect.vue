<script setup lang="ts">
import { computed } from 'vue';
import Select from '@/components/ui/Select.vue';
import { databaseTagSelection } from '@/domain/workspace/database-tags';

const props = defineProps<{ id: string; label: string; tags: readonly string[]; options: readonly string[] }>();
const emit = defineEmits<{ change: [tags: string[]] }>();
const items = computed(() => props.options.map((tag) => ({
  value: tag, label: tag, disabled: props.tags.length >= 12 && !props.tags.includes(tag),
})));
</script>

<template>
  <Select :id="id" :label="label" :options="items" :model-value="tags" multiple size="sm" variant="soft" rounded="md"
    placeholder="Sin etiquetas" class="knote-tag-select" @update:model-value="(value) => emit('change', databaseTagSelection(value))">
    <template #selected>
      <span v-if="tags.length" class="knote-tag-selection">
        <span v-for="tag in tags.slice(0, 2)" :key="tag" class="knote-tag-chip">{{ tag }}</span>
        <small v-if="tags.length > 2">+{{ tags.length - 2 }}</small>
      </span>
      <span v-else class="knote-cell-placeholder">Sin etiquetas</span>
    </template>
    <template #option="{ option }"><span class="knote-tag-chip">{{ option.label }}</span></template>
  </Select>
</template>
