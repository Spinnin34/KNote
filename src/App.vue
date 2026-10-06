<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  Activity, AlignLeft, AlarmClock, Archive, ArrowRight, ArrowUpDown, ArrowUpRight, Atom, Award, Bell, BookMarked, BookOpen, Bot, BriefcaseBusiness, Building2, CalendarDays, Camera, ChartNoAxesCombined, Check, CheckCheck, ChefHat,
  ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleDashed, CircleDot, CircleHelp, ClipboardList, Cloud, Code2, Coffee, Compass, Cpu, Crown,
  Database, Diamond, Dumbbell, Earth, Eye, FileCode, FileImage, FileText, Fingerprint, Flag, Flame, FlaskConical, Folder, FolderOpen, Gamepad2, Gauge, Gem, GitBranch, Globe, Hammer, Handshake, HardDrive, Headphones, Heart, History, House, Inbox, KeyRound, Laptop, Layers, Leaf, LifeBuoy, Link2, LockKeyhole, Mail, Map, MapPin, Medal, Mic, Monitor, Moon, Mountain,
  LayoutDashboard, Lightbulb, ListTodo, Link as LinkIcon, Menu, MessageCircle,
  MoreHorizontal, Music2, Network, Newspaper, NotebookPen, Package, Paintbrush, Palette, Pencil, PenTool, Plane, Plug, Plus, Puzzle, Radio, Rocket, Scale, Scissors, Search, Send, Server, Settings, Settings2, ShieldCheck, ShoppingBag, SlidersHorizontal, Smartphone, Smile, Sparkles, Sprout, Star, StickyNote, Sun, Sword,
  Share2, Table2, Tag, Target, Terminal, Ticket, Timer, Trash2, Trees, Trophy, UserRound, UsersRound, Video, Wallet, Waves, Workflow, Wrench, Zap, Filter, X,
} from '@lucide/vue';
import Badge from '@/components/ui/Badge.vue';
import Breadcrumb from '@/components/ui/Breadcrumb.vue';
import Button from '@/components/ui/Button.vue';
import Calendar from '@/components/ui/Calendar.vue';
import Card from '@/components/ui/Card.vue';
import Checkbox from '@/components/ui/Checkbox.vue';
import CommandMenu from '@/components/ui/CommandMenu.vue';
import DropdownMenu from '@/components/ui/DropdownMenu.vue';
import DatePicker from '@/components/ui/DatePicker.vue';
import Icon from '@/components/ui/Icon.vue';
import Input from '@/components/ui/Input.vue';
import Link from '@/components/ui/Link.vue';
import Modal from '@/components/ui/Modal.vue';
import Progress from '@/components/ui/Progress.vue';
import Select from '@/components/ui/Select.vue';
import Separator from '@/components/ui/Separator.vue';
import Sidebar from '@/components/ui/Sidebar.vue';
import Table from '@/components/ui/Table.vue';
import Tabs from '@/components/ui/Tabs.vue';
import ToastViewport, { type ToastItem } from '@/components/ui/ToastViewport.vue';
import Attachment from '@/components/ui/Attachment.vue';
import BlockEditor from '@/components/BlockEditor.vue';
import PageIconPicker from '@/components/PageIconPicker.vue';
import type { CalendarModelValue } from '@/components/ui/Calendar.vue';
import type { MenuItem, MenuSelection } from '@/components/ui/menu';
import type { SidebarGroup } from '@/components/ui/Sidebar.vue';

type PageType = 'folder' | 'doc' | 'board' | 'database' | 'calendar' | 'tasks';
type BoardStatus = 'Por hacer' | 'En curso' | 'Hecho';
type TaskPriority = 'Baja' | 'Media' | 'Alta' | 'Urgente';
type DatabaseProperty = 'content' | 'status' | 'priority' | 'due' | 'tags';
type DatabaseSort = 'manual' | 'title' | 'due' | 'priority';
type DatabaseFilter = 'Todas' | BoardStatus;
interface DatabaseViewState {
  view: 'board' | 'table'; query: string; filter: DatabaseFilter; sort: DatabaseSort;
  properties: DatabaseProperty[]; collapsedEntryIds: string[];
}
const BOARD_STATUSES: readonly BoardStatus[] = ['Por hacer', 'En curso', 'Hecho'];
const TASK_PRIORITIES: readonly TaskPriority[] = ['Baja', 'Media', 'Alta', 'Urgente'];
interface PageSubtask { id: string; title: string; done: boolean }
interface PageEntry {
  id: string; title: string; status: BoardStatus; due?: string; tag?: string; tags?: string[];
  priority?: TaskPriority; content?: string; subtasks?: PageSubtask[]; done?: boolean;
  icon?: string; iconColor?: string;
}
interface WorkspacePage {
  id: string; title: string; type: PageType; parentId: string | null; content: string;
  favorite: boolean; updatedAt: number; createdAt: number; entries: PageEntry[]; icon?: string; iconColor?: string; banner?: string;
}
interface TodayTask { id: string; title: string; done: boolean; group: string }
type GlassStrength = 'soft' | 'balanced' | 'deep';
type CanvasWidth = 'compact' | 'standard' | 'wide';
type ReadingDensity = 'comfortable' | 'compact';
interface WorkspacePreferences { glass: GlassStrength; width: CanvasWidth; density: ReadingDensity }

const PAGE_STORAGE_KEY = 'knote.workspace.v1';
const TASK_STORAGE_KEY = 'knote.today.v1';
const PREFERENCES_STORAGE_KEY = 'knote.preferences.v1';
const DATABASE_VIEWS_STORAGE_KEY = 'knote.database-views.v1';
const DEFAULT_DATABASE_PROPERTIES: DatabaseProperty[] = ['content', 'status', 'priority', 'due', 'tags'];
const now = Date.now();
const dayMs = 86400000;
const pageIconOptions = [
  { id: 'file', label: 'Documento', icon: FileText },
  { id: 'folder', label: 'Carpeta', icon: Folder },
  { id: 'board', label: 'Tablero', icon: LayoutDashboard },
  { id: 'table', label: 'Tabla', icon: Table2 },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'tasks', label: 'Tareas', icon: ListTodo },
  { id: 'book', label: 'Libro', icon: BookOpen },
  { id: 'idea', label: 'Idea', icon: Lightbulb },
  { id: 'heart', label: 'Favorito', icon: Heart },
  { id: 'flame', label: 'Llama', icon: Flame },
  { id: 'code', label: 'Código', icon: Code2 },
  { id: 'game', label: 'Juego', icon: Gamepad2 },
  { id: 'work', label: 'Trabajo', icon: BriefcaseBusiness },
  { id: 'sparkles', label: 'Destellos', icon: Sparkles },
  { id: 'music', label: 'Música', icon: Music2 },
  { id: 'coffee', label: 'Café', icon: Coffee },
  { id: 'palette', label: 'Diseño', icon: Palette },
  { id: 'compass', label: 'Exploración', icon: Compass },
  { id: 'shield', label: 'Seguridad', icon: ShieldCheck },
  { id: 'inbox', label: 'Bandeja', icon: Inbox },
  { id: 'star', label: 'Estrella', icon: Star },
  { id: 'archive', label: 'Archivo', icon: Archive },
  { id: 'activity', label: 'Actividad', icon: Activity },
  { id: 'alert', label: 'Aviso', icon: CircleAlert },
  { id: 'help', label: 'Ayuda', icon: CircleHelp },
  { id: 'bookmark', label: 'Marcador', icon: BookMarked },
  { id: 'newspaper', label: 'Artículo', icon: Newspaper },
  { id: 'file-code', label: 'Archivo de código', icon: FileCode },
  { id: 'image', label: 'Imagen', icon: FileImage },
  { id: 'camera', label: 'Fotografía', icon: Camera },
  { id: 'folder-open', label: 'Carpeta abierta', icon: FolderOpen },
  { id: 'clipboard', label: 'Lista', icon: ClipboardList },
  { id: 'checklist', label: 'Lista completada', icon: CheckCheck },
  { id: 'calendar-reminder', label: 'Recordatorio', icon: AlarmClock },
  { id: 'clock', label: 'Historial', icon: History },
  { id: 'bell', label: 'Notificación', icon: Bell },
  { id: 'mail', label: 'Correo', icon: Mail },
  { id: 'message', label: 'Conversación', icon: MessageCircle },
  { id: 'send', label: 'Enviar', icon: Send },
  { id: 'people', label: 'Personas', icon: UsersRound },
  { id: 'person', label: 'Perfil', icon: UserRound },
  { id: 'building', label: 'Organización', icon: Building2 },
  { id: 'globe', label: 'Web', icon: Globe },
  { id: 'earth', label: 'Mundo', icon: Earth },
  { id: 'map', label: 'Mapa', icon: Map },
  { id: 'location', label: 'Ubicación', icon: MapPin },
  { id: 'mountain', label: 'Montaña', icon: Mountain },
  { id: 'trees', label: 'Bosque', icon: Trees },
  { id: 'leaf', label: 'Naturaleza', icon: Leaf },
  { id: 'sprout', label: 'Crecimiento', icon: Sprout },
  { id: 'sun', label: 'Día', icon: Sun },
  { id: 'moon', label: 'Noche', icon: Moon },
  { id: 'rocket', label: 'Lanzamiento', icon: Rocket },
  { id: 'game-controller', label: 'Videojuego', icon: Gamepad2 },
  { id: 'sword', label: 'Aventura', icon: Sword },
  { id: 'puzzle', label: 'Puzzle', icon: Puzzle },
  { id: 'bot', label: 'Automatización', icon: Bot },
  { id: 'cpu', label: 'Procesador', icon: Cpu },
  { id: 'database', label: 'Base de datos', icon: Database },
  { id: 'server', label: 'Servidor', icon: Server },
  { id: 'network', label: 'Red', icon: Network },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'laptop', label: 'Ordenador', icon: Laptop },
  { id: 'monitor', label: 'Pantalla', icon: Monitor },
  { id: 'layers', label: 'Capas', icon: Layers },
  { id: 'workflow', label: 'Flujo de trabajo', icon: Workflow },
  { id: 'branch', label: 'Ramas', icon: GitBranch },
  { id: 'chart', label: 'Gráfico', icon: ChartNoAxesCombined },
  { id: 'gauge', label: 'Métrica', icon: Gauge },
  { id: 'target', label: 'Objetivo', icon: Target },
  { id: 'tag', label: 'Etiqueta', icon: Tag },
  { id: 'flag', label: 'Bandera', icon: Flag },
  { id: 'award', label: 'Logro', icon: Award },
  { id: 'medal', label: 'Medalla', icon: Medal },
  { id: 'trophy', label: 'Trofeo', icon: Trophy },
  { id: 'crown', label: 'Corona', icon: Crown },
  { id: 'diamond', label: 'Diamante', icon: Diamond },
  { id: 'gem', label: 'Gema', icon: Gem },
  { id: 'eye', label: 'Vista', icon: Eye },
  { id: 'lock', label: 'Privado', icon: LockKeyhole },
  { id: 'key', label: 'Clave', icon: KeyRound },
  { id: 'fingerprint', label: 'Identidad', icon: Fingerprint },
  { id: 'cloud', label: 'Nube', icon: Cloud },
  { id: 'plug', label: 'Integración', icon: Plug },
  { id: 'link', label: 'Enlace', icon: LinkIcon },
  { id: 'package', label: 'Paquete', icon: Package },
  { id: 'tools', label: 'Herramientas', icon: Wrench },
  { id: 'hammer', label: 'Construcción', icon: Hammer },
  { id: 'handshake', label: 'Acuerdo', icon: Handshake },
  { id: 'wallet', label: 'Finanzas', icon: Wallet },
  { id: 'shopping', label: 'Compras', icon: ShoppingBag },
  { id: 'plane', label: 'Viaje', icon: Plane },
  { id: 'music-player', label: 'Audio', icon: Headphones },
  { id: 'video', label: 'Vídeo', icon: Video },
  { id: 'mic', label: 'Grabación', icon: Mic },
  { id: 'radio', label: 'Radio', icon: Radio },
  { id: 'smile', label: 'Estado de ánimo', icon: Smile },
  { id: 'dumbbell', label: 'Entrenamiento', icon: Dumbbell },
  { id: 'chef', label: 'Cocina', icon: ChefHat },
  { id: 'atom', label: 'Ciencia', icon: Atom },
  { id: 'flask', label: 'Experimento', icon: FlaskConical },
  { id: 'scale', label: 'Equilibrio', icon: Scale },
  { id: 'scissors', label: 'Recorte', icon: Scissors },
  { id: 'pencil', label: 'Escritura', icon: Pencil },
  { id: 'pen-tool', label: 'Ilustración', icon: PenTool },
  { id: 'paintbrush', label: 'Pincel', icon: Paintbrush },
  { id: 'settings', label: 'Configuración', icon: Settings },
  { id: 'zap', label: 'Energía', icon: Zap },
] as const;
const priorityOptions = [
  { label: 'Sin prioridad', value: 'Sin prioridad' },
  ...TASK_PRIORITIES.map((priority) => ({ label: priority, value: priority })),
];
const statusOptions = BOARD_STATUSES.map((status) => ({ label: status, value: status }));
const priorityCellOptions = priorityOptions;
const defaultPreferences: WorkspacePreferences = { glass: 'balanced', width: 'standard', density: 'comfortable' };
const preferenceTabs = [
  { id: 'appearance', label: 'Apariencia', icon: Sparkles },
  { id: 'reading', label: 'Lectura', icon: BookOpen },
];
const glassOptions: { id: GlassStrength; label: string; description: string }[] = [
  { id: 'soft', label: 'Sutil', description: 'Menos desenfoque, más transparencia.' },
  { id: 'balanced', label: 'Equilibrado', description: 'Cristal visible con contenido nítido.' },
  { id: 'deep', label: 'Intenso', description: 'Más profundidad y desenfoque.' },
];
const widthOptions: { id: CanvasWidth; label: string; description: string }[] = [
  { id: 'compact', label: 'Compacta', description: 'Lectura enfocada.' },
  { id: 'standard', label: 'Normal', description: 'Equilibrio entre texto y espacio.' },
  { id: 'wide', label: 'Amplia', description: 'Más espacio para tablas y tableros.' },
];
const densityOptions: { id: ReadingDensity; label: string; description: string }[] = [
  { id: 'comfortable', label: 'Cómoda', description: 'Más aire entre filas.' },
  { id: 'compact', label: 'Compacta', description: 'Más contenido a la vista.' },
];

