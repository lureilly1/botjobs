// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Server-rendered on purpose. Job and bot pages are the whole SEO bet, so they
// must be real HTML on first request — no client framework, no hydration, no
// content that only exists after JavaScript runs.
//
// React is present ONLY for the handful of genuinely interactive islands
// (submit form, search, the homepage intent box). Every content page ships
// zero JS. If you find yourself adding `client:load` to a page component,
// that is the signal you have taken a wrong turn.
export default defineConfig({
  site: 'https://botjobs.dev',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  server: { host: '127.0.0.1', port: 4321 },
  vite: {
    plugins: [tailwindcss()],
  },
});
