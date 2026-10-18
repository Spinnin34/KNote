import { createApp } from 'vue';
import App from './App.vue';
import './style.css';
import './styles/karmancos-app.css';
import { karmancosTheme } from '@/themes/karmancos';
import { createDesignThemeStore } from '@/theme/theme-store';
import { bootstrapDesktopVault, isDesktopRuntime } from '@/lib/desktop-vault';

await bootstrapDesktopVault();

const designThemeStore = createDesignThemeStore({
  themes: [karmancosTheme],
  ...(isDesktopRuntime() ? { storage: null } : {}),
});
designThemeStore.selectTheme(karmancosTheme.id);

createApp(App).mount('#app');