function readPreferences(): WorkspacePreferences {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY) || 'null');
    return {
      glass: ['soft', 'balanced', 'deep'].includes(parsed?.glass) ? parsed.glass : defaultPreferences.glass,
      width: ['compact', 'standard', 'wide'].includes(parsed?.width) ? parsed.width : defaultPreferences.width,
      density: ['comfortable', 'compact'].includes(parsed?.density) ? parsed.density : defaultPreferences.density,
    };
  } catch { return { ...defaultPreferences }; }
}
const samplePages: WorkspacePage[] = [
  { id: 'folder-programacion', title: 'Programación', type: 'folder', parentId: null, content: '', favorite: false, createdAt: now - 14 * dayMs, updatedAt: now - 14 * dayMs, entries: [] },
  { id: 'folder-bitecraft', title: 'BiteCraft', type: 'folder', parentId: 'folder-programacion', content: '', favorite: false, createdAt: now - 8 * dayMs, updatedAt: now - 8 * dayMs, entries: [] },
  { id: 'page-abyss-ideas', title: 'Abyss Ideas', type: 'board', parentId: 'folder-bitecraft', content: 'Ideas del mundo, sistemas y criaturas que queremos explorar.', favorite: true, createdAt: now - 6 * dayMs, updatedAt: now - 15 * 60000, entries: [
    { id: 'idea-tide', title: 'Un ciclo de mareas que cambia las rutas', status: 'En curso', due: 'Hoy', tag: 'Mundo' },
    { id: 'idea-fishing', title: 'Encantamientos para la siguiente temporada', status: 'Por hacer', due: 'Mañana', tag: 'Pesca' },
    { id: 'idea-ruins', title: 'Ruinas que solo aparecen al bajar el nivel del agua', status: 'Por hacer', due: '7 oct', tag: 'Exploración' },
    { id: 'idea-audio', title: 'Capa sonora para las cuevas profundas', status: 'Hecho', due: '2 oct', tag: 'Audio' },
  ] },
  { id: 'page-roadmap', title: 'Hoja de ruta', type: 'database', parentId: 'folder-bitecraft', content: 'Lanzamientos y mejoras que estamos preparando.', favorite: false, createdAt: now - 5 * dayMs, updatedAt: now - 3 * 3600000, entries: [
    { id: 'roadmap-1', title: 'Prototipo de exploración', status: 'En curso', due: '10 oct', tag: 'Diseño' },
    { id: 'roadmap-2', title: 'Pruebas con jugadores', status: 'Por hacer', due: '14 oct', tag: 'Pruebas' },
    { id: 'roadmap-3', title: 'Notas de actualización', status: 'Hecho', due: '1 oct', tag: 'Comunidad' },
  ] },
  { id: 'page-knote', title: 'KNote', type: 'board', parentId: 'folder-programacion', content: 'Un espacio rápido para escribir, organizar y volver a encontrar las ideas.', favorite: true, createdAt: now - 5 * dayMs, updatedAt: now - 50 * 60000, entries: [
    { id: 'knote-1', title: 'Revisar la navegación lateral', status: 'En curso', due: 'Hoy', tag: 'Interfaz' },
    { id: 'knote-2', title: 'Guardar páginas en local', status: 'Hecho', due: 'Ayer', tag: 'Base' },
    { id: 'knote-3', title: 'Añadir vista de tablero', status: 'Por hacer', due: '8 oct', tag: 'Producto' },
  ] },
  { id: 'folder-reuniones', title: 'Reuniones', type: 'folder', parentId: null, content: '', favorite: false, createdAt: now - 11 * dayMs, updatedAt: now - 11 * dayMs, entries: [] },
  { id: 'page-agenda', title: 'Agenda', type: 'calendar', parentId: 'folder-reuniones', content: 'Fechas importantes y próximas conversaciones.', favorite: false, createdAt: now - 4 * dayMs, updatedAt: now - 4 * 3600000, entries: [
    { id: 'event-1', title: 'Revisión de producto', status: 'Por hacer', due: '2026-10-04', tag: 'KNote' },
    { id: 'event-2', title: 'BiteCraft · ideas de temporada', status: 'Por hacer', due: '2026-10-06', tag: 'BiteCraft' },
    { id: 'event-3', title: 'Plan de la semana', status: 'Por hacer', due: '2026-10-08', tag: 'Personal' },
  ] },
  { id: 'page-sync', title: 'Notas de reunión', type: 'doc', parentId: 'folder-reuniones', content: 'Decisiones\n• Mantener un ritmo de trabajo sostenible.\n• Compartir una versión jugable antes de ampliar el alcance.\n\nPróxima conversación\nRevisar avances y elegir el siguiente experimento.', favorite: false, createdAt: now - 3 * dayMs, updatedAt: now - 6 * 3600000, entries: [] },
  { id: 'folder-personal', title: 'Personal', type: 'folder', parentId: null, content: '', favorite: false, createdAt: now - 20 * dayMs, updatedAt: now - 20 * dayMs, entries: [] },
  { id: 'page-notes', title: 'La belleza de lo simple', type: 'doc', parentId: 'folder-personal', content: 'Una buena idea no necesita más ruido.\n\n• Quitar lo que estorba también es avanzar.\n• Dejar espacio para que aparezca lo importante.\n• Volver a lo esencial, una y otra vez.\n\nApuntes para pensar con calma.', favorite: true, createdAt: now - 3 * dayMs, updatedAt: now - 14 * 60000, entries: [] },
  { id: 'page-reading', title: 'Lecturas para guardar', type: 'database', parentId: 'folder-personal', content: 'Libros, artículos y frases a los que quiero volver.', favorite: false, createdAt: now - 7 * dayMs, updatedAt: now - dayMs, entries: [
    { id: 'reading-1', title: 'El diseño de las cosas cotidianas', status: 'En curso', due: 'Libro', tag: 'Diseño' },
    { id: 'reading-2', title: 'Notas sobre herramientas tranquilas', status: 'Por hacer', due: 'Artículo', tag: 'Ideas' },
    { id: 'reading-3', title: 'Un sistema para recordar mejor', status: 'Hecho', due: 'Ensayo', tag: 'Escritura' },
  ] },
  { id: 'page-tasks', title: 'Objetivos de octubre', type: 'tasks', parentId: 'folder-personal', content: 'Pequeños pasos para un mes con foco.', favorite: false, createdAt: now - 2 * dayMs, updatedAt: now - 2 * dayMs, entries: [
    { id: 'goal-1', title: 'Terminar la primera versión de KNote', status: 'En curso', done: false, tag: 'KNote' },
    { id: 'goal-2', title: 'Reservar tiempo para leer', status: 'En curso', done: true, tag: 'Personal' },
    { id: 'goal-3', title: 'Probar una idea con usuarios', status: 'Por hacer', done: false, tag: 'BiteCraft' },
  ] },
];
const sampleTodayTasks: TodayTask[] = [
  { id: 'today-1', title: 'Revisar el tablero de KNote', done: true, group: 'KNote' },
  { id: 'today-2', title: 'Escribir las ideas de la reunión', done: false, group: 'Reuniones' },
  { id: 'today-3', title: 'Elegir el siguiente experimento de BiteCraft', done: false, group: 'BiteCraft' },
];

function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? 'page-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
}
function normalizeEntry(value: unknown): PageEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PageEntry>;
  const id = typeof raw.id === 'string' ? raw.id : makeId();
  const rawSubtasks = (value as { subtasks?: unknown }).subtasks;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === 'string').map((tag) => tag.trim()).filter(Boolean).slice(0, 12)
    : typeof raw.tag === 'string' && raw.tag.trim() ? [raw.tag.trim()] : [];
  const subtasks = Array.isArray(rawSubtasks) ? rawSubtasks.flatMap((item, index): PageSubtask[] => {
    if (typeof item === 'string') {
      const title = item.trim();
      return title ? [{ id: `${id}-sub-${index}`, title, done: false }] : [];
    }
    if (!item || typeof item !== 'object') return [];
    const subtask = item as Partial<PageSubtask>;
    const title = typeof subtask.title === 'string' ? subtask.title.trim() : '';
    return title ? [{ id: typeof subtask.id === 'string' ? subtask.id : `${id}-sub-${index}`, title, done: Boolean(subtask.done) }] : [];
  }).slice(0, 100) : [];
  return {
    id,
    title: typeof raw.title === 'string' ? raw.title : 'Sin título',
    status: BOARD_STATUSES.includes(raw.status as BoardStatus) ? raw.status as BoardStatus : 'Por hacer',
    due: typeof raw.due === 'string' ? raw.due : undefined,
    tag: tags[0],
    tags,
    priority: TASK_PRIORITIES.includes(raw.priority as TaskPriority) ? raw.priority as TaskPriority : undefined,
    content: typeof raw.content === 'string' ? raw.content : '',
    subtasks,
    done: Boolean(raw.done),
    icon: pageIconOptions.some((option) => option.id === raw.icon) ? raw.icon : undefined,
    iconColor: typeof raw.iconColor === 'string' && /^#[\da-f]{6}$/i.test(raw.iconColor) ? raw.iconColor.toLowerCase() : undefined,
  };
}
function cloneSamplePage(page: WorkspacePage): WorkspacePage {
  return { ...page, entries: page.entries.map(normalizeEntry).filter((entry): entry is PageEntry => Boolean(entry)) };
}
function readPages(): WorkspacePage[] {
  let stored: unknown;
  try {
    const raw = localStorage.getItem(PAGE_STORAGE_KEY);
    stored = raw ? JSON.parse(raw) : null;
  } catch { stored = null; }
  if (!Array.isArray(stored)) return samplePages.map(cloneSamplePage);
  const normalized = stored.filter((page) => page && typeof page.title === 'string').map((page) => {
    const type: PageType = ['folder', 'doc', 'board', 'database', 'calendar', 'tasks'].includes(page.type) ? page.type : 'doc';
    return {
      ...page, id: typeof page.id === 'string' ? page.id : makeId(), title: page.title, type,
      parentId: typeof page.parentId === 'string' ? page.parentId : null,
      content: typeof page.content === 'string' ? page.content : '', favorite: Boolean(page.favorite),
      icon: pageIconOptions.some((option) => option.id === page.icon) ? page.icon : undefined,
      iconColor: typeof page.iconColor === 'string' && /^#[\da-f]{6}$/i.test(page.iconColor) ? page.iconColor.toLowerCase() : undefined,
      banner: typeof page.banner === 'string' && /^data:image\/(?:webp|jpeg|png);base64,[\da-z+/=]+$/i.test(page.banner) && page.banner.length <= 1300000 ? page.banner : undefined,
      createdAt: Number(page.createdAt) || now, updatedAt: Number(page.updatedAt) || now,
      entries: Array.isArray(page.entries) ? page.entries.map(normalizeEntry).filter((entry): entry is PageEntry => Boolean(entry)) : [],
    } as WorkspacePage;
  });
  const existingIds = new Set(normalized.map((page) => page.id));
  const newSamples = samplePages.filter((page) => !existingIds.has(page.id)).map(cloneSamplePage);
  return [...normalized, ...newSamples];
}
function readTodayTasks(): TodayTask[] {
  try {
    const raw = localStorage.getItem(TASK_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) return parsed as TodayTask[];
  } catch { /* Fall back to the local sample list. */ }
  return sampleTodayTasks.map((task) => ({ ...task }));
}
function readDatabaseViewStates(): Record<string, DatabaseViewState> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(DATABASE_VIEWS_STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const knownProperties = new Set<DatabaseProperty>(DEFAULT_DATABASE_PROPERTIES);
    const knownSorts = new Set<DatabaseSort>(['manual', 'title', 'due', 'priority']);
    return Object.fromEntries(Object.entries(parsed).flatMap(([pageId, raw]) => {
      if (!raw || typeof raw !== 'object') return [];
      const state = raw as Partial<DatabaseViewState>;
      const view = state.view === 'table' ? 'table' : state.view === 'board' ? 'board' : null;
      if (!view) return [];
      const filter = state.filter === 'Todas' || BOARD_STATUSES.includes(state.filter as BoardStatus)
        ? state.filter as DatabaseFilter : 'Todas';
      const properties = Array.isArray(state.properties)
        ? state.properties.filter((property): property is DatabaseProperty => knownProperties.has(property as DatabaseProperty))
        : [...DEFAULT_DATABASE_PROPERTIES];
      return [[pageId, {
        view,
        query: typeof state.query === 'string' ? state.query.slice(0, 240) : '',
        filter,
        sort: knownSorts.has(state.sort as DatabaseSort) ? state.sort as DatabaseSort : 'manual',
        properties: [...new Set(properties)],
        collapsedEntryIds: Array.isArray(state.collapsedEntryIds)
          ? state.collapsedEntryIds.filter((id): id is string => typeof id === 'string').slice(0, 1000)
          : [],
      } satisfies DatabaseViewState]];
    }));
  } catch { return {}; }
}

const pages = ref<WorkspacePage[]>(readPages());
const todayTasks = ref<TodayTask[]>(readTodayTasks());
const preferences = ref<WorkspacePreferences>(readPreferences());
const databaseViewStates = ref<Record<string, DatabaseViewState>>(readDatabaseViewStates());
const bannerFiles = ref<readonly File[]>([]);
function pageIdFromHash(): string {
  let requestedId = '';
  try { requestedId = decodeURIComponent(window.location.hash.slice(1)); }
  catch { requestedId = window.location.hash.slice(1); }
  return pages.value.some((page) => page.id === requestedId) ? requestedId : 'home';
}
const selectedId = ref(pageIdFromHash());
const sidebarCollapsed = ref(true);
const mobileSidebarOpen = ref(false);
const createModalOpen = ref(false);
const preferencesOpen = ref(false);
const entryModalOpen = ref(false);
const preferencesTab = ref('appearance');
const entryEditingId = ref<string | null>(null);
const entryTitle = ref('');
const entryTag = ref('');
const entryPriority = ref<TaskPriority | 'Sin prioridad'>('Media');
const entryDue = ref('');
const entryStatus = ref<BoardStatus>('Por hacer');
const nonDatabaseActiveView = ref('board');
const entryInspectorOpen = ref(false);
const deleteEntryModalOpen = ref(false);
const detailPageId = ref<string | null>(null);
const detailEntryId = ref<string | null>(null);
const entryInspectorScroll = ref<HTMLElement | null>(null);
const detailTagsDraft = ref('');
const newSubtaskTitle = ref('');
const tableSubtaskComposerId = ref<string | null>(null);
const tableSubtaskDraft = ref('');
const newTableEntryTitle = ref('');
const editingTagsEntryId = ref<string | null>(null);
const databaseTagsDraft = ref('');
const draggedEntryId = ref<string | null>(null);
const dropTargetEntryId = ref<string | null>(null);
const taskDescriptionEditor = ref<{ focusEnd: () => void } | null>(null);
const createTitle = ref('');
const createType = ref<PageType>('doc');
const createParentId = ref<string | null>(null);
const quickCapture = ref('');
const commandOpen = ref(false);
const commandQuery = ref('');
const selectedDate = ref<CalendarModelValue>(new Date());
const toasts = ref<readonly ToastItem[]>([]);
let saveTimer: number | undefined;
let toastCounter = 0;
let sidebarCloseTimer: number | undefined;

