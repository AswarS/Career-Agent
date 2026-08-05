import { createRouter, createWebHistory } from 'vue-router';
import AppShell from './AppShell.vue';
import ArtifactsPage from '../pages/ArtifactsPage.vue';
import AuthPage from '../pages/AuthPage.vue';
import ConversationLandingPage from '../pages/ConversationLandingPage.vue';
import ConversationWorkspacePage from '../pages/ConversationWorkspacePage.vue';
import ProfilePage from '../pages/ProfilePage.vue';
import PraxisSsoPage from '../pages/PraxisSsoPage.vue';
import SettingsPage from '../pages/SettingsPage.vue';
import { useAuthStore } from '../stores/auth';
import { PRAXIS_SSO_ENTRY_PATH, resolveAuthNavigation } from './authNavigation';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/auth',
      name: 'auth',
      component: AuthPage,
      meta: {
        public: true,
      },
    },
    {
      path: PRAXIS_SSO_ENTRY_PATH,
      name: 'praxis-sso',
      component: PraxisSsoPage,
    },
    {
      path: '/',
      component: AppShell,
      children: [
        {
          path: '',
          name: 'home',
          component: ConversationLandingPage,
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

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  await authStore.initialize();

  return resolveAuthNavigation({
    isAuthenticated: authStore.isAuthenticated,
    isPublic: Boolean(to.meta.public),
    fullPath: to.fullPath,
    redirect: to.query.redirect,
  });
});
