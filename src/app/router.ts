import { createRouter, createWebHistory } from 'vue-router';
import AppShell from './AppShell.vue';
import ArtifactsPage from '../pages/ArtifactsPage.vue';
import ConversationWorkspacePage from '../pages/ConversationWorkspacePage.vue';
import ProfilePage from '../pages/ProfilePage.vue';
import SettingsPage from '../pages/SettingsPage.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      component: AppShell,
      children: [
        {
          path: '',
          redirect: '/threads/thread-001',
        },
        {
          path: 'threads/:threadId',
          name: 'thread',
          component: ConversationWorkspacePage,
          props: true,
        },
        {
          path: 'profile',
          name: 'profile',
          component: ProfilePage,
        },
        {
          path: 'artifacts',
          name: 'artifacts',
          component: ArtifactsPage,
        },
        {
          path: 'settings',
          name: 'settings',
          component: SettingsPage,
        },
      ],
    },
  ],
});