const activePage = computed(() => pages.value.find((page) => page.id === selectedId.value) ?? null);
function defaultDatabaseViewState(page: WorkspacePage): DatabaseViewState {
  return {
    view: page.type === 'database' ? 'table' : 'board', query: '', filter: 'Todas', sort: 'manual',
    properties: [...DEFAULT_DATABASE_PROPERTIES], collapsedEntryIds: [],
  };
}
function getDatabaseViewState(pageId = selectedId.value): DatabaseViewState | null {
  const page = pages.value.find((item) => item.id === pageId);
  if (!page || (page.type !== 'board' && page.type !== 'database')) return null;
  return databaseViewStates.value[pageId] ?? defaultDatabaseViewState(page);
}
function updateDatabaseViewState<K extends keyof DatabaseViewState>(key: K, value: DatabaseViewState[K]): void {
  const page = activePage.value;
  if (!page || (page.type !== 'board' && page.type !== 'database')) return;
  const current = getDatabaseViewState(page.id) ?? defaultDatabaseViewState(page);
  databaseViewStates.value[page.id] = { ...current, [key]: value };
}
const databaseQuery = computed({
  get: () => getDatabaseViewState()?.query ?? '',
  set: (value: string) => updateDatabaseViewState('query', value.slice(0, 240)),
});
const databaseStatusFilter = computed<DatabaseFilter>({
  get: () => getDatabaseViewState()?.filter ?? 'Todas',
  set: (value) => updateDatabaseViewState('filter', value),
});
const databaseSort = computed<DatabaseSort>({
  get: () => getDatabaseViewState()?.sort ?? 'manual',
  set: (value) => updateDatabaseViewState('sort', value),
});
const databaseProperties = computed<DatabaseProperty[]>({
  get: () => getDatabaseViewState()?.properties ?? DEFAULT_DATABASE_PROPERTIES,
  set: (value) => updateDatabaseViewState('properties', value),
});
const visibleDatabaseProperties = computed(() => entryInspectorOpen.value && activeView.value === 'table'
  ? databaseProperties.value.filter((property) => property !== 'content' && property !== 'tags')
  : databaseProperties.value);
const collapsedTableEntries = computed<string[]>({
  get: () => getDatabaseViewState()?.collapsedEntryIds ?? [],
  set: (value) => updateDatabaseViewState('collapsedEntryIds', value),
});
const activeView = computed({
  get: () => getDatabaseViewState()?.view ?? nonDatabaseActiveView.value,
  set: (value: string) => {
    if (value !== 'board' && value !== 'table') { nonDatabaseActiveView.value = value; return; }
    updateDatabaseViewState('view', value);
  },
});
const detailPage = computed(() => pages.value.find((page) => page.id === detailPageId.value) ?? null);
const detailEntry = computed(() => detailPage.value?.entries.find((entry) => entry.id === detailEntryId.value) ?? null);
const appPreferencesStyle = computed(() => ({
  '--knote-glass-alpha': preferences.value.glass === 'soft' ? '50%' : preferences.value.glass === 'deep' ? '84%' : '68%',
  '--knote-glass-blur': preferences.value.glass === 'soft' ? '12px' : preferences.value.glass === 'deep' ? '30px' : '20px',
  '--knote-canvas-width': preferences.value.width === 'compact' ? '48rem' : preferences.value.width === 'wide' ? '72rem' : '56rem',
}));
const sortedPages = computed(() => [...pages.value].sort((left, right) => right.updatedAt - left.updatedAt));
const recentPages = computed(() => {
  const seenTitles = new Set<string>();
  return sortedPages.value.filter((page) => {
    if (page.type === 'folder') return false;
    const title = page.title.trim().toLocaleLowerCase('es');
    if (seenTitles.has(title)) return false;
    seenTitles.add(title);
    return true;
  }).slice(0, 7);
});
const homeTasksRemaining = computed(() => todayTasks.value.filter((task) => !task.done).length);
const pageCount = computed(() => pages.value.filter((page) => page.type !== 'folder').length);
const favoriteCount = computed(() => pages.value.filter((page) => page.favorite).length);
const todayDoneCount = computed(() => todayTasks.value.filter((task) => task.done).length);
const greeting = computed(() => {
  const hour = new Date().getHours();
  return hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
});
const dateLabel = computed(() => new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()));
const selectedDateLabel = computed(() => selectedDate.value instanceof Date
  ? new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).format(selectedDate.value)
  : 'Próximas fechas');
const entryDialogTitle = computed(() => entryEditingId.value ? 'Editar elemento' : activePage.value?.type === 'calendar' ? 'Añadir evento' : activePage.value?.type === 'tasks' ? 'Añadir paso' : 'Añadir elemento');
const focusProject = computed(() => pages.value.find((page) => page.id === 'page-abyss-ideas') ?? null);
const projectCompletion = computed(() => {
  const entries = focusProject.value?.entries ?? [];
  return entries.length ? Math.round(entries.filter((entry) => entry.status === 'Hecho').length / entries.length * 100) : 0;
});
const boardStatuses = BOARD_STATUSES;
const visibleBoardStatuses = computed(() => {
  const filter = getDatabaseViewState()?.filter ?? 'Todas';
  return boardStatuses.filter((status) => filter === 'Todas' || filter === status);
});
const entryStatusTabs = [
  { id: 'Por hacer', label: 'Por hacer', icon: CircleDashed },
  { id: 'En curso', label: 'En curso', icon: CircleDot },
  { id: 'Hecho', label: 'Hecho', icon: CircleCheck },
];
const boardViewTabs = [
  { id: 'board', label: 'Tablero', icon: LayoutDashboard },
  { id: 'table', label: 'Tabla', icon: Table2 },
];
const databaseViewTabs = [
  { id: 'table', label: 'Tabla', icon: Table2 },
  { id: 'board', label: 'Tablero', icon: LayoutDashboard },
];
const databaseStatusOptions = [
  { label: 'Todos', value: 'Todas' },
  ...BOARD_STATUSES.map((status) => ({ label: status, value: status })),
];
const databasePropertyLabels: Record<DatabaseProperty, string> = {
  content: 'Descripción', status: 'Estado', priority: 'Prioridad', due: 'Fecha', tags: 'Etiquetas',
};
const databaseSortItems = computed<MenuItem[]>(() => [
  { id: 'sort:manual', label: 'Orden original', type: 'radio', group: 'sort', checked: databaseSort.value === 'manual' },
  { id: 'sort:title', label: 'Nombre A–Z', type: 'radio', group: 'sort', checked: databaseSort.value === 'title' },
  { id: 'sort:due', label: 'Fecha más próxima', type: 'radio', group: 'sort', checked: databaseSort.value === 'due' },
  { id: 'sort:priority', label: 'Prioridad', type: 'radio', group: 'sort', checked: databaseSort.value === 'priority' },
]);
const databasePropertyItems = computed<MenuItem[]>(() => (Object.keys(databasePropertyLabels) as DatabaseProperty[]).map((property) => ({
  id: `property:${property}`,
  label: databasePropertyLabels[property],
  type: 'checkbox',
  checked: databaseProperties.value.includes(property),
})));
const createTypeTabs = [
  { id: 'doc', label: 'Documento', icon: FileText },
  { id: 'board', label: 'Tablero', icon: LayoutDashboard },
  { id: 'database', label: 'Tabla', icon: Table2 },
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'tasks', label: 'Tareas', icon: ListTodo },
  { id: 'folder', label: 'Carpeta', icon: Folder },
];

