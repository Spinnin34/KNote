<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { BookOpen, Check, ChevronRight, Code2, Copy, ExternalLink, Play } from '@lucide/vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Drawer from '@/components/ui/Drawer.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import ScrollArea from '@/components/ui/ScrollArea.vue';
import { pythonGuideTopics } from '@/domain/python/python-guide';

const open = defineModel<boolean>({ required: true });
const { pageId } = defineProps<{ pageId: string }>();
const emit = defineEmits<{ 'insert-example': [code: string] }>();

const topics = pythonGuideTopics;
const categories = ['Todo', ...new Set(topics.map((topic) => topic.category))];
const query = ref('');
const category = ref('Todo');
const selectedId = ref('if');
const copied = ref(false);
let copiedTimer = 0;

const visibleTopics = computed(() => {
  const normalized = query.value.trim().toLocaleLowerCase('es');
  return topics.filter((topic) => {
    if (category.value !== 'Todo' && topic.category !== category.value) return false;
    if (!normalized) return true;
    return [topic.title, topic.summary, topic.when, topic.tip, ...topic.keywords, topic.code]
      .join(' ').toLocaleLowerCase('es').includes(normalized);
  });
});
const selectedTopic = computed(() => visibleTopics.value.find((topic) => topic.id === selectedId.value) ?? visibleTopics.value[0] ?? null);

watch(open, (isOpen) => {
  if (!isOpen) return;
  copied.value = false;
});

function copyExample(): void {
  if (!selectedTopic.value) return;
  void navigator.clipboard?.writeText(selectedTopic.value.code).then(() => {
    copied.value = true;
    window.clearTimeout(copiedTimer);
    copiedTimer = window.setTimeout(() => { copied.value = false; }, 1500);
  }).catch(() => { copied.value = false; });
}

function insertExample(): void {
  if (!selectedTopic.value) return;
  emit('insert-example', selectedTopic.value.code);
  open.value = false;
}

onBeforeUnmount(() => window.clearTimeout(copiedTimer));
</script>

<template>
  <Drawer
    :id="`python-guide-${pageId}`"
    v-model="open"
    title="Guía rápida de Python"
    description="Referencia práctica para seguir programando."
    side="right"
    size="lg"
    class="w-[min(56rem,calc(100vw-1rem))]"
    :show-handle="false"
    close-label="Cerrar guía de Python"
  >
    <div class="knote-python-guide">
      <div class="knote-python-guide-toolbar">
        <div class="knote-python-guide-search">
          <Input
            :id="`python-guide-search-${pageId}`"
            v-model="query"
            label="Buscar una función o tema"
            placeholder="Prueba: if, len, lista, try…"
            size="sm"
            variant="surface"
          />
          <span class="knote-python-guide-result-count" aria-live="polite">{{ visibleTopics.length }} {{ visibleTopics.length === 1 ? 'tema' : 'temas' }}</span>
        </div>
        <div class="knote-python-guide-categories" role="group" aria-label="Filtrar por categoría">
          <Button
            v-for="item in categories"
            :key="item"
            variant="soft"
            :color="category === item ? 'primary' : 'neutral'"
            size="sm"
            :aria-pressed="category === item"
            @click="category = item"
          >{{ item }}</Button>
        </div>
      </div>

      <div class="knote-python-guide-layout">
        <ScrollArea
          label="Lista de referencias de Python"
          visibility="hover"
          size="thin"
          edge-fade
          class="knote-python-guide-pane"
        >
          <nav class="knote-python-guide-topics" aria-label="Temas de Python">
            <p class="knote-python-guide-section-label">REFERENCIA</p>
            <Button
              v-for="topic in visibleTopics"
              :key="topic.id"
              variant="soft"
              :color="selectedTopic?.id === topic.id ? 'primary' : 'neutral'"
              size="sm"
              class="knote-python-guide-topic"
              :aria-pressed="selectedTopic?.id === topic.id"
              @click="selectedId = topic.id; copied = false"
            >
              <span class="knote-python-guide-topic-copy">
                <strong>{{ topic.navTitle }}</strong>
                <small>{{ topic.category }}</small>
              </span>
              <Icon :icon="ChevronRight" size="xs" class="knote-python-guide-topic-arrow" />
            </Button>
            <p v-if="visibleTopics.length === 0" class="knote-python-guide-empty">No encuentro ese tema. Prueba con otra palabra.</p>
          </nav>
        </ScrollArea>

        <ScrollArea
          label="Explicación y ejemplo del tema seleccionado"
          visibility="hover"
          size="thin"
          edge-fade
          class="knote-python-guide-pane"
        >
          <article v-if="selectedTopic" class="knote-python-guide-detail" aria-live="polite">
            <header class="knote-python-guide-detail-head">
              <Badge variant="soft" color="secondary" size="sm">{{ selectedTopic.category }}</Badge>
              <h2>{{ selectedTopic.title }}</h2>
              <p>{{ selectedTopic.summary }}</p>
            </header>
            <div class="knote-python-guide-when">
              <span>CUÁNDO USARLO</span>
              <p>{{ selectedTopic.when }}</p>
            </div>
            <div class="knote-python-guide-tip">
              <span>CONSEJO PRÁCTICO</span>
              <p>{{ selectedTopic.tip }}</p>
            </div>
            <div class="knote-python-guide-code-card">
              <div class="knote-python-guide-code-head">
                <span><Icon :icon="Code2" size="xs" /> EJEMPLO <i /> PYTHON</span>
                <Button variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="copied ? Check : Copy" :aria-label="copied ? 'Código copiado' : 'Copiar ejemplo'" :title="copied ? 'Copiado' : 'Copiar ejemplo'" @click="copyExample" />
              </div>
              <pre><code>{{ selectedTopic.code }}</code></pre>
            </div>
            <div class="knote-python-guide-actions">
              <Button variant="solid" color="primary" size="sm" :prefix-icon="Play" @click="insertExample">Insertar en el editor</Button>
              <a class="knote-python-guide-source" :href="selectedTopic.source" target="_blank" rel="noreferrer">
                Ver documentación oficial <Icon :icon="ExternalLink" size="xs" />
              </a>
            </div>
          </article>
          <div v-else class="knote-python-guide-empty-detail">
            <Icon :icon="BookOpen" size="md" />
            <strong>No hay resultados</strong>
            <span>Prueba con otro término o cambia de categoría.</span>
          </div>
        </ScrollArea>
      </div>
    </div>
  </Drawer>
