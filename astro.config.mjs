// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

// Secrets are read from process.env at request time — which in production is
// the host's environment, and in development is nothing at all, because Astro
// puts .env on import.meta.env rather than process.env. Loading it here means
// `pnpm dev` exercises the same code path the deployment does instead of
// silently taking the not-configured branch of every feature.
if (process.env.NODE_ENV !== 'production') {
  try {
    process.loadEnvFile('.env');
  } catch {
    /* no .env — the site runs fine without one */
  }
}

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
  // Dev only. The built standalone server takes HOST and PORT from the
  // environment, which is how the container binds 0.0.0.0.
  server: { host: '127.0.0.1', port: 4321 },
  // Astro's cross-origin form check compares the browser's Origin against an
  // origin it derives itself, and the Node adapter takes the scheme from the
  // socket — it ignores x-forwarded-proto. Anywhere TLS terminates at an edge
  // or a proxy the browser sends https, the adapter builds http, and every
  // form on the site returns 403. Confirmed against the adapter source and by
  // replaying a proxied request at a production build. No proxy configuration
  // fixes it, which is why this line exists.
  //
  // It is safe here for a reason specific to this site, not as a general rule.
  // The check defends against a forged cross-site request riding an ambient
  // credential; there are no accounts, no sessions and no cookies here, so
  // there is nothing to ride. A forged POST does exactly what an honest one
  // does — add a row to a queue a person reads. What actually protects those
  // endpoints is the per-IP rate limit, the honeypot and the validation, and
  // none of them depend on this setting.
  //
  // Revisit the day anything here sets a cookie.
  security: { checkOrigin: false },
  vite: {
    plugins: [tailwindcss()],
  },
});
