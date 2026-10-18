export type PageType = 'folder' | 'doc' | 'code' | 'board' | 'database' | 'calendar' | 'tasks';
export type BoardStatus = 'Por hacer' | 'En curso' | 'Hecho';
export type TaskPriority = 'Baja' | 'Media' | 'Alta' | 'Urgente';
export type DatabaseProperty = 'content' | 'status' | 'priority' | 'due' | 'tags';
export type DatabaseSort = 'manual' | 'title' | 'due' | 'priority';
export type DatabaseFilter = 'Todas' | BoardStatus;
export interface DatabaseViewState {
  view: 'board' | 'table'; query: string; filter: DatabaseFilter; sort: DatabaseSort;
  properties: DatabaseProperty[]; collapsedEntryIds: string[];
}
export interface PageSubtask { id: string; title: string; done: boolean }
export interface PageEntry {
  id: string; title: string; status: BoardStatus; due?: string; tag?: string; tags?: string[];
  priority?: TaskPriority; content?: string; subtasks?: PageSubtask[]; done?: boolean;
  icon?: string; iconColor?: string;
}
export interface WorkspacePage {
  id: string; title: string; type: PageType; parentId: string | null; content: string;
  favorite: boolean; updatedAt: number; createdAt: number; entries: PageEntry[]; icon?: string; iconColor?: string; banner?: string;
}
export interface TodayTask { id: string; title: string; done: boolean; group: string }
export type GlassStrength = 'soft' | 'balanced' | 'deep';
export type CanvasWidth = 'compact' | 'standard' | 'wide';
export type ReadingDensity = 'comfortable' | 'compact';
export interface WorkspacePreferences { glass: GlassStrength; width: CanvasWidth; density: ReadingDensity }
