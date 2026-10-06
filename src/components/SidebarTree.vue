<script setup lang="ts">
import { ChevronDown, ChevronRight } from '@lucide/vue';
import Button from '@/components/ui/Button.vue';
import Icon from '@/components/ui/Icon.vue';
import type { SidebarCollapse, SidebarItem } from '@/components/ui/Sidebar.vue';

defineOptions({ name: 'SidebarTree' });

const props = defineProps<{
  items: readonly SidebarItem[];
  activeId: string;
  collapsed: boolean;
  collapsible: SidebarCollapse;
  expanded: ReadonlySet<string>;
  itemClasses: (item: SidebarItem) => string;
  labelClasses: string;
}>();

const emit = defineEmits<{ select: [item: SidebarItem]; open: [item: SidebarItem] }>();

function hasChildren(item: SidebarItem): boolean {
  return Boolean(item.children?.length);
}
</script>

<template>
  <ul class="knote-sidebar-tree space-y-balsa-3xs">
    <li v-for="item in props.items" :key="item.id">
      <div class="knote-tree-row" :data-has-children="hasChildren(item) ? 'true' : 'false'">
        <component
          :is="item.href && !hasChildren(item) ? 'a' : 'button'"
          :href="item.href"
          :type="item.href && !hasChildren(item) ? undefined : 'button'"
          :disabled="item.disabled"
          :aria-current="props.activeId === item.id ? 'page' : undefined"
          :class="[props.itemClasses(item), 'knote-tree-link']"
          :style="item.iconColor ? { '--knote-item-icon-color': item.iconColor } : undefined"
          :title="props.collapsed ? item.label : undefined"
          @click="hasChildren(item) ? emit('open', item) : emit('select', item)"
        >
          <span v-if="item.icon" class="knote-tree-icon-wrap" aria-hidden="true"><Icon :icon="item.icon" size="md" class="knote-tree-icon shrink-0" /></span>
          <span :class="props.labelClasses">{{ item.label }}</span>
          <span v-if="item.badge && !(props.collapsed && props.collapsible === 'rail')" class="text-xs text-balsa-muted-foreground">{{ item.badge }}</span>
        </component>
        <Button
          v-if="hasChildren(item) && !(props.collapsed && props.collapsible === 'rail')"
          variant="glass"
          color="neutral"
          size="sm"
          shape="fab"
          class="knote-tree-expand"
          :prefix-icon="props.expanded.has(item.id) ? ChevronDown : ChevronRight"
          :aria-label="(props.expanded.has(item.id) ? 'Contraer ' : 'Expandir ') + item.label"
          :aria-expanded="props.expanded.has(item.id)"
          @click.stop="emit('select', item)"
        />
      </div>

      <SidebarTree
        v-if="hasChildren(item) && props.expanded.has(item.id) && !(props.collapsed && props.collapsible === 'rail')"
        :items="item.children!"
        :active-id="props.activeId"
        :collapsed="props.collapsed"
        :collapsible="props.collapsible"
        :expanded="props.expanded"
        :item-classes="props.itemClasses"
        :label-classes="props.labelClasses"
        class="ml-balsa-xl mt-balsa-3xs border-l border-balsa-border pl-balsa-xs"
        @select="emit('select', $event)"
        @open="emit('open', $event)"
      />
    </li>
  </ul>
</template>
