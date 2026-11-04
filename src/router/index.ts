import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: () => import('../pages/HomePage.vue') },
    { path: '/blog', name: 'blog', component: () => import('../pages/BlogPage.vue') },
    { path: '/blog/:slug', name: 'post', component: () => import('../pages/PostPage.vue'), props: true },
    { path: '/archives', name: 'archives', component: () => import('../pages/ArchivePage.vue') },
    { path: '/about', name: 'about', component: () => import('../pages/AboutPage.vue') },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

export default router
