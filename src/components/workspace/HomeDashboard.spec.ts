import { mount } from '@vue/test-utils';
import { FileText } from '@lucide/vue';
import { describe, expect, it } from 'vitest';
import HomeDashboard from '@/components/workspace/HomeDashboard.vue';
import type { WorkspacePage } from '@/domain/workspace/types';

const project: WorkspacePage = {
  id: 'project-new',
  title: 'Proyecto nuevo',
  type: 'board',
  parentId: null,
  content: '',
  favorite: false,
  createdAt: 1,
  updatedAt: 1,
  entries: [],
};

const recentFolder: WorkspacePage = {
  ...project,
  id: 'folder-work',
  title: 'Trabajo',
  type: 'folder',
};

function mountDashboard() {
  return mount(HomeDashboard, {
    props: {
      dateLabel: 'sábado, 31 de octubre',
      greeting: 'Buenos días',
      homeTasksRemaining: 1,
      pageCount: 1,
      favoriteCount: 0,
      todayDoneCount: 0,
      todayTasks: [{ id: 'today-1', title: 'Revisar el espacio', done: false, group: 'Trabajo' }],
      recentPages: [project],
      recentFolder,
      focusProject: project,
      projectCompletion: 0,
      pageIcon: () => FileText,
      pageIconStyle: () => ({}),
      pageTypeLabel: (type: string) => type,
      formatRelative: () => 'hace un momento',
      quickCapture: '',
    },
  });
}

describe('HomeDashboard', () => {
  it('uses workspace data instead of personal or sample names', () => {
    const wrapper = mountDashboard();

    expect(wrapper.text()).toContain('Buenos días');
    expect(wrapper.text()).toContain('Proyecto nuevo');
    expect(wrapper.text()).not.toContain('Ahmed');
    expect(wrapper.text()).not.toContain('BiteCraft');
    expect(wrapper.text()).not.toContain('Abyss Ideas');
  });

  it('navigates to the supplied recent folder and project', async () => {
    const wrapper = mountDashboard();

    await wrapper.get('a[href="#folder-work"]').trigger('click');
    await wrapper.get('a[href="#project-new"]').trigger('click');

    expect(wrapper.emitted('select-page')).toEqual([['folder-work'], ['project-new']]);
  });

  it('emits a task update without mutating a prop', async () => {
    const wrapper = mountDashboard();

    await wrapper.get('input[type="checkbox"]').setValue(true);

    expect(wrapper.emitted('today-task-changed')).toEqual([['today-1', true]]);
    expect(wrapper.props('todayTasks')[0]?.done).toBe(false);
  });
});