function pageTypeLabel(type: PageType): string {
  return { folder: 'Carpeta', doc: 'Documento', board: 'Tablero', database: 'Tabla', calendar: 'Calendario', tasks: 'Lista de tareas' }[type];
}
function pageTypeIcon(type: PageType) {
  return { folder: Folder, doc: FileText, board: LayoutDashboard, database: Table2, calendar: CalendarDays, tasks: ListTodo }[type];
}
function pageIcon(page: WorkspacePage) {
  return pageIconOptions.find((option) => option.id === page.icon)?.icon ?? pageTypeIcon(page.type);
}
function pageIconColor(page: WorkspacePage): string {
  return page.iconColor || 'var(--balsa-role-accent)';
}
function pageIconStyle(page: WorkspacePage): Record<string, string> {
  return { '--knote-page-icon-color': pageIconColor(page) };
}
function entryIcon(entry: PageEntry) {
  return pageIconOptions.find((option) => option.id === entry.icon)?.icon ?? FileText;
}
function entryIconStyle(entry: PageEntry): Record<string, string> {
  return { color: entry.iconColor || 'var(--balsa-role-accent)' };
}
function pageBannerStyle(page: WorkspacePage): Record<string, string> {
  return page.banner ? { backgroundImage: `url("${page.banner}")` } : {};
}
function formatRelative(timestamp: number): string {
  const minutes = Math.floor(Math.max(0, Date.now() - (timestamp || Date.now())) / 60000);
  if (minutes < 1) return 'Ahora mismo';
  if (minutes < 60) return 'Hace ' + minutes + ' min';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return 'Hace ' + hours + ' h';
  if (hours < 48) return 'Ayer';
  return 'Hace ' + Math.floor(hours / 24) + ' días';
}
function pageChildren(parentId: string): WorkspacePage[] {
  return sortedPages.value.filter((page) => page.parentId === parentId);
}
function sidebarItemsFor(parentId: string | null): SidebarGroup['items'] {
  return sortedPages.value.filter((page) => page.parentId === parentId).map((page) => {
    const children = sidebarItemsFor(page.id);
    return {
      id: page.id, label: page.title || 'Sin título', icon: pageIcon(page), iconColor: page.iconColor,
      ...(page.favorite ? { badge: '★' } : {}),
      ...(children.length ? { children } : {}),
    };
  });
}
const sidebarGroups = computed<readonly SidebarGroup[]>(() => {
  const recentItems = recentPages.value.slice(0, 7).map((page) => ({
    id: page.id, label: page.title || 'Sin título', icon: pageIcon(page), iconColor: page.iconColor,
    ...(page.favorite ? { badge: '★' } : {}),
  }));
  return [
    { id: 'meetings', label: 'Reuniones', items: [
      { id: 'meetings-empty', label: 'No hay eventos próximos', icon: CalendarDays, disabled: true },
      { id: 'create-meeting-note', label: 'Nueva nota de reunión', icon: Plus },
      { id: 'page-agenda', label: 'Ver agenda', icon: ArrowUpRight },
    ] },
    { id: 'recents', label: 'Recientes', items: recentItems },
    { id: 'private', label: 'Privado', items: sidebarItemsFor(null) },
  ];
});
const breadcrumbItems = computed(() => {
  if (!activePage.value) return [{ label: 'Mi espacio', href: '#home' }, { label: 'Inicio', current: true }];
  const ancestors: WorkspacePage[] = [];
  let cursor: WorkspacePage | undefined = activePage.value;
  while (cursor) {
    ancestors.unshift(cursor);
    const parentId = cursor.parentId;
    cursor = parentId ? pages.value.find((page) => page.id === parentId) : undefined;
  }
  return [
    { label: 'Mi espacio', href: '#home' },
    ...ancestors.map((page, index) => index === ancestors.length - 1
      ? { label: page.title || 'Sin título', current: true }
      : { label: page.title || 'Sin título', href: '#' + page.id }),
  ];
});
const pageMenuItems = computed<readonly MenuItem[]>(() => [
  { id: 'favorite', type: 'checkbox', label: activePage.value?.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos', icon: Star, checked: Boolean(activePage.value?.favorite), disabled: !activePage.value },
  { id: 'copy-link', label: 'Copiar enlace local', icon: Link2, disabled: !activePage.value },
  { id: 'menu-separator', type: 'separator' },
  { id: 'delete', label: 'Eliminar página', icon: Trash2, destructive: true, disabled: !activePage.value },
]);
const commandGroups = computed(() => [
  { id: 'pages', label: 'Páginas', items: recentPages.value.map((page) => ({
    id: 'page:' + page.id, label: page.title || 'Sin título',
    keywords: [pageTypeLabel(page.type), page.content.slice(0, 60)], icon: pageIcon(page),
  })) },
  { id: 'create', label: 'Crear', items: [
    { id: 'new:doc', label: 'Nuevo documento', keywords: ['página', 'nota'], icon: FileText },
    { id: 'new:board', label: 'Nuevo tablero', keywords: ['kanban', 'proyecto'], icon: LayoutDashboard },
    { id: 'new:database', label: 'Nueva tabla', keywords: ['base de datos', 'lista'], icon: Table2 },
    { id: 'new:calendar', label: 'Nuevo calendario', keywords: ['agenda', 'fecha'], icon: CalendarDays },
  ] },
]);

function notify(title: string, description: string, color: ToastItem['color'] = 'success'): void {
  toastCounter += 1;
  toasts.value = [...toasts.value, { id: 'toast-' + toastCounter, title, description, color, variant: 'surface', duration: 3200, dismissible: true }];
}
function persist(): void {
  try {
    localStorage.setItem(PAGE_STORAGE_KEY, JSON.stringify(pages.value));
    localStorage.setItem(TASK_STORAGE_KEY, JSON.stringify(todayTasks.value));
  } catch {
    notify('No se pudo guardar', 'Revisa el espacio de almacenamiento disponible.', 'destructive');
  }
}
function queueSave(): void {
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(persist, 320);
}
function touchPage(page: WorkspacePage): void {
  page.updatedAt = Date.now();
  queueSave();
}
function setActive(id: string, updateHistory = true): void {
  if (id !== 'home' && !pages.value.some((page) => page.id === id)) id = 'home';
  entryInspectorOpen.value = false;
  deleteEntryModalOpen.value = false;
  tableSubtaskComposerId.value = null;
  tableSubtaskDraft.value = '';
  newTableEntryTitle.value = '';
  selectedId.value = id;
  bannerFiles.value = [];
  mobileSidebarOpen.value = false;
  const page = pages.value.find((item) => item.id === id);
  if (page?.type === 'database' || page?.type === 'board') {
    if (!databaseViewStates.value[page.id]) databaseViewStates.value[page.id] = defaultDatabaseViewState(page);
  } else nonDatabaseActiveView.value = page?.type === 'calendar' ? 'calendar' : 'board';
  if (page?.type === 'calendar' && page.entries[0]?.due) {
    const firstDate = new Date(page.entries[0].due.length === 10 ? page.entries[0].due + 'T12:00:00' : page.entries[0].due);
    if (!Number.isNaN(firstDate.getTime())) selectedDate.value = firstDate;
  }
  if (updateHistory) {
    const fragment = id === 'home' ? '' : '#' + encodeURIComponent(id);
    if (window.location.hash !== fragment) window.history.pushState({ pageId: id }, '', window.location.pathname + window.location.search + fragment);
  }
}
function syncPageFromHistory(): void { setActive(pageIdFromHash(), false); }
function revealSidebar(): void {
  if (sidebarCloseTimer !== undefined) window.clearTimeout(sidebarCloseTimer);
  sidebarCollapsed.value = false;
}
function scheduleSidebarClose(keepWhenFocused = false): void {
  if (sidebarCloseTimer !== undefined) window.clearTimeout(sidebarCloseTimer);
  if (mobileSidebarOpen.value) return;
  sidebarCloseTimer = window.setTimeout(() => {
    const navigation = document.getElementById('knote-navigation');
    if (keepWhenFocused && navigation?.contains(document.activeElement)) return;
    sidebarCollapsed.value = true;
  }, 180);
}
function handleSidebarPointerLeave(): void {
  if (document.getElementById('knote-navigation')?.contains(document.activeElement)) {
    (document.activeElement as HTMLElement).blur();
  }
  scheduleSidebarClose();
}
function handleSidebarFocusOut(): void { scheduleSidebarClose(true); }
function onSidebarSelect(item: { id: string }): void {
  if (item.id === 'create-meeting-note') { openCreatePage('doc', 'folder-reuniones'); return; }
  if (item.id === 'meetings-empty') return;
  setActive(item.id);
}
function goHome(): void { setActive('home'); }
function goBreadcrumb(item: { href?: string }, event: MouseEvent): void {
  event.preventDefault();
  setActive(item.href?.slice(1) || 'home');
}
function openCreatePage(type: PageType = 'doc', parentId: string | null = activePage.value?.type === 'folder' ? activePage.value.id : activePage.value?.parentId ?? null): void {
  createType.value = type;
  createParentId.value = parentId;
  createTitle.value = '';
  createModalOpen.value = true;
}
function dateInputValue(date: Date): string {
  return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
}
function openEntryModal(status: BoardStatus = 'Por hacer', entry?: PageEntry): void {
  const page = activePage.value;
  if (!page) return;
  entryEditingId.value = entry?.id ?? null;
  entryTitle.value = entry?.title ?? '';
  entryTag.value = entry ? entryTags(entry).join(', ') : '';
  entryPriority.value = entry?.priority ?? (entry ? 'Sin prioridad' : 'Media');
  entryDue.value = entry?.due ?? (page.type === 'calendar' && selectedDate.value instanceof Date ? dateInputValue(selectedDate.value) : '');
  entryStatus.value = page.type === 'calendar' || page.type === 'tasks' ? 'Por hacer' : entry?.status ?? status;
  entryModalOpen.value = true;
}
function saveEntry(close?: () => void): void {
  const page = activePage.value;
  const title = entryTitle.value.trim();
  if (!page || !title) {
    notify('Falta un nombre', 'Escribe un título para guardar este elemento.', 'warning');
    return;
  }
  const selectedPriority: TaskPriority | undefined = entryPriority.value === 'Sin prioridad' ? undefined : entryPriority.value;
  const existing = entryEditingId.value ? page.entries.find((entry) => entry.id === entryEditingId.value) : undefined;
  if (existing) {
    existing.title = title;
    existing.tags = parseEntryTags(entryTag.value);
    existing.tag = existing.tags[0];
    existing.priority = selectedPriority;
    existing.due = entryDue.value.trim() || undefined;
    if (page.type === 'tasks') existing.done = Boolean(existing.done);
    else existing.status = entryStatus.value;
  } else {
    const tags = parseEntryTags(entryTag.value);
    page.entries.unshift({
      id: makeId(), title, tag: tags[0], tags, priority: selectedPriority,
      due: entryDue.value.trim() || undefined, status: entryStatus.value, content: '',
      ...(page.type === 'tasks' ? { done: false } : {}),
    });
  }
  touchPage(page);
  entryModalOpen.value = false;
  close?.();
  notify(existing ? 'Elemento actualizado' : 'Elemento añadido', title);
}
function defaultEntries(type: PageType): PageEntry[] {
  if (type === 'board' || type === 'database') return [
    { id: makeId(), title: 'Primera tarea', status: 'Por hacer', tag: 'Nueva', tags: ['Nueva'], priority: 'Media', content: '' },
    { id: makeId(), title: 'Siguiente paso', status: 'En curso', tag: 'En progreso', tags: ['En progreso'], priority: 'Alta', content: '' },
  ];
  if (type === 'tasks') return [
    { id: makeId(), title: 'Primer paso', status: 'Por hacer', done: false },
    { id: makeId(), title: 'Anotar una idea', status: 'Por hacer', done: false },
  ];
  return [];
}
function submitNewPage(close?: () => void): void {
  const titles: Record<PageType, string> = { folder: 'Nueva carpeta', doc: 'Sin título', board: 'Nuevo tablero', database: 'Nueva tabla', calendar: 'Calendario', tasks: 'Lista de tareas' };
  const title = createTitle.value.trim() || titles[createType.value];
  const timestamp = Date.now();
  const page: WorkspacePage = {
    id: makeId(), title, type: createType.value, parentId: createParentId.value, content: '',
    favorite: false, createdAt: timestamp, updatedAt: timestamp, entries: defaultEntries(createType.value),
  };
  pages.value.unshift(page);
  createModalOpen.value = false;
  close?.();
  setActive(page.id);
  persist();
  notify('Página creada', title + ' ya está en tu espacio.');
}
function captureQuickNote(): void {
  const content = quickCapture.value.trim();
  if (!content) return;
  const timestamp = Date.now();
  const page: WorkspacePage = {
    id: makeId(), title: content.length > 48 ? content.slice(0, 47).trimEnd() + '…' : content,
    type: 'doc', parentId: pages.value.some((page) => page.id === 'folder-personal' && page.type === 'folder') ? 'folder-personal' : null, content: content.length > 48 ? content : '',
    favorite: false, createdAt: timestamp, updatedAt: timestamp, entries: [],
  };
  pages.value.unshift(page);
  quickCapture.value = '';
  persist();
  notify('Idea guardada', 'Se añadió a Personal y quedó lista para seguir editando.');
}
function toggleFavorite(page: WorkspacePage): void {
  page.favorite = !page.favorite;
  touchPage(page);
  notify(page.favorite ? 'Añadido a favoritos' : 'Quitado de favoritos', page.title);
}
function descendantIds(rootId: string): Set<string> {
  const result = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const page of pages.value) {
      if (page.parentId && result.has(page.parentId) && !result.has(page.id)) { result.add(page.id); changed = true; }
    }
  }
  return result;
}
function deleteCurrentPage(): void {
  const page = activePage.value;
  if (!page) return;
  const removedIds = descendantIds(page.id);
  const count = removedIds.size;
  if (!window.confirm('¿Eliminar “' + page.title + '” y ' + (count > 1 ? (count - 1) + ' páginas dentro de la carpeta' : 'esta página') + '?')) return;
  pages.value = pages.value.filter((item) => !removedIds.has(item.id));
  setActive('home');
  persist();
  notify('Página eliminada', page.title, 'info');
}
async function copyCurrentLink(): Promise<void> {
  if (!activePage.value) return;
  try {
    await navigator.clipboard.writeText(window.location.origin + window.location.pathname + window.location.search + '#' + encodeURIComponent(activePage.value.id));
    notify('Enlace copiado', 'El enlace local ya está en el portapapeles.');
  } catch { notify('No se pudo copiar', 'El navegador no ha dado acceso al portapapeles.', 'warning'); }
}
function onPageMenu(selection: MenuSelection): void {
  if (selection.id === 'favorite' && activePage.value) toggleFavorite(activePage.value);
  if (selection.id === 'copy-link') void copyCurrentLink();
  if (selection.id === 'delete') deleteCurrentPage();
}
function setPageIcon(iconId: string | undefined): void {
  if (!activePage.value) return;
  if (iconId && !pageIconOptions.some((option) => option.id === iconId)) return;
  activePage.value.icon = iconId;
  touchPage(activePage.value);
}
function setPageIconColor(color: string): void {
  if (!activePage.value) return;
  if (color && !/^#[\da-f]{6}$/i.test(color)) return;
  activePage.value.iconColor = color ? color.toLowerCase() : undefined;
  touchPage(activePage.value);
}
function setDetailEntryIcon(iconId: string | undefined): void {
  if (!detailEntry.value) return;
  if (iconId && !pageIconOptions.some((option) => option.id === iconId)) return;
  detailEntry.value.icon = iconId;
  touchDetailEntry();
}
function setDetailEntryIconColor(color: string): void {
  if (!detailEntry.value || (color && !/^#[\da-f]{6}$/i.test(color))) return;
  detailEntry.value.iconColor = color ? color.toLowerCase() : undefined;
  touchDetailEntry();
}
async function optimizeBanner(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Elige una imagen para la portada.');
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / bitmap.width, 1400 / bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext('2d');
  if (!context) { bitmap.close(); throw new Error('No se pudo preparar la imagen.'); }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (quality: number) => new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo comprimir la imagen.')), 'image/webp', quality);
  });
  let blob = await toBlob(.9);
  if (blob.size > 930000) blob = await toBlob(.86);
  if (blob.size > 930000) blob = await toBlob(.82);
  if (blob.size > 930000) throw new Error('La portada es demasiado grande. Prueba con una imagen más pequeña.');
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('No se pudo leer la imagen.'));
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(blob);
  });
}
async function setPageBanner(files: readonly File[]): Promise<void> {
  const file = files[0];
  const pageId = activePage.value?.id;
  bannerFiles.value = files;
  if (!file || !pageId) return;
  try {
    const dataUrl = await optimizeBanner(file);
    const page = pages.value.find((item) => item.id === pageId);
    if (!page) return;
    page.banner = dataUrl;
    touchPage(page);
    notify('Portada actualizada', 'La imagen quedó optimizada y guardada en este dispositivo.');
  } catch (error) {
    notify('No se pudo usar la portada', error instanceof Error ? error.message : 'Elige otra imagen.', 'warning');
  } finally { bannerFiles.value = []; }
}
function removePageBanner(): void {
  if (!activePage.value) return;
  activePage.value.banner = undefined;
  touchPage(activePage.value);
}
function setPreference<K extends keyof WorkspacePreferences>(key: K, value: WorkspacePreferences[K]): void {
  preferences.value = { ...preferences.value, [key]: value };
}
function resetPreferences(): void {
  preferences.value = { ...defaultPreferences };
  notify('Apariencia restablecida', 'Se aplicaron los ajustes equilibrados.');
}
function onCommandSelect(item: { id: string }): void {
  if (item.id.startsWith('page:')) { setActive(item.id.slice(5)); commandOpen.value = false; return; }
  if (item.id.startsWith('new:')) {
    const type = item.id.slice(4) as PageType;
    commandOpen.value = false;
    openCreatePage(type);
  }
}
function entriesForStatus(page: WorkspacePage, status: BoardStatus): PageEntry[] {
  const viewState = getDatabaseViewState(page.id) ?? defaultDatabaseViewState(page);
  const query = viewState.query.trim().toLocaleLowerCase('es');
  return sortDatabaseEntries(page.entries.filter((entry) => {
    if (entry.status !== status) return false;
    if (viewState.filter !== 'Todas' && viewState.filter !== status) return false;
    if (!query) return true;
    return [entry.title, entry.status, entry.priority, entry.due, entryDescription(entry), ...entryTags(entry), ...entrySubtasks(entry).map((subtask) => subtask.title)]
      .filter(Boolean).join(' ').replace(/<[^>]*>/g, ' ').toLocaleLowerCase('es').includes(query);
  }), page.id);
}
function sortDatabaseEntries(entries: PageEntry[], pageId = selectedId.value): PageEntry[] {
  const sort = getDatabaseViewState(pageId)?.sort ?? 'manual';
  const result = [...entries];
  if (sort === 'title') result.sort((left, right) => left.title.localeCompare(right.title, 'es'));
  if (sort === 'due') result.sort((left, right) => (entryCalendarDate(left)?.getTime() ?? Number.POSITIVE_INFINITY) - (entryCalendarDate(right)?.getTime() ?? Number.POSITIVE_INFINITY));
  if (sort === 'priority') {
    const rank: Record<TaskPriority, number> = { Urgente: 0, Alta: 1, Media: 2, Baja: 3 };
    result.sort((left, right) => (left.priority ? rank[left.priority] : 4) - (right.priority ? rank[right.priority] : 4));
  }
  return result;
}
const databaseEntries = computed(() => {
  const page = activePage.value;
  if (!page) return [];
  const viewState = getDatabaseViewState(page.id) ?? defaultDatabaseViewState(page);
  const query = viewState.query.trim().toLocaleLowerCase('es');
  return sortDatabaseEntries(page.entries.filter((entry) => {
    if (viewState.filter !== 'Todas' && viewState.filter !== entry.status) return false;
    if (!query) return true;
    return [entry.title, entry.status, entry.priority, entry.due, entryDescription(entry), ...entryTags(entry), ...entrySubtasks(entry).map((subtask) => subtask.title)]
      .filter(Boolean).join(' ').toLocaleLowerCase('es').includes(query);
  }), page.id);
});
const databaseEntryCount = computed(() => databaseEntries.value.reduce((count, entry) => count + 1 + entrySubtasks(entry).length, 0));
function toggleTableEntry(entryId: string): void {
  collapsedTableEntries.value = collapsedTableEntries.value.includes(entryId)
    ? collapsedTableEntries.value.filter((id) => id !== entryId)
    : [...collapsedTableEntries.value, entryId];
}
function openTableSubtaskComposer(entryId: string): void {
  tableSubtaskComposerId.value = entryId;
  tableSubtaskDraft.value = '';
  collapsedTableEntries.value = collapsedTableEntries.value.filter((id) => id !== entryId);
  void nextTick(() => document.getElementById(`table-new-subtask-${entryId}`)?.focus({ preventScroll: true }));
}
function addTableSubtask(page: WorkspacePage, entry: PageEntry): void {
  const title = tableSubtaskDraft.value.trim();
  if (!title || tableSubtaskComposerId.value !== entry.id) return;
  if (entrySubtasks(entry).length >= 100) {
    notify('Límite de subtareas alcanzado', 'Cada tarea admite hasta 100 subtareas.', 'warning');
    return;
  }
  entry.subtasks = [...entrySubtasks(entry), { id: makeId(), title, done: false }];
  tableSubtaskDraft.value = '';
  touchPage(page);
  void nextTick(() => document.getElementById(`table-new-subtask-${entry.id}`)?.focus({ preventScroll: true }));
}
function updateTableSubtask(page: WorkspacePage, subtask: PageSubtask, patch: Partial<Pick<PageSubtask, 'title' | 'done'>>): void {
  Object.assign(subtask, patch);
  touchPage(page);
}
function focusNewTableEntry(): void {
  if (activeView.value !== 'table') activeView.value = 'table';
  void nextTick(() => document.getElementById('table-new-entry')?.focus({ preventScroll: true }));
}
function addTableEntry(page: WorkspacePage): void {
  const title = newTableEntryTitle.value.trim();
  if (!title) return;
  const entry: PageEntry = { id: makeId(), title, status: 'Por hacer', content: '', subtasks: [] };
  page.entries.push(entry);
  newTableEntryTitle.value = '';
  databaseStatusFilter.value = 'Todas';
  databaseQuery.value = '';
  touchPage(page);
  openEntryDetails(page, entry);
}
function handleDatabaseSort(selection: MenuSelection): void {
  if (!selection.id.startsWith('sort:')) return;
  databaseSort.value = selection.id.slice(5) as DatabaseSort;
}
function handleDatabaseProperty(selection: MenuSelection): void {
  if (!selection.id.startsWith('property:')) return;
  const property = selection.id.slice(9) as DatabaseProperty;
  databaseProperties.value = databaseProperties.value.includes(property)
    ? databaseProperties.value.filter((item) => item !== property)
    : [...databaseProperties.value, property];
}
function entryTags(entry: PageEntry): string[] {
  const tags = entry.tags?.filter((tag) => tag.trim()) ?? [];
  return tags.length ? tags : entry.tag?.trim() ? [entry.tag.trim()] : [];
}
function entrySubtasks(entry: PageEntry): PageSubtask[] {
  return entry.subtasks ?? [];
}
function entryDescription(entry: PageEntry): string {
  return (entry.content || '')
    .replace(/^knote-rich-v1:/, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|li|h[1-6])\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
const detailSubtaskProgress = computed(() => {
  const subtasks = detailEntry.value ? entrySubtasks(detailEntry.value) : [];
  return { done: subtasks.filter((subtask) => subtask.done).length, total: subtasks.length };
});
function parseEntryTags(value: string): string[] {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
}
function entryTagsLabel(entry: PageEntry): string {
  return entryTags(entry).join(', ') || '—';
}
function openEntryDetails(page: WorkspacePage, entry: PageEntry): void {
  detailPageId.value = page.id;
  detailEntryId.value = entry.id;
  detailTagsDraft.value = entryTags(entry).join(', ');
  newSubtaskTitle.value = '';
  entryInspectorOpen.value = true;
  void nextTick(() => { if (entryInspectorScroll.value) entryInspectorScroll.value.scrollTop = 0; });
}
function duplicateDetailEntry(): void {
  const page = detailPage.value;
  const entry = detailEntry.value;
  if (!page || !entry) return;
  const copy: PageEntry = {
    ...entry, id: makeId(), title: `${entry.title || 'Sin título'} (copia)`,
    tags: entryTags(entry),
    subtasks: entrySubtasks(entry).map((subtask) => ({ ...subtask, id: makeId() })),
  };
  page.entries.splice(page.entries.findIndex((item) => item.id === entry.id) + 1, 0, copy);
  touchPage(page);
  openEntryDetails(page, copy);
  notify('Tarea duplicada', copy.title);
}
function deleteDetailEntry(): void {
  const page = detailPage.value;
  const entry = detailEntry.value;
  if (!page || !entry) return;
  page.entries = page.entries.filter((item) => item.id !== entry.id);
  entryInspectorOpen.value = false;
  deleteEntryModalOpen.value = false;
  detailEntryId.value = null;
  tableSubtaskComposerId.value = null;
  touchPage(page);
  notify('Tarea eliminada', entry.title);
}
function updateDetailTitle(value: string): void {
  if (!detailEntry.value) return;
  detailEntry.value.title = value;
  touchDetailEntry();
}
function updateDetailDue(value: string): void {
  if (!detailEntry.value) return;
  detailEntry.value.due = value.trim() || undefined;
  touchDetailEntry();
}
function entryDateInputValue(entry: PageEntry): string {
  if (!entry.due) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.due)) return entry.due;
  const date = entryCalendarDate(entry);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function updateEntryDue(page: WorkspacePage, entry: PageEntry, value: string | number): void {
  entry.due = String(value).trim() || undefined;
  touchPage(page);
}
function updateEntryDueFromPicker(page: WorkspacePage, entry: PageEntry, value: CalendarModelValue): void {
  if (!(value instanceof Date)) {
    updateEntryDue(page, entry, '');
    return;
  }
  const dateValue = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  updateEntryDue(page, entry, dateValue);
}
function setEntryStatus(page: WorkspacePage, entry: PageEntry, value: string | readonly string[] | undefined): void {
  if (typeof value !== 'string' || !BOARD_STATUSES.includes(value as BoardStatus)) return;
  entry.status = value as BoardStatus;
  touchPage(page);
}
function setEntryPriority(page: WorkspacePage, entry: PageEntry, value: string | readonly string[] | undefined): void {
  if (typeof value !== 'string') return;
  if (value === 'Sin prioridad') entry.priority = undefined;
  else if (TASK_PRIORITIES.includes(value as TaskPriority)) entry.priority = value as TaskPriority;
  else return;
  touchPage(page);
}
function openEntryDescription(page: WorkspacePage, entry: PageEntry): void {
  openEntryDetails(page, entry);
  void nextTick(() => taskDescriptionEditor.value?.focusEnd());
}
function beginEntryTagsEdit(entry: PageEntry): void {
  databaseTagsDraft.value = entryTags(entry).join(', ');
  editingTagsEntryId.value = entry.id;
  void nextTick(() => document.getElementById(`database-tags-${entry.id}`)?.focus({ preventScroll: true }));
}
function updateEntryTagsDraft(value: string | number): void {
  databaseTagsDraft.value = String(value);
}
function finishEntryTagsEdit(page: WorkspacePage, entry: PageEntry): void {
  if (editingTagsEntryId.value !== entry.id) return;
  const tags = parseEntryTags(databaseTagsDraft.value);
  entry.tags = tags;
  entry.tag = tags[0];
  editingTagsEntryId.value = null;
  touchPage(page);
}
function cancelEntryTagsEdit(entry: PageEntry): void {
  if (editingTagsEntryId.value === entry.id) editingTagsEntryId.value = null;
}
function updateDetailContent(value: string): void {
  if (!detailEntry.value) return;
  detailEntry.value.content = value;
  touchDetailEntry();
}
function touchDetailEntry(): void {
  if (detailPage.value) touchPage(detailPage.value);
}
function updateDetailTags(value: string): void {
  detailTagsDraft.value = value;
  if (!detailEntry.value) return;
  detailEntry.value.tags = parseEntryTags(value);
  detailEntry.value.tag = detailEntry.value.tags[0];
  touchDetailEntry();
}
function addDetailSubtask(): void {
  const title = newSubtaskTitle.value.trim();
  const entry = detailEntry.value;
  if (!entry) return;
  if (!title) {
    document.getElementById('entry-detail-new-subtask')?.focus();
    return;
  }
  if (entrySubtasks(entry).length >= 100) {
    notify('Límite de subtareas alcanzado', 'Cada tarea admite hasta 100 subtareas.', 'warning');
    return;
  }
  entry.subtasks = [...entrySubtasks(entry), { id: makeId(), title, done: false }];
  newSubtaskTitle.value = '';
  collapsedTableEntries.value = collapsedTableEntries.value.filter((id) => id !== entry.id);
  touchDetailEntry();
  void nextTick(() => document.getElementById('entry-detail-new-subtask')?.focus({ preventScroll: true }));
}
function focusNewSubtask(): void {
  void nextTick(() => document.getElementById('entry-detail-new-subtask')?.focus({ preventScroll: true }));
}
function setDetailSubtaskTitle(subtaskId: string, value: string): void {
  const subtask = detailEntry.value ? entrySubtasks(detailEntry.value).find((item) => item.id === subtaskId) : undefined;
  if (!subtask) return;
  subtask.title = value;
  touchDetailEntry();
}
function setDetailSubtaskDone(subtaskId: string, done: boolean): void {
  const subtask = detailEntry.value ? entrySubtasks(detailEntry.value).find((item) => item.id === subtaskId) : undefined;
  if (!subtask) return;
  subtask.done = done;
  touchDetailEntry();
}
function removeDetailSubtask(subtaskId: string): void {
  if (!detailEntry.value) return;
  detailEntry.value.subtasks = entrySubtasks(detailEntry.value).filter((subtask) => subtask.id !== subtaskId);
  touchDetailEntry();
  focusNewSubtask();
}
function clearCompletedSubtasks(): void {
  if (!detailEntry.value) return;
  detailEntry.value.subtasks = entrySubtasks(detailEntry.value).filter((subtask) => !subtask.done);
  touchDetailEntry();
  focusNewSubtask();
}
function setDetailPriority(value: string | readonly string[] | undefined): void {
  if (!detailEntry.value || typeof value !== 'string') return;
  if (value === 'Sin prioridad') detailEntry.value.priority = undefined;
  else if (TASK_PRIORITIES.includes(value as TaskPriority)) detailEntry.value.priority = value as TaskPriority;
  else return;
  touchDetailEntry();
}
function setDetailStatus(value: string | readonly string[] | undefined): void {
  if (!detailEntry.value || typeof value !== 'string' || !BOARD_STATUSES.includes(value as BoardStatus)) return;
  detailEntry.value.status = value as BoardStatus;
  touchDetailEntry();
}
function handleBoardDragStart(entry: PageEntry, event: DragEvent): void {
  draggedEntryId.value = entry.id;
  dropTargetEntryId.value = null;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', entry.id);
  }
}
function handleBoardDragOver(entryId: string, event: DragEvent): void {
  if (!draggedEntryId.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  dropTargetEntryId.value = entryId === draggedEntryId.value ? null : entryId;
}
function dropBoardEntry(status: BoardStatus, event: DragEvent, target?: PageEntry): void {
  const page = activePage.value;
  const entryId = draggedEntryId.value || event.dataTransfer?.getData('text/plain');
  if (!page || !entryId) return;
  if (target?.id === entryId) { handleBoardDragEnd(); return; }
  const fromIndex = page.entries.findIndex((entry) => entry.id === entryId);
  if (fromIndex < 0) return;
  const [moving] = page.entries.splice(fromIndex, 1);
  if (!moving) return;
  moving.status = status;
  const targetIndex = target ? page.entries.findIndex((entry) => entry.id === target.id) : -1;
  if (targetIndex >= 0 && target) {
    const targetElement = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-entry-id]');
    const bounds = targetElement?.getBoundingClientRect();
    const insertAfter = bounds ? event.clientY >= bounds.top + bounds.height / 2 : false;
    page.entries.splice(targetIndex + (insertAfter ? 1 : 0), 0, moving);
  } else {
    let insertAt = page.entries.length;
    for (let index = 0; index < page.entries.length; index += 1) {
      if (page.entries[index]?.status === status) insertAt = index + 1;
    }
    page.entries.splice(insertAt, 0, moving);
  }
  draggedEntryId.value = null;
  dropTargetEntryId.value = null;
  touchPage(page);
}
function handleBoardDragEnd(): void {
  draggedEntryId.value = null;
  dropTargetEntryId.value = null;
}
function entryDateLabel(entry: PageEntry): string {
  if (!entry.due) return 'Sin fecha';
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.due)) return new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' }).format(new Date(entry.due + 'T12:00:00'));
  return entry.due;
}
function entryCalendarDate(entry: PageEntry): Date | null {
  if (!entry.due) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(entry.due)) return new Date(entry.due + 'T12:00:00');
  const base = new Date();
  if (entry.due.toLocaleLowerCase('es') === 'hoy') return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12);
  if (entry.due.toLocaleLowerCase('es') === 'mañana') return new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1, 12);
  if (entry.due.toLocaleLowerCase('es') === 'ayer') return new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1, 12);
  const match = entry.due.match(/^(\d{1,2})\s+([a-záéíóúñ.]+)/i);
  if (!match) return null;
  const months: Record<string, number> = { ene: 0, enero: 0, feb: 1, febrero: 1, mar: 2, marzo: 2, abr: 3, abril: 3, may: 4, mayo: 4, jun: 5, junio: 5, jul: 6, julio: 6, ago: 7, agosto: 7, sep: 8, sept: 8, septiembre: 8, oct: 9, octubre: 9, nov: 10, noviembre: 10, dic: 11, diciembre: 11 };
  const month = months[match[2].toLocaleLowerCase('es').replace('.', '')];
  return month === undefined ? null : new Date(base.getFullYear(), month, Number(match[1]), 12);
}
function entriesForSelectedDate(page: WorkspacePage): PageEntry[] {
  const selected = selectedDate.value;
  if (!(selected instanceof Date)) return [];
  return page.entries.filter((entry) => {
    const date = entryCalendarDate(entry);
    return date?.toDateString() === selected.toDateString();
  });
}
function entryDoneChanged(page: WorkspacePage, entry: PageEntry, done: boolean): void {
  entry.done = done;
  entry.status = done ? 'Hecho' : 'Por hacer';
  touchPage(page);
}
function todayTaskChanged(): void { queueSave(); }
function removeToast(item: ToastItem): void { toasts.value = toasts.value.filter((toast) => toast.id !== item.id); }
function onGlobalKeydown(event: KeyboardEvent): void {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); openCreatePage(); }
  if (event.key === 'Escape') {
    mobileSidebarOpen.value = false;
    sidebarCollapsed.value = true;
    preferencesOpen.value = false;
    if (commandOpen.value) commandOpen.value = false;
  }
}
watch(preferences, (value) => {
  try { localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(value)); }
  catch { notify('No se guardaron los ajustes', 'El navegador no permitió guardar las preferencias.', 'warning'); }
}, { deep: true });
watch(databaseViewStates, (value) => {
  try { localStorage.setItem(DATABASE_VIEWS_STORAGE_KEY, JSON.stringify(value)); }
  catch { notify('No se guardaron las vistas', 'El navegador no permitió guardar las preferencias de esta tabla.', 'warning'); }
}, { deep: true });
onMounted(() => {
  window.addEventListener('keydown', onGlobalKeydown);
  window.addEventListener('popstate', syncPageFromHistory);
  persist();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onGlobalKeydown);
  window.removeEventListener('popstate', syncPageFromHistory);
  if (saveTimer !== undefined) window.clearTimeout(saveTimer);
  if (sidebarCloseTimer !== undefined) window.clearTimeout(sidebarCloseTimer);
});
</script>

