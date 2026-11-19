<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { Copy, Link2, LockKeyhole, Globe2, RotateCw } from '@lucide/vue';
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

const share = ref<{ published: boolean; url: string | null } | null>(null);
const published = computed(() => share.value?.published === true);
const url = computed(() => share.value?.url ?? null);
const busy = ref(false);
const error = ref('');
const isDocument = computed(() => props.page?.type === 'doc');
const canReadShare = computed(() => props.modelValue && props.signedIn && props.cloudActive && isDocument.value);
const canPublish = computed(() => canReadShare.value && share.value?.published === false && props.saveState === 'saved' && !busy.value);
const status = computed(() => {
  if (!props.cloudActive) return 'Nube no disponible';
  if (share.value) return published.value ? 'Publicado' : 'Privado';
  return busy.value ? 'Consultando…' : 'Sin comprobar';
});
let requestVersion = 0;

async function refresh(): Promise<void> {
  const version = ++requestVersion;
  const pageId = props.page?.id;
  share.value = null;
  error.value = '';
  busy.value = Boolean(pageId && canReadShare.value);
  if (!pageId || !canReadShare.value) return;
  try {
    const result = await fetchCloudShare(pageId);
    if (version === requestVersion) share.value = result;
  } catch (cause) {
    if (version === requestVersion) error.value = cause instanceof Error ? cause.message : 'No se pudo consultar el estado del enlace.';
  } finally {
    if (version === requestVersion) busy.value = false;
  }
}

watch(() => [props.modelValue, props.page?.id, props.signedIn, props.cloudActive] as const, () => { void refresh(); }, { immediate: true });
onBeforeUnmount(() => { requestVersion += 1; });

async function publish(): Promise<void> {
  const page = props.page;
  if (!page || !canPublish.value) return;
  const version = ++requestVersion;
  busy.value = true;
  error.value = '';
  try {
    const result = await publishCloudPage(page.id);
    if (version !== requestVersion) return;
    share.value = result;
    try {
      await navigator.clipboard.writeText(result.url);
      if (version === requestVersion) emit('notify', 'Documento publicado', 'El enlace se copió. Puedes volver a ponerlo en privado cuando quieras.');
    } catch {
      if (version === requestVersion) emit('notify', 'Documento publicado', 'El enlace ya está activo. Cópialo desde el campo que aparece aquí.', 'info');
    }
  } catch (cause) {
    if (version === requestVersion) {
      share.value = null;
      error.value = cause instanceof Error ? cause.message : 'No se pudo publicar el documento.';
    }
  } finally {
    if (version === requestVersion) busy.value = false;
  }
}

async function copy(): Promise<void> {
  if (!url.value || !canReadShare.value) return;
  const version = requestVersion;
  try {
    await navigator.clipboard.writeText(url.value);
    if (version === requestVersion) emit('notify', 'Enlace copiado', 'Cualquiera que tenga este enlace podrá leer el documento.');
  } catch {
    if (version === requestVersion) error.value = 'No se pudo acceder al portapapeles. Selecciona y copia el enlace manualmente.';
  }
}

async function unpublish(): Promise<void> {
  if (!props.page || !canReadShare.value || !published.value || busy.value) return;
  const version = ++requestVersion;
  busy.value = true;
  error.value = '';
  try {
    await unpublishCloudPage(props.page.id);
    if (version !== requestVersion) return;
    share.value = { published: false, url: null };
    emit('notify', 'Documento privado', 'El enlace anterior ya no permite abrirlo.');
  } catch (cause) {
    if (version === requestVersion) {
      share.value = null;
      error.value = cause instanceof Error ? cause.message : 'No se pudo poner en privado.';
    }
  } finally {
    if (version === requestVersion) busy.value = false;
  }
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
      <Badge v-if="signedIn && isDocument" :color="!cloudActive || !share ? 'warning' : published ? 'success' : 'info'" variant="outline" size="sm">
        <Icon v-if="share" :icon="published ? Globe2 : LockKeyhole" size="xs" />
        {{ status }}
      </Badge>
      <strong>{{ page?.title || 'Sin título' }}</strong>
    </div>

    <p v-if="!signedIn" class="knote-cloud-dialog-note">Inicia sesión para sincronizar y publicar documentos. Tus cambios locales se conservan.</p>
    <p v-else-if="!cloudActive" class="knote-cloud-dialog-note">No se puede comprobar la publicación ni crear enlaces hasta recuperar la conexión con la nube. Tus cambios locales se conservan.</p>
    <p v-else-if="!isDocument" class="knote-cloud-dialog-note">Solo se pueden publicar documentos de texto. Esta página sigue siendo privada.</p>
    <p v-else-if="saveState !== 'saved' && share && !published" class="knote-cloud-dialog-note">Espera a que los cambios estén sincronizados antes de publicar.</p>

    <div v-if="published && url" class="knote-share-link">
      <span>Enlace público</span>
      <a :href="url" target="_blank" rel="noopener noreferrer">{{ url }}</a>
      <Button variant="soft" color="neutral" size="sm" :prefix-icon="Copy" :disabled="busy" @click="copy">Copiar enlace</Button>
    </div>
    <p v-if="error" class="knote-cloud-inline-error" role="alert">{{ error }}</p>

    <template #footer>
      <Button v-if="!signedIn" variant="solid" color="primary" :prefix-icon="Link2" @click="emit('signIn')">Iniciar sesión</Button>
      <Button v-else-if="canReadShare && !share && error" variant="soft" color="neutral" :prefix-icon="RotateCw" @click="refresh">Volver a comprobar</Button>
      <Button v-else-if="published" variant="soft" color="destructive" :loading="busy" :disabled="busy" @click="unpublish">Poner en privado</Button>
      <Button v-else variant="solid" color="primary" :prefix-icon="Globe2" :loading="busy" :disabled="!canPublish" @click="publish">Publicar y copiar enlace</Button>
    </template>
  </Modal>
</template>
