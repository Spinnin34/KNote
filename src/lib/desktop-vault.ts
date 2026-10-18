import { invoke, isTauri } from '@tauri-apps/api/core';

export interface WorkspaceSnapshot {
  pages?: unknown;
  todayTasks?: unknown;
  preferences?: unknown;
  databaseViewStates?: unknown;
}

let initialSnapshot: WorkspaceSnapshot | null = null;
let bootstrapError: string | null = null;
let bootstrapped = false;

export function isDesktopRuntime(): boolean {
  return isTauri();
}

export async function bootstrapDesktopVault(): Promise<void> {
  if (!isDesktopRuntime()) return;
  try {
    initialSnapshot = await invoke<WorkspaceSnapshot | null>('load_workspace');
  } catch (error) {
    bootstrapError = error instanceof Error ? error.message : String(error);
  } finally {
    bootstrapped = true;
  }
}

export function getInitialWorkspaceValue<K extends keyof WorkspaceSnapshot>(key: K): WorkspaceSnapshot[K] {
  return initialSnapshot?.[key];
}

export function getDesktopVaultError(): string | null {
  return bootstrapError;
}

export function isDesktopVaultReady(): boolean {
  return !isDesktopRuntime() || (bootstrapped && !bootstrapError);
}

export async function saveDesktopWorkspace(snapshot: string): Promise<void> {
  if (!isDesktopRuntime()) return;
  if (!isDesktopVaultReady()) throw new Error(bootstrapError || 'El archivo local de KNote no está disponible.');
  await invoke('save_workspace', { snapshot });
}
