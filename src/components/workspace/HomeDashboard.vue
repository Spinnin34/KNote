<script setup lang="ts">
import type { Component } from 'vue';
import Badge from '@/components/ui/Badge.vue';
import Button from '@/components/ui/Button.vue';
import Card from '@/components/ui/Card.vue';
import Checkbox from '@/components/ui/Checkbox.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import Link from '@/components/ui/Link.vue';
import Progress from '@/components/ui/Progress.vue';
import Separator from '@/components/ui/Separator.vue';
import type { PageType, TodayTask, WorkspacePage } from '@/domain/workspace/types';
import { ArrowRight, ArrowUpRight, House, Plus, StickyNote } from '@lucide/vue';

const {
  dateLabel,
  greeting,
  homeTasksRemaining,
  pageCount,
  favoriteCount,
  todayDoneCount,
  todayTasks,
  recentPages,
  focusProject,
  projectCompletion,
  pageIcon,
  pageIconStyle,
  pageTypeLabel,
  formatRelative,
} = defineProps<{
  dateLabel: string;
  greeting: string;
  homeTasksRemaining: number;
  pageCount: number;
  favoriteCount: number;
  todayDoneCount: number;
  todayTasks: TodayTask[];
  recentPages: WorkspacePage[];
  focusProject: WorkspacePage | null;
  projectCompletion: number;
  pageIcon: (page: WorkspacePage) => Component;
  pageIconStyle: (page: WorkspacePage) => Record<string, string>;
  pageTypeLabel: (type: PageType) => string;
  formatRelative: (timestamp: number) => string;
}>();

const quickCapture = defineModel<string>('quickCapture', { required: true });
const emit = defineEmits<{
  'create-page': [];
  'select-page': [id: string];
  'capture-quick-note': [];
  'today-task-changed': [];
}>();

function openCreatePage(): void { emit('create-page'); }
function setActive(id: string): void { emit('select-page', id); }
function captureQuickNote(): void { emit('capture-quick-note'); }
function todayTaskChanged(): void { emit('today-task-changed'); }
</script>

<template>
  <header class="knote-page-heading knote-home-heading">
    <div class="knote-page-glyph"><Icon :icon="House" size="xl" :stroke-width="1.5" /></div>
    <h1>Mi espacio</h1>
    <p>Tu espacio personal <span>·</span> {{ dateLabel }}</p>
  </header>
  <div class="knote-home-dashboard">
    <section class="knote-section knote-home-welcome">
      <div class="knote-section-heading">
        <div><span class="knote-overline">{{ dateLabel }}</span><h2>{{ greeting }}, Ahmed.</h2></div>
        <Button variant="soft" color="neutral" size="sm" :prefix-icon="Plus" @click="openCreatePage()">Nueva página</Button>
      </div>
    </section>
    <Card variant="glass" padding="sm" class="knote-glass-surface knote-stats-card">
      <div class="knote-stat-line" aria-label="Resumen de tu espacio">
        <div><strong>{{ homeTasksRemaining }}</strong><span>pendientes hoy</span></div>
        <Separator orientation="vertical" decorative class="knote-stat-separator" />
        <div><strong>{{ pageCount }}</strong><span>páginas</span></div>
        <Separator orientation="vertical" decorative class="knote-stat-separator" />
        <div><strong>{{ favoriteCount }}</strong><span>favoritos</span></div>
      </div>
    </Card>
    <div class="knote-dashboard-grid">
      <div class="knote-dashboard-primary">
        <section class="knote-section">
          <div class="knote-section-heading knote-section-heading--compact">
            <div><span class="knote-overline">HOY</span><h2>Para tener presente</h2></div>
            <Badge variant="outline" color="secondary" size="sm">{{ todayDoneCount }}/{{ todayTasks.length }}</Badge>
          </div>
          <Card variant="glass" padding="sm" class="knote-glass-surface knote-list-card">
            <ul class="knote-today-list">
              <li v-for="task in todayTasks" :key="task.id">
                <Checkbox :id="'today-' + task.id" v-model="task.done" :label="task.title" size="sm" variant="surface" @update:model-value="todayTaskChanged" />
                <Badge variant="soft" color="secondary" size="sm">{{ task.group }}</Badge>
              </li>
            </ul>
          </Card>
        </section>
        <section class="knote-section">
          <div class="knote-section-heading knote-section-heading--compact">
            <div><span class="knote-overline">RETOMA EL HILO</span><h2>Recientes</h2></div>
            <Link href="#folder-programacion" variant="text" size="sm" :suffix-icon="ArrowRight" @click.prevent="setActive('folder-programacion')">Programación</Link>
          </div>
          <Card variant="glass" padding="sm" class="knote-glass-surface knote-list-card">
            <ul class="knote-recent-list">
              <li v-for="page in recentPages.slice(0, 5)" :key="page.id">
                <Link :href="'#' + page.id" variant="text" size="sm" :prefix-icon="pageIcon(page)" class="knote-page-link" :style="pageIconStyle(page)" @click.prevent="setActive(page.id)">{{ page.title || 'Sin título' }}</Link>
                <Badge variant="outline" color="secondary" size="sm">{{ pageTypeLabel(page.type) }}</Badge>
                <span class="knote-recent-time">{{ formatRelative(page.updatedAt) }}</span>
              </li>
            </ul>
          </Card>
        </section>
      </div>
      <div class="knote-dashboard-secondary">
        <section v-if="focusProject" class="knote-section knote-focus-section">
          <div class="knote-section-heading knote-section-heading--compact">
            <div><span class="knote-overline">EN MARCHA</span><h2>BiteCraft</h2></div>
            <Badge variant="soft" color="info" size="sm">{{ focusProject.entries.filter((entry) => entry.status !== 'Hecho').length }} abiertas</Badge>
          </div>
          <Card variant="glass" padding="md" class="knote-focus-card">
            <div class="knote-focus-topline"><span class="knote-focus-icon" :style="pageIconStyle(focusProject)"><Icon :icon="pageIcon(focusProject)" size="md" /></span><div><strong>Abyss Ideas</strong><small>Programación / BiteCraft</small></div><Badge variant="outline" color="secondary" size="sm">{{ projectCompletion }}%</Badge></div>
            <Progress label="Ideas completadas" :value="projectCompletion" :show-value="false" color="info" size="sm" class="knote-project-progress" />
            <div class="knote-focus-bottom"><span>Ideas del proyecto</span><Link href="#page-abyss-ideas" variant="text" size="sm" :suffix-icon="ArrowUpRight" @click.prevent="setActive(focusProject.id)">Abrir</Link></div>
          </Card>
        </section>
        <Card variant="glass" padding="sm" class="knote-quick-capture">
          <Icon :icon="StickyNote" size="md" />
          <Input id="quick-capture" v-model="quickCapture" label="Captura rápida" placeholder="Guardar una idea para después…" size="sm" variant="surface" @keydown.enter.prevent="captureQuickNote" />
          <Button variant="soft" color="neutral" size="sm" :prefix-icon="ArrowUpRight" aria-label="Guardar idea" title="Guardar idea" :disabled="!quickCapture.trim()" @click="captureQuickNote" />
        </Card>
      </div>
    </div>
  </div>
</template>
