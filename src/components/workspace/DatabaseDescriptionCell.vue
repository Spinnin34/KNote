<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import Button from '@/components/ui/Button.vue';
import Textarea from '@/components/ui/Textarea.vue';
import { replaceTaskDescription, taskDescription } from '@/components/block-editor/task-description';

const props = defineProps<{ id: string; title: string; content: string }>();
const emit = defineEmits<{ change: [content: string]; conflict: [] }>();
const editing = ref(false);
const draft = ref('');
const summary = computed(() => taskDescription(props.content));
let previous = '';

function start() {
  previous = summary.value;
  draft.value = previous;
  editing.value = true;
  void nextTick(() => document.getElementById(props.id)?.focus());
}

function finish(save: boolean, restoreFocus = false) {
  if (!editing.value) return;
  editing.value = false;
  if (save && draft.value.trim() !== previous) {
    const updated = replaceTaskDescription(props.content, previous, draft.value.trim());
    if (updated !== null) emit('change', updated);
    else emit('conflict');
  }
  if (restoreFocus) void nextTick(() => document.getElementById(props.id + '-trigger')?.focus());
}
</script>

<template>
  <Textarea v-if="editing" :id="id" v-model="draft" :label="'Descripción de ' + title" class="knote-description-edit"
    :rows="2" :maxlength="4000" resizable="none" variant="surface" size="sm"
    @blur="finish(true)" @keydown.enter.exact.prevent="finish(true, true)" @keydown.escape.stop.prevent="finish(false, true)" />
  <Button v-else :id="id + '-trigger'" class="knote-description-trigger" size="sm" variant="soft" color="neutral"
    :aria-label="'Editar descripción de ' + title" :title="summary || 'Editar descripción'" @click="start">
    <span v-if="summary">{{ summary }}</span><span v-else class="knote-cell-placeholder">Añadir descripción</span>
  </Button>
</template>
