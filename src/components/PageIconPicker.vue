<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, Palette, RotateCcw } from '@lucide/vue';
import Button from '@/components/ui/Button.vue';
import ColorPicker from '@/components/ui/ColorPicker.vue';
import Icon, { type IconComponent } from '@/components/ui/Icon.vue';
import Popup from '@/components/ui/Popup.vue';
import ScrollArea from '@/components/ui/ScrollArea.vue';

export interface PageIconOption { id: string; label: string; icon: IconComponent }

const props = defineProps<{
  id: string;
  label: string;
  icon: IconComponent;
  iconId?: string;
  options: readonly PageIconOption[];
  color?: string;
  subject?: 'página' | 'tarea';
}>();
const emit = defineEmits<{
  'update:iconId': [value: string | undefined];
  'update:color': [value: string];
}>();
const open = ref(false);
const activeOption = computed(() => props.options.find((option) => option.id === props.iconId));
const swatches = ['#cbd5e1', '#60a5fa', '#34d399', '#fbbf24', '#fb7185', '#c084fc', '#22d3ee', '#f97316'];

function choose(id: string | undefined, close: (restoreFocus?: boolean) => void): void {
  emit('update:iconId', id);
  close(false);
}
</script>

<template>
  <Popup :id="props.id" v-model="open" :label="props.label" side="bottom" align="start" size="lg" variant="surface" rounded="xl" shadow="lg" class="knote-icon-popup">
    <template #trigger>
      <Icon class="knote-icon-trigger" :icon="props.icon" size="xl" :stroke-width="1.7" :style="{ color: props.color || 'var(--balsa-role-accent)' }" />
      <span class="sr-only">{{ props.label }}</span>
    </template>
    <template #default="{ close }">
      <div class="knote-icon-picker-panel">
        <div class="knote-icon-picker-heading">
          <span class="knote-icon-picker-mark"><Icon :icon="Palette" size="sm" /></span>
          <div><strong>Personalizar icono</strong><small>{{ activeOption?.label || `Icono de ${props.subject || 'página'}` }}</small></div>
        </div>
        <ScrollArea label="Iconos disponibles" orientation="vertical" visibility="auto" size="thin" class="knote-icon-picker-scroll">
          <div class="knote-icon-picker-grid" role="group" aria-label="Iconos disponibles">
            <Button
              v-for="option in props.options"
              :key="option.id"
              variant="soft"
              color="neutral"
              size="md"
              shape="fab"
              :aria-label="option.label"
              :aria-pressed="props.iconId === option.id"
              :title="option.label"
              :class="{ 'knote-icon-option-selected': props.iconId === option.id }"
              :style="{ color: props.color || 'var(--balsa-role-accent)' }"
              @click="choose(option.id, close)"
            >
              <Icon :icon="option.icon" size="md" />
            </Button>
          </div>
        </ScrollArea>
        <div class="knote-icon-default-row">
          <span>Color del icono</span>
          <ColorPicker
            :id="`${props.id}-color`"
            :model-value="props.color || '#cbd5e1'"
            label="Elegir color"
            accessible-label="Cambiar color del icono"
            label-position="inside"
            size="md"
            variant="glass"
            rounded="lg"
            class="knote-icon-inline-color"
            @update:model-value="emit('update:color', $event)"
          />
        </div>
        <div class="knote-icon-swatches" role="group" aria-label="Colores sugeridos">
          <button
            v-for="swatch in swatches"
            :key="swatch"
            type="button"
            class="knote-color-swatch"
            :style="{ '--knote-swatch': swatch }"
            :aria-label="`Usar color ${swatch}`"
            :aria-pressed="props.color?.toLowerCase() === swatch"
            @click="emit('update:color', swatch)"
          ><Icon v-if="props.color?.toLowerCase() === swatch" :icon="Check" size="xs" /></button>
        </div>
        <div class="knote-icon-picker-footer">
          <Button variant="soft" color="neutral" size="sm" :prefix-icon="RotateCcw" @click="choose(undefined, close)">Icono del tipo</Button>
          <Button variant="soft" color="neutral" size="sm" :prefix-icon="Palette" :disabled="!props.color" @click="emit('update:color', '')">Color predeterminado</Button>
        </div>
      </div>
    </template>
  </Popup>
</template>
