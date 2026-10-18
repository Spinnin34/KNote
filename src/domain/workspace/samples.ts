import type { TodayTask, WorkspacePage } from '@/domain/workspace/types';

const now = Date.now();
const dayMs = 86400000;
export const samplePages: WorkspacePage[] = [
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
    { id: 'reading-1', title: 'El diseño de las cosas cotidianas', status: 'En curso', tag: 'Diseño', tags: ['Diseño', 'Libro'] },
    { id: 'reading-2', title: 'Notas sobre herramientas tranquilas', status: 'Por hacer', tag: 'Ideas', tags: ['Ideas', 'Artículo'] },
    { id: 'reading-3', title: 'Un sistema para recordar mejor', status: 'Hecho', tag: 'Escritura', tags: ['Escritura', 'Ensayo'] },
  ] },
  { id: 'page-tasks', title: 'Objetivos de octubre', type: 'tasks', parentId: 'folder-personal', content: 'Pequeños pasos para un mes con foco.', favorite: false, createdAt: now - 2 * dayMs, updatedAt: now - 2 * dayMs, entries: [
    { id: 'goal-1', title: 'Terminar la primera versión de KNote', status: 'En curso', done: false, tag: 'KNote' },
    { id: 'goal-2', title: 'Reservar tiempo para leer', status: 'En curso', done: true, tag: 'Personal' },
    { id: 'goal-3', title: 'Probar una idea con usuarios', status: 'Por hacer', done: false, tag: 'BiteCraft' },
  ] },
];
export const sampleTodayTasks: TodayTask[] = [
  { id: 'today-1', title: 'Revisar el tablero de KNote', done: true, group: 'KNote' },
  { id: 'today-2', title: 'Escribir las ideas de la reunión', done: false, group: 'Reuniones' },
  { id: 'today-3', title: 'Elegir el siguiente experimento de BiteCraft', done: false, group: 'BiteCraft' },
];