<template>
  <div class="knote-shell" :data-density="preferences.density" :style="appPreferencesStyle">
    <button
      class="knote-edge-trigger"
      type="button"
      aria-label="Mostrar navegación"
      aria-controls="knote-navigation"
      :aria-expanded="!sidebarCollapsed"
      @pointerenter="revealSidebar"
      @focus="revealSidebar"
      @blur="handleSidebarFocusOut"
      @click="revealSidebar"
    />
    <Sidebar
      id="knote-navigation"
      v-model="selectedId"
      v-model:collapsed="sidebarCollapsed"
      v-model:mobile-open="mobileSidebarOpen"
      class="knote-sidebar"
      label="Navegación de KNote"
      :groups="sidebarGroups"
      variant="glass"
      collapsible="none"
      width="16.75rem"
      rail-width="4.25rem"
      mobile-breakpoint-label="Abrir navegación"
      shortcut="b"
      @pointerenter="revealSidebar"
      @pointerleave="handleSidebarPointerLeave"
      @focusin="revealSidebar"
      @focusout="handleSidebarFocusOut"
      @select="onSidebarSelect"
    >
      <template #header>
        <div class="knote-sidebar-header">
          <div class="knote-side-shortcuts">
            <Button variant="soft" color="neutral" size="sm" :prefix-icon="House" @click="goHome">Inicio</Button>
            <Button variant="soft" color="neutral" size="sm" :prefix-icon="MessageCircle" aria-label="Reuniones" title="Abrir reuniones" @click="setActive('folder-reuniones')" />
            <Button variant="soft" color="neutral" size="sm" :prefix-icon="NotebookPen" aria-label="Notas" title="Notas" @click="openCreatePage('doc')" />
            <Button variant="soft" color="neutral" size="sm" :prefix-icon="Search" aria-label="Buscar" title="Buscar" @click="commandOpen = true" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="knote-workspace-heading knote-workspace-heading--footer">
          <span class="knote-workspace-mark">K</span>
          <span><strong>Mi espacio</strong><small>Personal</small></span>
          <Button variant="soft" color="neutral" size="sm" :prefix-icon="Plus" aria-label="Crear una página" title="Crear una página" @click="openCreatePage()" />
          <Button variant="glass" color="neutral" size="sm" :prefix-icon="Settings2" aria-label="Personalizar espacio" title="Personalizar espacio" @click="preferencesOpen = true" />
        </div>
      </template>
    </Sidebar>

    <div class="knote-main" :class="{ 'knote-main--inspector': entryInspectorOpen && Boolean(detailEntry && detailPage) }">
      <header class="knote-topbar">
        <div class="knote-topbar-left">
          <Button class="knote-mobile-nav" variant="glass" color="neutral" size="sm" :prefix-icon="Menu" aria-label="Abrir navegación" @click="mobileSidebarOpen = true" />
          <Breadcrumb :items="breadcrumbItems" separator="slash" size="sm" aria-label="Ubicación actual" @navigate="goBreadcrumb" />
        </div>
        <div class="knote-topbar-actions">
          <Button v-if="activePage" variant="soft" color="neutral" size="sm" :prefix-icon="Share2" @click="copyCurrentLink">Compartir</Button>
          <Button v-if="activePage" variant="soft" color="neutral" size="sm" :prefix-icon="Star" :aria-label="activePage.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'" :title="activePage.favorite ? 'Quitar de favoritos' : 'Añadir a favoritos'" :class="{ 'knote-is-favorite': activePage.favorite }" @click="toggleFavorite(activePage)" />
          <DropdownMenu v-if="activePage" id="page-actions" label="Más acciones de página" align="end" variant="surface" :items="pageMenuItems" @select="onPageMenu">
            <template #trigger><Icon :icon="MoreHorizontal" size="sm" /></template>
          </DropdownMenu>
        </div>
      </header>

      <main :class="['knote-canvas', { 'knote-canvas--home': !activePage, 'knote-canvas--board': activePage?.type === 'board' || activePage?.type === 'database', 'knote-canvas--calendar': activePage?.type === 'calendar', 'knote-canvas--document': activePage?.type === 'doc' || activePage?.type === 'folder' }]">
        <template v-if="!activePage">
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

        <template v-else-if="activePage.type === 'folder'">
          <div v-if="activePage.banner" class="knote-page-banner" :style="pageBannerStyle(activePage)">
            <div class="knote-page-banner-actions">
              <Attachment :id="'banner-' + activePage.id" v-model="bannerFiles" label="Cambiar portada" accept="image/*" :max-size="10485760" size="sm" rounded="lg" hint="Se reduce para guardarse localmente." @update:model-value="setPageBanner" />
              <Button variant="glass" color="neutral" size="sm" :prefix-icon="Trash2" class="knote-banner-remove" @click="removePageBanner">Quitar portada</Button>
            </div>
          </div>
          <div v-else class="knote-page-banner-empty">
            <Attachment :id="'banner-' + activePage.id" v-model="bannerFiles" label="Añadir portada" accept="image/*" :max-size="10485760" size="sm" rounded="lg" hint="Opcional · se reduce para guardarse localmente." @update:model-value="setPageBanner" />
          </div>
          <header class="knote-page-heading">
            <div class="knote-page-glyph knote-page-glyph-controls">
              <PageIconPicker :id="'page-icon-' + activePage.id" :label="'Personalizar icono de ' + activePage.title" :icon="pageIcon(activePage)" :icon-id="activePage.icon" :options="pageIconOptions" :color="activePage.iconColor" @update:icon-id="setPageIcon" @update:color="setPageIconColor" />
            </div>
            <Badge variant="outline" color="secondary" size="sm">CARPETA</Badge>
            <h1>{{ activePage.title || 'Sin título' }}</h1>
            <p>{{ pageChildren(activePage.id).length }} páginas dentro de esta rama</p>
          </header>
          <section class="knote-section knote-folder-contents">
            <div class="knote-section-heading knote-section-heading--compact"><div><span class="knote-overline">EN ESTA CARPETA</span><h2>Páginas</h2></div><Button variant="soft" color="neutral" size="sm" :prefix-icon="Plus" @click="openCreatePage('doc', activePage.id)">Añadir</Button></div>
            <ul class="knote-folder-list">
              <li v-for="child in pageChildren(activePage.id)" :key="child.id">
                <span class="knote-list-icon" :style="pageIconStyle(child)"><Icon :icon="pageIcon(child)" size="sm" /></span>
                <Link :href="'#' + child.id" variant="text" size="md" @click.prevent="setActive(child.id)">{{ child.title || 'Sin título' }}</Link>
                <Badge variant="outline" color="secondary" size="sm">{{ pageTypeLabel(child.type) }}</Badge>
                <span class="knote-recent-time">{{ formatRelative(child.updatedAt) }}</span>
              </li>
              <li v-if="!pageChildren(activePage.id).length" class="knote-empty-row">Todavía no hay páginas en esta carpeta.</li>
            </ul>
          </section>
          <BlockEditor :key="activePage.id + '-folder-content'" v-model="activePage.content" :page-id="activePage.id" placeholder="Añade una nota sobre esta carpeta…" class="knote-folder-description" @update:model-value="touchPage(activePage)" />
        </template>

        <template v-else>
          <div v-if="activePage.banner" class="knote-page-banner" :style="pageBannerStyle(activePage)">
            <div class="knote-page-banner-actions">
              <Attachment :id="'banner-' + activePage.id" v-model="bannerFiles" label="Cambiar portada" accept="image/*" :max-size="10485760" size="sm" rounded="lg" hint="Se reduce para guardarse localmente." @update:model-value="setPageBanner" />
              <Button variant="glass" color="neutral" size="sm" :prefix-icon="Trash2" class="knote-banner-remove" @click="removePageBanner">Quitar portada</Button>
            </div>
          </div>
          <div v-else class="knote-page-banner-empty">
            <Attachment :id="'banner-' + activePage.id" v-model="bannerFiles" label="Añadir portada" accept="image/*" :max-size="10485760" size="sm" rounded="lg" hint="Opcional · se reduce para guardarse localmente." @update:model-value="setPageBanner" />
          </div>
          <header class="knote-page-heading knote-document-heading">
            <div class="knote-page-glyph knote-page-glyph-controls">
              <PageIconPicker :id="'page-icon-' + activePage.id" :label="'Personalizar icono de ' + activePage.title" :icon="pageIcon(activePage)" :icon-id="activePage.icon" :options="pageIconOptions" :color="activePage.iconColor" @update:icon-id="setPageIcon" @update:color="setPageIconColor" />
            </div>
            <Badge variant="outline" color="secondary" size="sm">{{ pageTypeLabel(activePage.type).toUpperCase() }}</Badge>
            <Input :id="'title-' + activePage.id" v-model="activePage.title" label="Título de la página" placeholder="Sin título" size="lg" variant="surface" class="knote-title-field" @update:model-value="touchPage(activePage)" />
          </header>

          <template v-if="activePage.type === 'doc'">
            <BlockEditor :key="activePage.id + '-document-content'" v-model="activePage.content" :page-id="activePage.id" placeholder="Empieza a escribir…" class="knote-document-editor" @update:model-value="touchPage(activePage)" />
          </template>
          <template v-else>
            <BlockEditor :key="activePage.id + '-page-content'" v-model="activePage.content" :page-id="activePage.id" :placeholder="activePage.type === 'calendar' ? 'Fechas y eventos de tu espacio…' : 'Organiza aquí el trabajo y las ideas del proyecto…'" class="knote-page-summary-editor" @update:model-value="touchPage(activePage)" />

            <template v-if="activePage.type === 'tasks'">
              <section class="knote-section knote-task-page">
                <div class="knote-section-heading knote-section-heading--compact"><div><span class="knote-overline">PROGRESO</span><h2>Pasos de la lista</h2></div><div class="knote-section-actions"><Badge variant="outline" color="secondary" size="sm">{{ activePage.entries.filter((entry) => entry.done).length }} / {{ activePage.entries.length }}</Badge><Button variant="glass" color="neutral" size="sm" :prefix-icon="Plus" @click="openEntryModal()">Añadir paso</Button></div></div>
                <Progress label="Progreso de la lista" :value="activePage.entries.length ? Math.round(activePage.entries.filter((entry) => entry.done).length / activePage.entries.length * 100) : 0" :show-value="false" color="info" size="sm" />
                <ul class="knote-today-list knote-page-task-list">
                  <li v-for="entry in activePage.entries" :key="entry.id">
                    <Icon :icon="entryIcon(entry)" size="sm" class="knote-task-list-icon" :style="entryIconStyle(entry)" aria-hidden="true" />
                    <Checkbox :id="'entry-' + entry.id" :model-value="Boolean(entry.done)" :label="entry.title" size="sm" variant="surface" @update:model-value="(done) => entryDoneChanged(activePage, entry, done)" />
                    <Badge v-if="entry.tag" variant="outline" color="secondary" size="sm">{{ entry.tag }}</Badge>
                    <Button variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="ArrowUpRight" :aria-label="'Editar ' + entry.title" :title="'Editar ' + entry.title" @click="openEntryDetails(activePage, entry)" />
                  </li>
                  <li v-if="!activePage.entries.length" class="knote-empty-row">Esta lista está vacía. Añade un paso para empezar.</li>
                </ul>
              </section>
            </template>

            <template v-else-if="activePage.type === 'calendar'">
              <div class="knote-calendar-view">
                <Calendar :id="'calendar-' + activePage.id" v-model="selectedDate" label="Calendario de la página" mode="single" locale="es-ES" :week-starts-on="1" :months="1" class="knote-calendar" />
                <section class="knote-calendar-agenda">
                  <div class="knote-agenda-heading"><div><span class="knote-overline">AGENDA</span><h2>{{ selectedDateLabel }}</h2></div><Button variant="glass" color="neutral" size="sm" :prefix-icon="Plus" @click="openEntryModal()">Añadir evento</Button></div>
                  <ul class="knote-agenda-list">
                    <li v-for="entry in entriesForSelectedDate(activePage)" :key="entry.id" tabindex="0" role="button" :aria-label="'Abrir ' + entry.title" @click="openEntryDetails(activePage, entry)" @keydown.enter.prevent="openEntryDetails(activePage, entry)"><span class="knote-agenda-dot" /><div><strong>{{ entry.title }}</strong><small>{{ entryDateLabel(entry) }}<span v-if="entryTags(entry).length"> · {{ entryTagsLabel(entry) }}</span></small></div></li>
                    <li v-if="!entriesForSelectedDate(activePage).length" class="knote-empty-row">No hay elementos para esta fecha.</li>
                  </ul>
                </section>
              </div>
            </template>

            <template v-else-if="activePage.type === 'board' || activePage.type === 'database'">
              <div class="knote-database-shell">
              <Tabs id="page-view-tabs" v-model="activeView" :items="activePage.type === 'database' ? databaseViewTabs : boardViewTabs" label="Vistas de la página" type="segmented" variant="glass" rounded="full" size="sm" :panel-surface="false" class="knote-view-tabs">
              <template #board>
                <div class="knote-board" aria-label="Tablero por estado">
                  <section v-for="status in visibleBoardStatuses" :key="status" class="knote-board-column" :data-status="status" @dragover.prevent @drop.prevent="dropBoardEntry(status, $event)">
                    <div class="knote-board-column-title"><span :class="'knote-status-mark knote-status-' + (status === 'Hecho' ? 'done' : status === 'En curso' ? 'active' : 'todo')"><Icon :icon="status === 'Hecho' ? CircleCheck : status === 'En curso' ? CircleDot : CircleDashed" size="xs" /></span><h2>{{ status }}</h2><Badge variant="outline" color="secondary" size="sm">{{ entriesForStatus(activePage, status).length }}</Badge><Button variant="glass" color="neutral" size="sm" shape="fab" :prefix-icon="Plus" :aria-label="'Añadir tarjeta en ' + status" :title="'Añadir tarjeta en ' + status" @click="openEntryModal(status)" /></div>
                    <div class="knote-board-cards">
                      <Card v-for="entry in entriesForStatus(activePage, status)" :key="entry.id" :data-entry-id="entry.id" variant="glass" padding="sm" class="knote-board-card" :class="{ 'knote-board-card--dragging': draggedEntryId === entry.id, 'knote-board-card--drop-target': dropTargetEntryId === entry.id }" role="button" tabindex="0" draggable="true" :aria-label="'Abrir ' + entry.title + '. Mantén y arrastra para cambiar su posición o estado.'" @click="openEntryDetails(activePage, entry)" @keydown.enter.prevent="openEntryDetails(activePage, entry)" @keydown.space.prevent="openEntryDetails(activePage, entry)" @dragstart.stop="handleBoardDragStart(entry, $event)" @dragover="handleBoardDragOver(entry.id, $event)" @drop.stop.prevent="dropBoardEntry(status, $event, entry)" @dragend="handleBoardDragEnd">
                        <h3 class="knote-board-card-heading"><Icon :icon="entryIcon(entry)" size="sm" :style="entryIconStyle(entry)" aria-hidden="true" /><span>{{ entry.title }}</span></h3>
                        <div v-if="entrySubtasks(entry).length" class="knote-board-subtasks" :aria-label="entrySubtasks(entry).length + ' subtareas'">
                          <span v-for="subtask in entrySubtasks(entry).slice(0, 3)" :key="subtask.id" :class="{ 'knote-subtask-is-done': subtask.done }"><Icon :icon="subtask.done ? CircleCheck : CircleDashed" size="xs" /><span>{{ subtask.title }}</span></span>
                          <small v-if="entrySubtasks(entry).length > 3">+{{ entrySubtasks(entry).length - 3 }} más</small>
                        </div>
                        <p v-else-if="entryDescription(entry)" class="knote-board-card-content">{{ entryDescription(entry) }}</p>
                        <div class="knote-board-card-meta">
                          <div class="knote-board-card-tags"><Badge v-for="tag in entryTags(entry)" :key="tag" variant="soft" color="secondary" size="sm">{{ tag }}</Badge></div>
                          <span v-if="entry.due" class="knote-board-card-date">{{ entryDateLabel(entry) }}</span>
                        </div>
                        <div v-if="entry.priority" class="knote-entry-priority" :data-priority="entry.priority"><span class="knote-priority-dot" />{{ entry.priority }} prioridad</div>
                      </Card>
                      <p v-if="!entriesForStatus(activePage, status).length" class="knote-column-empty" @dragover.prevent @drop.stop.prevent="dropBoardEntry(status, $event)">Suelta aquí una tarjeta o crea una nueva.</p>
                    </div>
                  </section>
                </div>
              </template>
              <template #table>
                <Table class="knote-database-table" :caption="'Elementos de ' + activePage.title" variant="surface" density="comfortable" :column-count="1 + visibleDatabaseProperties.length" :hover="false">
                  <template #header><thead><tr><th scope="col"><Icon :icon="FileText" size="xs" />Nombre</th><th v-if="visibleDatabaseProperties.includes('content')" class="knote-table-description-heading" scope="col"><Icon :icon="AlignLeft" size="xs" />Descripción</th><th v-if="visibleDatabaseProperties.includes('status')" class="knote-table-status-heading" scope="col"><Icon :icon="CircleDot" size="xs" />Estado</th><th v-if="visibleDatabaseProperties.includes('priority')" class="knote-table-priority-heading" scope="col"><Icon :icon="Filter" size="xs" />Prioridad</th><th v-if="visibleDatabaseProperties.includes('due')" class="knote-table-date-heading" scope="col"><Icon :icon="CalendarDays" size="xs" />Fecha</th><th v-if="visibleDatabaseProperties.includes('tags')" class="knote-table-tags-heading" scope="col"><Icon :icon="StickyNote" size="xs" />Etiquetas</th></tr></thead></template>
                  <tbody v-if="databaseEntries.length">
                    <template v-for="entry in databaseEntries" :key="entry.id">
                      <tr class="knote-table-entry-row" :class="{ 'knote-table-entry-row--selected': entryInspectorOpen && detailPageId === activePage.id && detailEntryId === entry.id }">
                        <th scope="row"><span class="knote-table-entry-title"><Button v-if="entrySubtasks(entry).length" variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="collapsedTableEntries.includes(entry.id) ? ChevronRight : ChevronDown" :aria-label="(collapsedTableEntries.includes(entry.id) ? 'Mostrar' : 'Ocultar') + ' subtareas de ' + entry.title" :title="(collapsedTableEntries.includes(entry.id) ? 'Mostrar' : 'Ocultar') + ' subtareas'" class="knote-table-entry-expand" @click.stop="toggleTableEntry(entry.id)" @keydown.enter.stop @keydown.space.stop /><Button v-else variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="Plus" :aria-label="'Añadir subtarea a ' + entry.title" :title="'Añadir subtarea a ' + entry.title" class="knote-table-entry-expand knote-table-entry-add" @click.stop="openTableSubtaskComposer(entry.id)" /><Button variant="glass" color="neutral" size="sm" class="knote-table-entry-open" :aria-label="'Abrir tarea ' + entry.title" @click="openEntryDetails(activePage, entry)"><Icon :icon="entryIcon(entry)" size="sm" :style="entryIconStyle(entry)" /><span class="knote-table-entry-name">{{ entry.title }}</span></Button></span></th>
                        <td v-if="visibleDatabaseProperties.includes('content')" class="knote-table-description-cell" @click.stop>
                          <Button
                            variant="soft"
                            color="neutral"
                            size="sm"
                            class="knote-table-cell-trigger knote-table-description-trigger"
                            :aria-label="'Editar descripción de ' + entry.title"
                            :title="entryDescription(entry) || 'Añadir una descripción'"
                            @click.stop="openEntryDescription(activePage, entry)"
                          ><span class="knote-table-description-preview">{{ entryDescription(entry) || 'Añadir descripción' }}</span></Button>
                        </td>
                        <td v-if="visibleDatabaseProperties.includes('status')" class="knote-table-property-cell knote-table-status-cell">
                          <Select :id="'database-entry-status-' + entry.id" :model-value="entry.status" :label="'Estado de ' + entry.title" :options="statusOptions" size="sm" variant="soft" rounded="full" class="knote-table-property-select" @update:model-value="(value) => setEntryStatus(activePage, entry, value)">
                            <template #selected="{ text }"><Badge variant="soft" :color="text === 'Hecho' ? 'success' : text === 'En curso' ? 'info' : 'secondary'" size="sm">{{ text }}</Badge></template>
                            <template #option="{ option }"><span class="knote-status-option" :data-status="option.value"><span class="knote-status-option-dot" />{{ option.label }}</span></template>
                          </Select>
                        </td>
                        <td v-if="visibleDatabaseProperties.includes('priority')" class="knote-table-property-cell knote-table-priority-cell">
                          <Select :id="'database-entry-priority-' + entry.id" :model-value="entry.priority || 'Sin prioridad'" :label="'Prioridad de ' + entry.title" :options="priorityCellOptions" size="sm" variant="soft" rounded="full" class="knote-table-property-select" @update:model-value="(value) => setEntryPriority(activePage, entry, value)">
                            <template #selected="{ text }"><span v-if="entry.priority" class="knote-entry-priority" :data-priority="entry.priority"><span class="knote-priority-dot" />{{ text }}</span><span v-else class="knote-table-unprioritized" title="Sin prioridad">{{ text }}</span></template>
                          </Select>
                        </td>
                        <td v-if="visibleDatabaseProperties.includes('due')" class="knote-table-date-cell" @click.stop>
                          <DatePicker
                            :id="'database-due-' + entry.id"
                            :model-value="entryCalendarDate(entry)"
                            :label="'Fecha de ' + entry.title"
                            locale="es-ES"
                            :display-format="{ day: 'numeric', month: 'short' }"
                            :placeholder="entry.due ? entryDateLabel(entry) : 'Añadir fecha'"
                            clear-label="Quitar fecha"
                            rounded="md"
                            class="knote-table-date-picker"
                            @update:model-value="(value) => updateEntryDueFromPicker(activePage, entry, value)"
                          />
                        </td>
                        <td v-if="visibleDatabaseProperties.includes('tags')" class="knote-table-tags-cell" @click.stop>
                          <Input
                            v-if="editingTagsEntryId === entry.id"
                            :id="'database-tags-' + entry.id"
                            :model-value="databaseTagsDraft"
                            :label="'Etiquetas de ' + entry.title"
                            placeholder="Diseño, pruebas…"
                            size="sm"
                            variant="surface"
                            class="knote-table-inline-tags"
                            @update:model-value="updateEntryTagsDraft"
                            @keydown.enter.stop.prevent="finishEntryTagsEdit(activePage, entry)"
                            @keydown.escape.stop.prevent="cancelEntryTagsEdit(entry)"
                            @blur="finishEntryTagsEdit(activePage, entry)"
                          />
                          <Button
                            v-else
                            variant="soft"
                            color="neutral"
                            size="sm"
                            class="knote-table-cell-trigger knote-table-tags-trigger"
                            :aria-label="'Editar etiquetas de ' + entry.title"
                            :title="entryTagsLabel(entry)"
                            @click.stop="beginEntryTagsEdit(entry)"
                          ><template v-if="entryTags(entry).length"><Badge v-for="tag in entryTags(entry).slice(0, 2)" :key="tag" variant="soft" color="secondary" size="sm">{{ tag }}</Badge><span v-if="entryTags(entry).length > 2" class="knote-table-tag-overflow">+{{ entryTags(entry).length - 2 }}</span></template><span v-else>Añadir etiqueta</span></Button>
                        </td>
                      </tr>
                      <tr v-for="subtask in (collapsedTableEntries.includes(entry.id) ? [] : entrySubtasks(entry))" :key="subtask.id" class="knote-table-subtask-row">
                        <th scope="row"><span class="knote-table-subtask-title"><Checkbox :id="'table-subtask-' + subtask.id" :model-value="subtask.done" :label="'Completar ' + subtask.title" size="sm" variant="surface" class="knote-table-subtask-check" @update:model-value="(done) => updateTableSubtask(activePage, subtask, { done })" /><Input :id="'table-subtask-title-' + subtask.id" :model-value="subtask.title" :label="'Subtarea de ' + entry.title" size="sm" variant="surface" class="knote-table-subtask-input" @update:model-value="(title) => updateTableSubtask(activePage, subtask, { title: String(title) })" /></span></th>
                        <td v-if="visibleDatabaseProperties.includes('content')" class="knote-table-description knote-table-description--empty">—</td>
                        <td v-if="visibleDatabaseProperties.includes('status')"><Badge variant="soft" :color="subtask.done ? 'success' : 'secondary'" size="sm">{{ subtask.done ? 'Hecho' : 'Pendiente' }}</Badge></td>
                        <td v-if="visibleDatabaseProperties.includes('priority')">—</td>
                        <td v-if="visibleDatabaseProperties.includes('due')">—</td>
                        <td v-if="visibleDatabaseProperties.includes('tags')">—</td>
                      </tr>
                      <tr v-if="!collapsedTableEntries.includes(entry.id) && (entrySubtasks(entry).length || tableSubtaskComposerId === entry.id)" :key="entry.id + '-add-subtask'" class="knote-table-add-subtask-row">
                        <td :colspan="1 + visibleDatabaseProperties.length"><span class="knote-table-add-subtask"><Icon :icon="Plus" size="xs" /><Input v-if="tableSubtaskComposerId === entry.id" :id="'table-new-subtask-' + entry.id" v-model="tableSubtaskDraft" :label="'Nueva subtarea de ' + entry.title" placeholder="Nueva subtarea · Intro para añadir" size="sm" variant="surface" class="knote-table-new-subtask-input" @keydown.enter.stop.prevent="addTableSubtask(activePage, entry)" @keydown.escape.stop.prevent="tableSubtaskComposerId = null" /><Button v-else variant="soft" color="neutral" size="sm" @click="openTableSubtaskComposer(entry.id)">Nueva subtarea</Button></span></td>
                      </tr>
                    </template>
                    <tr class="knote-table-new-entry-row"><td :colspan="1 + visibleDatabaseProperties.length"><span class="knote-table-new-entry"><Icon :icon="Plus" size="sm" /><Input id="table-new-entry" v-model="newTableEntryTitle" label="Nueva tarea" placeholder="Nueva tarea · Intro para crear" size="sm" variant="surface" class="knote-table-new-entry-input" @keydown.enter.stop.prevent="addTableEntry(activePage)" @keydown.escape.stop.prevent="newTableEntryTitle = ''" /></span></td></tr>
                  </tbody>
                  <tbody v-else><tr><td :colspan="1 + visibleDatabaseProperties.length" class="knote-empty-cell">{{ activePage.entries.length ? 'No hay elementos que coincidan con esos filtros.' : 'La tabla todavía no tiene elementos.' }}</td></tr><tr class="knote-table-new-entry-row"><td :colspan="1 + visibleDatabaseProperties.length"><span class="knote-table-new-entry"><Icon :icon="Plus" size="sm" /><Input id="table-new-entry" v-model="newTableEntryTitle" label="Nueva tarea" placeholder="Nueva tarea · Intro para crear" size="sm" variant="surface" class="knote-table-new-entry-input" @keydown.enter.stop.prevent="addTableEntry(activePage)" /></span></td></tr></tbody>
                </Table>
              </template>
              </Tabs>
              <div class="knote-database-toolbar">
                <span class="knote-database-count">{{ databaseEntryCount }} elementos</span>
                <div class="knote-database-tools">
                  <label class="knote-database-search"><Icon :icon="Search" size="sm" /><input v-model="databaseQuery" type="search" placeholder="Buscar" aria-label="Buscar elementos" /></label>
                  <Select id="database-status-filter" v-model="databaseStatusFilter" label="Filtrar por estado" :options="databaseStatusOptions" size="sm" variant="surface" class="knote-database-filter"><template #selected="{ text }"><span class="knote-database-select-value"><Icon :icon="Filter" size="sm" />{{ text }}</span></template></Select>
                  <DropdownMenu id="database-sort" label="Ordenar elementos" :items="databaseSortItems" side="bottom" align="end" variant="surface" rounded="lg" class="knote-database-menu" @select="handleDatabaseSort"><template #trigger><Icon :icon="ArrowUpDown" size="sm" /><span>Ordenar</span></template></DropdownMenu>
                  <DropdownMenu id="database-properties" label="Mostrar propiedades" :items="databasePropertyItems" side="bottom" align="end" variant="surface" rounded="lg" class="knote-database-menu" @select="handleDatabaseProperty"><template #trigger><Icon :icon="SlidersHorizontal" size="sm" /><span>Propiedades</span></template></DropdownMenu>
                  <Button variant="glass" color="neutral" size="sm" :prefix-icon="Plus" @click="activeView === 'table' ? focusNewTableEntry() : openEntryModal()">Nuevo</Button>
                </div>
              </div>
              </div>
            </template>
          </template>
        </template>
      </main>

      <aside v-if="entryInspectorOpen && detailEntry && detailPage" class="knote-entry-inspector" :aria-label="'Editar ' + detailEntry.title">
        <Card variant="surface" padding="none" class="knote-entry-inspector-card" role="region" aria-labelledby="entry-inspector-heading">
          <header class="knote-entry-inspector-header">
            <div><span class="knote-overline">DETALLE DE TAREA</span><small>{{ detailPage.title }}</small></div>
            <Button variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="X" aria-label="Cerrar panel de tarea" title="Cerrar panel" @click="entryInspectorOpen = false" />
          </header>
          <div ref="entryInspectorScroll" class="knote-entry-inspector-scroll">
            <div class="knote-entry-detail-title-row">
              <PageIconPicker :id="'entry-icon-' + detailEntry.id" :label="'Personalizar icono de ' + detailEntry.title" :icon="entryIcon(detailEntry)" :icon-id="detailEntry.icon" :options="pageIconOptions" :color="detailEntry.iconColor" subject="tarea" class="knote-entry-icon-picker" @update:icon-id="setDetailEntryIcon" @update:color="setDetailEntryIconColor" />
              <Input id="entry-detail-title" :model-value="detailEntry.title" label="Título de la tarea" placeholder="Sin título" size="lg" variant="surface" class="knote-entry-inspector-title" @update:model-value="updateDetailTitle" />
            </div>

            <section class="knote-inspector-section">
              <div class="knote-inspector-section-heading"><h2 id="entry-inspector-heading">Propiedades</h2><small>Información rápida para organizar la tarea.</small></div>
              <div class="knote-entry-detail-properties">
                <Select v-if="detailPage.type !== 'calendar' && detailPage.type !== 'tasks'" id="entry-detail-status" :model-value="detailEntry.status" label="Estado" :options="statusOptions" size="sm" variant="surface" @update:model-value="setDetailStatus" />
                <Select id="entry-detail-priority" :model-value="detailEntry.priority || 'Sin prioridad'" label="Prioridad" :options="priorityOptions" size="sm" variant="surface" @update:model-value="setDetailPriority" />
                <Input id="entry-detail-due" :model-value="entryDateInputValue(detailEntry)" label="Fecha" type="date" size="sm" variant="surface" @update:model-value="updateDetailDue" />
                <Input id="entry-detail-tags" :model-value="detailTagsDraft" label="Etiquetas" placeholder="Diseño, personal…" hint="Separa las etiquetas con comas." size="sm" variant="surface" @update:model-value="updateDetailTags" />
              </div>
            </section>

            <section class="knote-inspector-section knote-inspector-subtasks">
              <div class="knote-inspector-section-heading"><div><h2>Subtareas</h2><small>Marca cada paso o pulsa Intro para añadir otro.</small></div><div class="knote-subtask-tools"><Badge variant="outline" color="secondary" size="sm">{{ detailSubtaskProgress.done }} / {{ detailSubtaskProgress.total }}</Badge><Button v-if="detailSubtaskProgress.done" variant="soft" color="neutral" size="sm" :prefix-icon="Trash2" title="Quitar subtareas completadas" @click="clearCompletedSubtasks">Limpiar hechas</Button></div></div>
              <div class="knote-subtask-composer">
                <Input id="entry-detail-new-subtask" v-model="newSubtaskTitle" label="Escribe una subtarea" placeholder="Ej. Revisar el diseño" size="sm" variant="surface" @keydown.enter.prevent="addDetailSubtask" />
                <Button variant="glass" color="neutral" size="sm" :prefix-icon="Plus" aria-label="Añadir subtarea" title="Añadir subtarea" class="knote-subtask-add" @click="addDetailSubtask">Añadir</Button>
              </div>
              <ul v-if="entrySubtasks(detailEntry).length" class="knote-detail-subtask-list">
                <li v-for="(subtask, index) in entrySubtasks(detailEntry)" :key="subtask.id" class="knote-detail-subtask" :class="{ 'knote-detail-subtask--done': subtask.done }">
                  <Checkbox :id="'entry-subtask-check-' + subtask.id" :model-value="subtask.done" :label="'Marcar como hecha: ' + subtask.title" size="sm" variant="surface" class="knote-subtask-toggle" @update:model-value="(done) => setDetailSubtaskDone(subtask.id, done)" />
                  <Input :id="'entry-subtask-title-' + subtask.id" :model-value="subtask.title" :label="'Nombre de subtarea ' + (index + 1)" size="sm" variant="surface" class="knote-subtask-name" @update:model-value="(title) => setDetailSubtaskTitle(subtask.id, String(title))" @keydown.enter.stop.prevent="focusNewSubtask" />
                  <Button variant="soft" color="neutral" size="sm" shape="fab" :prefix-icon="Trash2" :aria-label="'Eliminar subtarea ' + subtask.title" title="Eliminar subtarea" class="knote-subtask-remove" @click="removeDetailSubtask(subtask.id)" />
                </li>
              </ul>
              <p v-else class="knote-subtask-empty">Todavía no hay subtareas en esta tarea.</p>
            </section>

            <section class="knote-inspector-section knote-entry-detail-content">
              <div class="knote-inspector-section-heading"><h2>Descripción</h2><small>Notas, contexto y bloques de contenido.</small></div>
              <BlockEditor ref="taskDescriptionEditor" :key="'detail-' + detailEntry.id" :model-value="detailEntry.content || ''" :page-id="'detail-' + detailEntry.id" placeholder="Escribe una descripción…" class="knote-task-detail-editor" @update:model-value="updateDetailContent" />
            </section>
          </div>
          <footer class="knote-entry-inspector-footer"><span class="knote-inspector-saved"><Icon :icon="Check" size="xs" />Guardado automático</span><span class="knote-inspector-actions"><Button variant="soft" color="neutral" size="sm" @click="duplicateDetailEntry">Duplicar</Button><Button variant="soft" color="destructive" size="sm" @click="deleteEntryModalOpen = true">Eliminar</Button></span></footer>
        </Card>
      </aside>

      <Modal id="delete-entry-dialog" v-model="deleteEntryModalOpen" title="Eliminar tarea" :description="'Se eliminará ' + (detailEntry?.title || 'esta tarea') + ' y todas sus subtareas.'" presentation="dialog" variant="surface" size="sm" close-label="Cancelar eliminación">
        <p class="knote-delete-entry-copy">Esta acción no se puede deshacer.</p>
        <template #footer="{ close }"><Button variant="soft" color="neutral" @click="close">Cancelar</Button><Button color="destructive" :prefix-icon="Trash2" @click="deleteDetailEntry">Eliminar tarea</Button></template>
      </Modal>

      <Modal id="create-page-dialog" v-model="createModalOpen" title="Crear una página" description="Elige el tipo y el lugar donde se guardará." presentation="dialog" variant="surface" size="lg" close-label="Cerrar creación de página">
        <div class="knote-create-form">
          <Input id="new-page-name" v-model="createTitle" label="Nombre de la página" placeholder="Ej. Ideas para el proyecto" size="md" variant="surface" @keydown.enter.prevent="submitNewPage()" />
          <div class="knote-create-type-label"><span>TIPO DE PÁGINA</span><Badge variant="outline" color="secondary" size="sm">{{ pageTypeLabel(createType) }}</Badge></div>
          <Tabs id="new-page-type-tabs" v-model="createType" :items="createTypeTabs" label="Tipo de página" type="segmented" variant="surface" size="sm" class="knote-create-tabs">
            <template #doc>Una página abierta para notas, ideas y texto.</template>
            <template #board>Un tablero con tareas agrupadas por estado.</template>
            <template #database>Una tabla de elementos que también puedes ver como tablero.</template>
            <template #calendar>Fechas y eventos de un vistazo.</template>
            <template #tasks>Una lista breve de pasos y objetivos.</template>
            <template #folder>Una rama para agrupar páginas y proyectos.</template>
          </Tabs>
          <p v-if="createParentId" class="knote-create-location"><Icon :icon="Folder" size="sm" /> Se guardará en <strong>{{ pages.find((page) => page.id === createParentId)?.title }}</strong></p>
          <p v-else class="knote-create-location"><Icon :icon="Inbox" size="sm" /> Se guardará en tu espacio privado.</p>
        </div>
        <template #footer="{ close }">
          <Button variant="soft" color="neutral" @click="close">Cancelar</Button>
          <Button :prefix-icon="Plus" @click="submitNewPage(close)">Crear página</Button>
        </template>
      </Modal>

      <Modal id="workspace-preferences" v-model="preferencesOpen" title="Personalizar tu espacio" description="Ajusta el cristal, el ancho de lectura y la densidad. Tus preferencias se guardan en este dispositivo." presentation="dialog" variant="glass" size="lg" close-label="Cerrar personalización">
        <Tabs id="workspace-preference-tabs" v-model="preferencesTab" :items="preferenceTabs" label="Ajustes de apariencia y lectura" type="underline" variant="glass" size="sm" :panel-surface="false" class="knote-settings-tabs">
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
                  <Button v-for="option in widthOptions" :key="option.id" variant="soft" color="neutral" size="sm" :aria-pressed="preferences.width === option.id" :class="{ 'knote-choice--selected': preferences.width === option.id }" @click="setPreference('width', option.id)">{{ option.label }}</Button>
                </div>
                <p class="knote-setting-hint">{{ widthOptions.find((option) => option.id === preferences.width)?.description }}</p>
              </section>
              <section class="knote-setting-section">
                <div><h3>Densidad de listas</h3><p>Elige cuánto espacio hay entre filas y tareas.</p></div>
                <div class="knote-setting-choices" role="group" aria-label="Densidad de listas">
                  <Button v-for="option in densityOptions" :key="option.id" variant="soft" color="neutral" size="sm" :aria-pressed="preferences.density === option.id" :class="{ 'knote-choice--selected': preferences.density === option.id }" @click="setPreference('density', option.id)">{{ option.label }}</Button>
                </div>
                <p class="knote-setting-hint">{{ densityOptions.find((option) => option.id === preferences.density)?.description }}</p>
              </section>
            </div>
          </template>
        </Tabs>
        <template #footer>
          <Button variant="soft" color="neutral" @click="resetPreferences">Restablecer</Button>
          <Button variant="glass" color="neutral" @click="preferencesOpen = false">Listo</Button>
        </template>
      </Modal>

      <Modal id="page-entry-dialog" v-model="entryModalOpen" :title="entryDialogTitle" description="Organiza el estado, la fecha y el grupo de este elemento." presentation="dialog" variant="glass" size="md" close-label="Cerrar elemento">
        <div class="knote-entry-form">
          <Input id="page-entry-title" v-model="entryTitle" label="Nombre" placeholder="Ej. Preparar el siguiente paso" required autofocus @keydown.enter.prevent="saveEntry()" />
          <Tabs v-if="activePage && activePage.type !== 'calendar' && activePage.type !== 'tasks'" id="page-entry-status" v-model="entryStatus" :items="entryStatusTabs" label="Estado del elemento" type="pills" variant="glass" size="sm" :panel-surface="false" />
          <div class="knote-entry-fields">
            <Input id="page-entry-due" v-model="entryDue" label="Fecha" placeholder="Hoy, 10 oct o AAAA-MM-DD" />
            <Input id="page-entry-tag" v-model="entryTag" label="Etiquetas" placeholder="Diseño, personal…" hint="Separa las etiquetas con comas." />
            <Select id="page-entry-priority" v-model="entryPriority" label="Prioridad" :options="priorityOptions" size="sm" variant="surface" />
          </div>
        </div>
        <template #footer>
          <Button variant="soft" color="neutral" @click="entryModalOpen = false">Cancelar</Button>
          <Button variant="glass" color="neutral" :prefix-icon="Check" @click="saveEntry()">Guardar</Button>
        </template>
      </Modal>

      <CommandMenu id="knote-command-menu" v-model="commandOpen" v-model:query="commandQuery" label="Buscar en KNote" title="Buscar en tu espacio" description="Encuentra páginas o crea una nueva sin salir del teclado." :groups="commandGroups" mode="dialog" variant="surface" size="md" placeholder="Buscar páginas y acciones…" hotkey="k" @select="onCommandSelect">
        <template #empty><p class="knote-command-empty">No encontramos esa página. Prueba con otro término o crea una nueva.</p></template>
      </CommandMenu>
      <ToastViewport v-model="toasts" position="bottom-end" label="Avisos de KNote" @dismiss="removeToast" />
    </div>
  </div>
</template>