</template>

<style scoped>
.knote-python-guide { display: flex; min-height: 0; height: 100%; flex-direction: column; gap: .85rem; }
.knote-python-guide-toolbar { display: grid; flex: 0 0 auto; gap: .65rem; padding-bottom: .9rem; border-bottom: 1px solid var(--balsa-role-border); }
.knote-python-guide-search { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: end; gap: .7rem; }
.knote-python-guide-result-count { padding: 0 0 .55rem; color: var(--balsa-role-secondary); font-size: .7rem; white-space: nowrap; }
.knote-python-guide-categories { display: flex; flex-wrap: wrap; gap: .35rem; }
.knote-python-guide-layout { display: grid; flex: 1 1 auto; grid-template-columns: minmax(12rem, .72fr) minmax(0, 1.7fr); gap: 1.1rem; min-height: 0; }
.knote-python-guide-pane { height: 100%; min-height: 0; border: 0; border-radius: 0; background: transparent; }
.knote-python-guide-topics { display: grid; align-content: start; gap: .35rem; padding: .1rem .55rem .8rem 0; }
.knote-python-guide-section-label { margin: .1rem 0 .25rem; color: var(--balsa-role-secondary); font-size: .62rem; font-weight: 700; letter-spacing: .1em; }
.knote-python-guide-topic { display: grid; width: 100%; min-height: 2.75rem; height: auto; grid-template-columns: minmax(0, 1fr) auto; align-items: center; justify-content: stretch; gap: .35rem; padding: .42rem .55rem; border-radius: .65rem; text-align: left; white-space: normal; }
.knote-python-guide-topic[aria-pressed="true"] { border: 1px solid color-mix(in oklab, var(--balsa-role-accent) 54%, var(--balsa-role-border)); background: color-mix(in oklab, var(--balsa-role-accent) 10%, var(--balsa-role-surface)); box-shadow: none; }
.knote-python-guide-topic-copy { display: grid; justify-items: start; gap: .12rem; min-width: 0; line-height: 1.2; }
.knote-python-guide-topic-copy strong { color: var(--balsa-role-foreground); font-size: .72rem; font-weight: 600; }
.knote-python-guide-topic[aria-pressed="true"] .knote-python-guide-topic-copy strong { color: var(--balsa-role-accent); }
.knote-python-guide-topic-copy small { color: var(--balsa-role-secondary); font-size: .61rem; }
.knote-python-guide-topic-arrow { color: var(--balsa-role-secondary); opacity: .6; }
.knote-python-guide-detail { min-width: 0; display: grid; align-content: start; gap: .9rem; padding: .2rem .55rem .9rem .15rem; }
.knote-python-guide-detail-head { display: grid; justify-items: start; gap: .65rem; }
.knote-python-guide-detail-head h2 { margin: .1rem 0 0; color: var(--balsa-role-foreground); font-size: clamp(1.25rem, 2vw, 1.65rem); font-weight: 680; letter-spacing: -.035em; line-height: 1.15; }
.knote-python-guide-detail-head p { max-width: 42rem; margin: 0; color: var(--balsa-role-secondary); font-size: .86rem; line-height: 1.6; }
.knote-python-guide-when { display: grid; gap: .3rem; padding: .6rem .75rem; border-left: 2px solid var(--balsa-role-accent); background: color-mix(in oklab, var(--balsa-role-accent) 6%, var(--balsa-role-surface)); border-radius: 0 .55rem .55rem 0; }
.knote-python-guide-when > span { color: var(--balsa-role-accent); font-size: .59rem; font-weight: 750; letter-spacing: .09em; }
.knote-python-guide-when p { margin: 0; color: var(--balsa-role-foreground); font-size: .78rem; line-height: 1.45; }
.knote-python-guide-tip { display: grid; gap: .3rem; padding: .6rem .75rem; border: 1px solid var(--balsa-role-border); border-radius: .6rem; background: color-mix(in oklab, var(--balsa-role-surface) 76%, transparent); }
.knote-python-guide-tip > span { color: var(--balsa-role-secondary); font-size: .59rem; font-weight: 750; letter-spacing: .09em; }
.knote-python-guide-tip p { margin: 0; color: var(--balsa-role-foreground); font-size: .78rem; line-height: 1.45; }
.knote-python-guide-code-card { overflow: hidden; border: 1px solid color-mix(in oklab, var(--balsa-role-border) 82%, transparent); border-radius: .8rem; background: var(--knote-code-editor-surface); box-shadow: 0 10px 26px color-mix(in oklab, var(--balsa-role-background) 20%, transparent); }
.knote-python-guide-code-head { display: flex; min-height: 2.25rem; align-items: center; justify-content: space-between; gap: .5rem; padding: .25rem .55rem .25rem .75rem; border-bottom: 1px solid var(--balsa-role-border); background: color-mix(in oklab, var(--balsa-role-surface) 72%, var(--knote-code-editor-surface)); }
.knote-python-guide-code-head > span { display: inline-flex; align-items: center; gap: .4rem; color: var(--balsa-role-secondary); font-size: .59rem; font-weight: 700; letter-spacing: .08em; }
.knote-python-guide-code-head i { width: 3px; height: 3px; border-radius: 50%; background: var(--balsa-role-border); }
.knote-python-guide-code-card pre { max-width: 100%; overflow-x: auto; margin: 0; padding: .85rem .9rem 1rem; color: var(--balsa-role-code-foreground); font: .76rem/1.7 var(--balsa-font-mono, Consolas, monospace); tab-size: 4; }
.knote-python-guide-code-card code { white-space: pre; }
.knote-python-guide-actions { display: flex; flex-wrap: wrap; align-items: center; gap: .65rem; }
.knote-python-guide-source { display: inline-flex; align-items: center; gap: .35rem; color: var(--balsa-role-secondary); font-size: .72rem; text-decoration: none; transition: color 140ms ease; }
.knote-python-guide-source:hover { color: var(--balsa-role-foreground); text-decoration: underline; text-underline-offset: .16rem; }
.knote-python-guide-empty { margin: .4rem .2rem; color: var(--balsa-role-secondary); font-size: .77rem; line-height: 1.45; }
.knote-python-guide-empty-detail { display: grid; min-height: 100%; align-content: center; justify-items: center; gap: .55rem; color: var(--balsa-role-secondary); text-align: center; }
.knote-python-guide-empty-detail strong { color: var(--balsa-role-foreground); font-size: .95rem; }
.knote-python-guide-empty-detail span { max-width: 15rem; font-size: .76rem; line-height: 1.5; }
@media (max-width: 760px) {
  .knote-python-guide { gap: .7rem; }
  .knote-python-guide-layout { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(7.5rem, min(13rem, 26vh)) minmax(0, 1fr); gap: .7rem; }
  .knote-python-guide-topics { grid-template-columns: repeat(2, minmax(0, 1fr)); padding: .1rem .45rem .6rem 0; }
  .knote-python-guide-section-label { grid-column: 1 / -1; }
  .knote-python-guide-topic { min-height: 2.6rem; }
  .knote-python-guide-detail { gap: .7rem; padding-left: 0; }
  .knote-python-guide-detail-head { gap: .5rem; }
  .knote-python-guide-detail-head h2 { font-size: 1.3rem; }
  .knote-python-guide-detail-head p { font-size: .8rem; }
}
@media (max-width: 400px) {
  .knote-python-guide-search { grid-template-columns: minmax(0, 1fr); gap: .35rem; }
  .knote-python-guide-result-count { justify-self: end; padding: 0; }
  .knote-python-guide-categories { gap: .25rem; }
  .knote-python-guide-topic { padding-inline: .4rem; }
  .knote-python-guide-topic-copy strong { font-size: .67rem; }
  .knote-python-guide-actions { align-items: stretch; }
}
@media (max-height: 600px) and (max-width: 760px) {
  .knote-python-guide-layout { grid-template-rows: minmax(6rem, 22vh) minmax(0, 1fr); }
}
@media (prefers-reduced-motion: reduce) {
  .knote-python-guide-source { transition: none; }
}
</style>
