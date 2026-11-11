import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('../pages/LatestView.vue') },
    { path: '/blog', name: 'blog', component: () => import('../pages/LatestView.vue') },
    { path: '/projects', name: 'projects', component: () => import('../pages/ProjectsPage.vue') },
    { path: '/projects/:slug', name: 'project-case', component: () => import('../pages/ProjectCasePage.vue'), props: true },
    { path: '/blog/:slug', name: 'post', component: () => import('../pages/PostPage.vue'), props: true },
    { path: '/archives', name: 'archives', component: () => import('../pages/ArchivePage.vue') },
    { path: '/tags', name: 'tags', component: () => import('../pages/TagsPage.vue') },
    { path: '/about', name: 'about', component: () => import('../pages/AboutPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
