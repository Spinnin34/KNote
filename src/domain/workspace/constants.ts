import type { BoardStatus, CanvasWidth, DatabaseProperty, GlassStrength, ReadingDensity, TaskPriority, WorkspacePreferences } from '@/domain/workspace/types';
import { BookOpen, Sparkles } from '@lucide/vue';

export const BOARD_STATUSES: readonly BoardStatus[] = ['Por hacer', 'En curso', 'Hecho'];
export const TASK_PRIORITIES: readonly TaskPriority[] = ['Baja', 'Media', 'Alta', 'Urgente'];
export const PAGE_STORAGE_KEY = 'knote.workspace.v1';
export const TASK_STORAGE_KEY = 'knote.today.v1';
export const PREFERENCES_STORAGE_KEY = 'knote.preferences.v1';
export const DATABASE_VIEWS_STORAGE_KEY = 'knote.database-views.v1';
export const DEFAULT_DATABASE_PROPERTIES: DatabaseProperty[] = ['content', 'status', 'priority', 'due', 'tags'];
export const priorityOptions = [
  { label: 'Sin prioridad', value: 'Sin prioridad' },
  ...TASK_PRIORITIES.map((priority) => ({ label: priority, value: priority })),
];
export const statusOptions = BOARD_STATUSES.map((status) => ({ label: status, value: status }));
export const priorityCellOptions = priorityOptions;
export const defaultPreferences: WorkspacePreferences = { glass: 'balanced', width: 'standard', density: 'comfortable' };
export const preferenceTabs = [
  { id: 'appearance', label: 'Apariencia', icon: Sparkles },
  { id: 'reading', label: 'Lectura', icon: BookOpen },
];
export const glassOptions: { id: GlassStrength; label: string; description: string }[] = [
  { id: 'soft', label: 'Sutil', description: 'Menos desenfoque, más transparencia.' },
  { id: 'balanced', label: 'Equilibrado', description: 'Cristal visible con contenido nítido.' },
  { id: 'deep', label: 'Intenso', description: 'Más profundidad y desenfoque.' },
];
export const widthOptions: { id: CanvasWidth; label: string; description: string }[] = [
  { id: 'compact', label: 'Compacta', description: 'Lectura enfocada.' },
  { id: 'standard', label: 'Normal', description: 'Equilibrio entre texto y espacio.' },
  { id: 'wide', label: 'Amplia', description: 'Más espacio para tablas y tableros.' },
];
export const densityOptions: { id: ReadingDensity; label: string; description: string }[] = [
  { id: 'comfortable', label: 'Cómoda', description: 'Más aire entre filas.' },
  { id: 'compact', label: 'Compacta', description: 'Más contenido a la vista.' },
];
