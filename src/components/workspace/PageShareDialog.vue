<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { Copy, Link2, LockKeyhole, Globe2 } from '@lucide/vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import Modal from '@/components/ui/Modal.vue';
import type { WorkspacePage } from '@/domain/workspace/types';
import { fetchCloudShare, publishCloudPage, unpublishCloudPage } from '@/lib/cloud-workspace-api';

const props = defineProps<{
  modelValue: boolean;
  page: WorkspacePage | null;
  signedIn: boolean;
  cloudActive: boolean;
  saveState: 'saved' | 'saving' | 'pending' | 'conflict' | 'error';
}>();
const emit = defineEmits<{
  'update:modelValue': [value: boolean];
  signIn: [];
  notify: [title: string, description: string, color?: 'success' | 'info' | 'warning' | 'destructive'];
}>();

const published = ref(false);
const url = ref<string | null>(null);
const busy = ref(false);
const error = ref('');
const isDocument = computed(() => props.page?.type === 'doc');
const canPublish = computed(() => props.signedIn && props.cloudActive && isDocument.value && props.saveState === 'saved' && !busy.value);

async function refresh(): Promise<void> {
  const pageId = props.page?.id;
  if (!props.modelValue || !props.signedIn || !props.cloudActive || !pageId || !isDocument.value) {
    published.value = false;
    url.value = null;
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    const share = await fetchCloudShare(pageId);
    published.value = share.published;
    url.value = share.url;
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'No se pudo consultar el estado del enlace.';
  } finally { busy.value = false; }
}

watch(() => [props.modelValue, props.page?.id, props.signedIn, props.cloudActive] as const, () => { void refresh(); }, { immediate: true });

async function publish(): Promise<void> {
  const page = props.page;
  if (!page || !canPublish.value) return;
  busy.value = true;
  error.value = '';
  try {
    const result = await publishCloudPage(page.id);
    published.value = true;
    url.value = result.url;
    try {
      await navigator.clipboard.writeText(result.url);
      emit('notify', 'Documento publicado', 'El enlace se copió. Puedes volver a ponerlo en privado cuando quieras.');
    } catch {
      emit('notify', 'Documento publicado', 'El enlace ya está activo. Cópialo desde el campo que aparece aquí.', 'info');
    }
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'No se pudo publicar el documento.'; }
  finally { busy.value = false; }
}

async function copy(): Promise<void> {
  if (!url.value) return;
  try {
    await navigator.clipboard.writeText(url.value);
    emit('notify', 'Enlace copiado', 'Cualquiera que tenga este enlace podrá leer el documento.');
  } catch { error.value = 'No se pudo acceder al portapapeles. Selecciona y copia el enlace manualmente.'; }
}

async function unpublish(): Promise<void> {
  if (!props.page || busy.value) return;
  busy.value = true;
  error.value = '';
  try {
    await unpublishCloudPage(props.page.id);
    published.value = false;
    url.value = null;
    emit('notify', 'Documento privado', 'El enlace anterior ya no permite abrirlo.');
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'No se pudo poner en privado.'; }
  finally { busy.value = false; }
}
</script>

<template>
  <Modal
    id="page-share-dialog"
    :model-value="modelValue"
    title="Compartir documento"
    description="Los documentos son privados hasta que los publiques. El enlace no aparece en búsquedas y puedes revocarlo."
    variant="glass"
    size="md"
    close-label="Cerrar opciones de publicación"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <div class="knote-share-state">
      <Badge :color="signedIn && !cloudActive ? 'warning' : published ? 'success' : 'info'" variant="outline" size="sm">
        <Icon :icon="published ? Globe2 : LockKeyhole" size="xs" />
        {{ signedIn && !cloudActive ? 'SIN CONEXIÓN' : published ? 'PUBLICADO' : 'PRIVADO' }}
      </Badge>
      <strong>{{ page?.title || 'Sin título' }}</strong>
    </div>

    <p v-if="!signedIn" class="knote-cloud-dialog-note">Inicia sesión para sincronizar y publicar documentos. Tus cambios locales se conservan.</p>
    <p v-else-if="!cloudActive" class="knote-cloud-dialog-note">No se puede comprobar la publicación ni crear enlaces hasta recuperar la conexión con la nube. Tus cambios locales se conservan.</p>
    <p v-else-if="!isDocument" class="knote-cloud-dialog-note">Solo se pueden publicar documentos de texto. Esta página sigue siendo privada.</p>
    <p v-else-if="saveState !== 'saved' && !published" class="knote-cloud-dialog-note">Espera a que los cambios estén sincronizados antes de publicar.</p>

    <div v-if="published && url" class="knote-share-link">
      <span>Enlace público</span>
      <a :href="url" target="_blank" rel="noopener noreferrer">{{ url }}</a>
      <Button variant="soft" color="neutral" size="sm" :prefix-icon="Copy" :disabled="busy" @click="copy">Copiar enlace</Button>
    </div>
    <p v-if="error" class="knote-cloud-inline-error" role="alert">{{ error }}</p>

    <template #footer>
      <Button v-if="!signedIn" variant="solid" color="primary" :prefix-icon="Link2" @click="emit('signIn')">Iniciar sesión</Button>
      <Button v-else-if="published" variant="soft" color="destructive" :loading="busy" :disabled="busy" @click="unpublish">Poner en privado</Button>
      <Button v-else variant="solid" color="primary" :prefix-icon="Globe2" :loading="busy" :disabled="!canPublish" @click="publish">Publicar y copiar enlace</Button>
    </template>
  </Modal>
</template>
