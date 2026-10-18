<script setup lang="ts">
import Button from '@/components/ui/Button.vue';
import Modal from '@/components/ui/Modal.vue';
import Tabs from '@/components/ui/Tabs.vue';
import { densityOptions, glassOptions, preferenceTabs, widthOptions } from '@/domain/workspace/constants';
import type { WorkspacePreferences } from '@/domain/workspace/types';
import type { CanvasWidth, GlassStrength, ReadingDensity } from '@/domain/workspace/types';
import { LockKeyhole } from '@lucide/vue';

defineProps<{ preferences: WorkspacePreferences }>();
const isOpen = defineModel<boolean>({ required: true });
const activeTab = defineModel<string>('activeTab', { required: true });
const emit = defineEmits<{
  'set-preference': [key: 'glass', value: GlassStrength];
  'set-width': [value: CanvasWidth];
  'set-density': [value: ReadingDensity];
  reset: [];
  'open-transfer': [];
}>();

function setPreference(key: 'glass', value: GlassStrength): void { emit('set-preference', key, value); }
function setWidth(value: CanvasWidth): void { emit('set-width', value); }
function setDensity(value: ReadingDensity): void { emit('set-density', value); }
</script>

<template>
  <Modal id="workspace-preferences" v-model="isOpen" title="Personalizar tu espacio" description="Ajusta el cristal, el ancho de lectura y la densidad. Tus preferencias se guardan en este dispositivo." presentation="dialog" variant="glass" size="lg" close-label="Cerrar personalización">
    <Tabs id="workspace-preference-tabs" v-model="activeTab" :items="preferenceTabs" label="Ajustes de apariencia y lectura" type="underline" variant="glass" size="sm" :panel-surface="false" class="knote-settings-tabs">
      <template #appearance>
        <div class="knote-settings-content">
          <section class="knote-setting-section">
            <div><h3>Intensidad del cristal</h3><p>Controla la transparencia y el desenfoque de las superficies.</p></div>
            <div class="knote-setting-choices" role="group" aria-label="Intensidad del cristal">
              <Button v-for="option in glassOptions" :key="option.id" variant="soft" color="neutral" size="sm" :aria-pressed="preferences.glass === option.id" :class="{ 'knote-choice--selected': preferences.glass === option.id }" @click="setPreference('glass', option.id)">{{ option.label }}</Button>
            </div>
            <p class="knote-setting-hint">{{ glassOptions.find((option) => option.id === preferences.glass)?.description }}</p>
          </section>
          <div class="knote-glass-demo" aria-label="Vista previa de las superficies de vidrio"><span>VISTA PREVIA</span><strong>Un espacio con profundidad</strong><small>La paleta Karmancos se mantiene intacta.</small></div>
        </div>
      </template>
      <template #reading>
        <div class="knote-settings-content">
          <section class="knote-setting-section">
            <div><h3>Ancho de lectura</h3><p>Adapta el lienzo al tipo de páginas que usas.</p></div>
            <div class="knote-setting-choices" role="group" aria-label="Ancho de lectura">
              <Button v-for="option in widthOptions" :key="option.id" variant="soft" color="neutral" size="sm" :aria-pressed="preferences.width === option.id" :class="{ 'knote-choice--selected': preferences.width === option.id }" @click="setWidth(option.id)">{{ option.label }}</Button>
            </div>
            <p class="knote-setting-hint">{{ widthOptions.find((option) => option.id === preferences.width)?.description }}</p>
          </section>
          <section class="knote-setting-section">
            <div><h3>Densidad de listas</h3><p>Elige cuánto espacio hay entre filas y tareas.</p></div>
            <div class="knote-setting-choices" role="group" aria-label="Densidad de listas">
              <Button v-for="option in densityOptions" :key="option.id" variant="soft" color="neutral" size="sm" :aria-pressed="preferences.density === option.id" :class="{ 'knote-choice--selected': preferences.density === option.id }" @click="setDensity(option.id)">{{ option.label }}</Button>
            </div>
            <p class="knote-setting-hint">{{ densityOptions.find((option) => option.id === preferences.density)?.description }}</p>
          </section>
        </div>
      </template>
    </Tabs>
    <section class="knote-setting-section knote-setting-section--transfer">
      <div><h3>Copias y migración</h3><p>Exporta o importa una transferencia cifrada para mover tus notas entre KNote web y Windows.</p></div>
      <Button variant="soft" color="neutral" :prefix-icon="LockKeyhole" @click="emit('open-transfer')">Copias cifradas</Button>
    </section>
    <template #footer>
      <Button variant="soft" color="neutral" @click="emit('reset')">Restablecer</Button>
      <Button variant="glass" color="neutral" @click="isOpen = false">Listo</Button>
    </template>
  </Modal>
</template>
