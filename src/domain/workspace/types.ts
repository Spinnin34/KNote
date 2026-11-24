export type PageType = 'folder' | 'doc' | 'code' | 'board' | 'database' | 'calendar' | 'tasks';
export type BoardStatus = 'Por hacer' | 'En curso' | 'Hecho';
export type TaskPriority = 'Baja' | 'Media' | 'Alta' | 'Urgente';
export type DatabaseProperty = 'content' | 'status' | 'priority' | 'due' | 'tags';
export type DatabaseSort = 'manual' | 'title' | 'title-desc' | 'due' | 'due-desc' | 'priority' | 'status';
export type DatabaseFilter = 'Todas' | BoardStatus;
export interface DatabaseViewState {
  view: 'board' | 'table'; query: string; filter: DatabaseFilter; sort: DatabaseSort;
  columnOrder?: string[]; columnWidths?: Record<string, number>;
  properties: DatabaseProperty[]; hiddenFields?: string[]; collapsedEntryIds: string[];
}
export interface DatabaseField { id: string; name: string; type: 'text' | 'number' | 'checkbox' }
export interface PageSubtask extends PageEntry { done: boolean }
export interface PageEntry {
  id: string; title: string; status: BoardStatus; due?: string; tag?: string; tags?: string[];
  fields?: Record<string, string | boolean>; priority?: TaskPriority; content?: string; subtasks?: PageSubtask[]; done?: boolean;
  icon?: string; iconColor?: string;
}
export interface WorkspacePage {
  id: string; title: string; type: PageType; parentId: string | null; content: string;
  favorite: boolean; updatedAt: number; createdAt: number; entries: PageEntry[]; tagOptions?: string[]; fields?: DatabaseField[]; icon?: string; iconColor?: string; banner?: string;
}
export interface TodayTask { id: string; title: string; done: boolean; group: string }
export type GlassStrength = 'soft' | 'balanced' | 'deep';
export type CanvasWidth = 'compact' | 'standard' | 'wide';
export type ReadingDensity = 'comfortable' | 'compact';
export interface WorkspacePreferences { glass: GlassStrength; width: CanvasWidth; density: ReadingDensity }
