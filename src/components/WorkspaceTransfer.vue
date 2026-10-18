<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from '@/components/ui/Button.vue';
import Input from '@/components/ui/Input.vue';
import Attachment from '@/components/ui/Attachment.vue';
import Modal from '@/components/ui/Modal.vue';
import type { WorkspaceSnapshot } from '@/lib/desktop-vault';
import { getBlockImage, listBlockImageIds } from '@/lib/block-images';
import {
  createEncryptedTransfer, MAX_TRANSFER_FILE_BYTES, readEncryptedTransfer, type PreparedWorkspaceTransfer,
} from '@/lib/workspace-transfer';

const props = defineProps<{ modelValue: boolean; snapshot: WorkspaceSnapshot }>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  import: [transfer: PreparedWorkspaceTransfer];
}>();

const transferMode = ref<'export' | 'import'>('export');
const exportPassword = ref('');
const exportPasswordConfirmation = ref('');
const importPassword = ref('');
const importFiles = ref<readonly File[]>([]);
const pendingTransfer = ref<PreparedWorkspaceTransfer | null>(null);
const errorMessage = ref('');
const working = ref(false);
const pageCount = computed(() => Array.isArray(props.snapshot.pages) ? props.snapshot.pages.length : 0);

function resetForm(): void {
  exportPassword.value = '';
  exportPasswordConfirmation.value = '';
  importPassword.value = '';
  importFiles.value = [];
  pendingTransfer.value = null;
  errorMessage.value = '';
  working.value = false;
}

watch(() => props.modelValue, (open) => { if (!open) resetForm(); });

function close(): void {
  emit('update:modelValue', false);
}

function downloadTransfer(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `KNote-transferencia-${new Date().toISOString().slice(0, 10)}.kntx`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportTransfer(): Promise<void> {
  errorMessage.value = '';
  if (exportPassword.value.length < 12) {
    errorMessage.value = 'Usa una contraseña de al menos 12 caracteres.';
    return;
  }
  if (exportPassword.value !== exportPasswordConfirmation.value) {
    errorMessage.value = 'Las contraseñas no coinciden.';
    return;
  }
  working.value = true;
  try {
    const assets = [];
    for (const id of await listBlockImageIds()) {
      const blob = await getBlockImage(id);
      if (blob) assets.push({ id, blob });
    }
    const file = await createEncryptedTransfer(props.snapshot, assets, exportPassword.value);
    downloadTransfer(file);
    resetForm();
    close();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo crear la transferencia.';
  } finally { working.value = false; }
}

async function reviewTransfer(): Promise<void> {
  errorMessage.value = '';
  pendingTransfer.value = null;
  const file = importFiles.value[0];
  if (!file) { errorMessage.value = 'Selecciona un archivo de transferencia.'; return; }
  if (!importPassword.value) { errorMessage.value = 'Escribe la contraseña de esta transferencia.'; return; }
  working.value = true;
  try { pendingTransfer.value = await readEncryptedTransfer(file, importPassword.value); }
  catch (error) { errorMessage.value = error instanceof Error ? error.message : 'No se pudo revisar la transferencia.'; }
  finally { working.value = false; }
}

function applyTransfer(): void {
  if (!pendingTransfer.value) return;
  emit('import', pendingTransfer.value);
  close();
}
</script>

<template>
  <Modal id="workspace-transfer" :model-value="modelValue" title="Copias cifradas" description="Crea una transferencia protegida para mover tus notas entre KNote web y Windows." presentation="dialog" variant="glass" size="lg" close-label="Cerrar copias" @update:model-value="emit('update:modelValue', $event)">
    <div class="knote-transfer">
      <div class="knote-transfer__switch" role="group" aria-label="Tipo de operación">
        <Button variant="soft" color="neutral" :aria-pressed="transferMode === 'export'" :class="{ 'knote-choice--selected': transferMode === 'export' }" @click="transferMode = 'export'; errorMessage = ''; pendingTransfer = null">Exportar</Button>
        <Button variant="soft" color="neutral" :aria-pressed="transferMode === 'import'" :class="{ 'knote-choice--selected': transferMode === 'import' }" @click="transferMode = 'import'; errorMessage = ''; pendingTransfer = null">Importar</Button>
      </div>

      <template v-if="transferMode === 'export'">
        <div class="knote-transfer__copy">
          <strong>Crear transferencia cifrada</strong>
          <p>Incluye {{ pageCount }} páginas, tareas, preferencias e imágenes. La contraseña protege el archivo y no se guarda en KNote.</p>
        </div>
        <Input id="transfer-export-password" v-model="exportPassword" label="Contraseña de la transferencia" type="password" autocomplete="new-password" hint="Usa al menos 12 caracteres y guárdala aparte." />
        <Input id="transfer-export-confirm" v-model="exportPasswordConfirmation" label="Repetir contraseña" type="password" autocomplete="new-password" />
        <Button :loading="working" :disabled="working" @click="exportTransfer">Crear archivo cifrado</Button>
      </template>

      <template v-else>
        <div class="knote-transfer__copy">
          <strong>Importar una transferencia</strong>
          <p>La revisión descifra el archivo en este dispositivo. Las notas actuales solo se reemplazan cuando confirmes la importación.</p>
        </div>
        <Attachment id="transfer-file" v-model="importFiles" label="Archivo de transferencia" accept=".kntx,application/vnd.knote.transfer+json" :max-size="MAX_TRANSFER_FILE_BYTES" :max-files="1" hint="El archivo debe terminar en .kntx y ocupar menos de 64 MB." />
        <Input id="transfer-import-password" v-model="importPassword" label="Contraseña de la transferencia" type="password" autocomplete="current-password" />
        <Button v-if="!pendingTransfer" :loading="working" :disabled="working" @click="reviewTransfer">Revisar archivo</Button>
        <div v-if="pendingTransfer" class="knote-transfer__review" role="status">
          <strong>Transferencia lista</strong>
          <p>{{ Array.isArray(pendingTransfer.snapshot.pages) ? pendingTransfer.snapshot.pages.length : 0 }} páginas y {{ pendingTransfer.assets.length }} imágenes.</p>
          <Button color="destructive" @click="applyTransfer">Reemplazar el espacio actual</Button>
        </div>
      </template>

      <p v-if="errorMessage" class="knote-transfer__error" role="alert">{{ errorMessage }}</p>
      <p class="knote-transfer__security">El archivo de transferencia está cifrado. La copia local de Windows se cifra por separado y se desbloquea con tu cuenta de Windows.</p>
    </div>
    <template #footer>
      <Button variant="glass" color="neutral" @click="close">Cerrar</Button>
    </template>
  </Modal>
</template>

<style scoped>
.knote-transfer { display: grid; gap: 16px; max-height: min(64vh, 620px); overflow-y: auto; padding: 2px; }
.knote-transfer__switch { display: flex; gap: 8px; }
.knote-transfer__copy { display: grid; gap: 5px; color: var(--balsa-color-surface-elevated-foreground); }
.knote-transfer__copy p, .knote-transfer__security, .knote-transfer__review p { margin: 0; color: var(--balsa-color-muted-foreground); font-size: 12px; line-height: 1.55; }
.knote-transfer__security { border-top: 1px solid var(--balsa-color-border); padding-top: 12px; }
.knote-transfer__review { display: grid; gap: 10px; border: 1px solid var(--balsa-color-border); border-radius: var(--balsa-radius-surface); padding: 14px; }
.knote-transfer__error { margin: 0; color: var(--balsa-color-destructive); font-size: 12px; }
</style>
