// adapter-static, not adapter-node.
//
// The Dockerfile serves `build/` as plain files from nginx
// (`COPY --from=builder /app/build /usr/share/nginx/html`). adapter-node emits
// a Node server bundle with no index.html at the root, so nginx's
// `try_files $uri $uri/ /index.html` fallback 404'd on every request and the
// app never rendered in a container. This app is a pure client-side SPA that
// talks to the Kubernetes API from the browser, so a static SPA build with a
// fallback document is the correct target.
import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      // Every route is resolved client-side; nginx serves this for unknown paths.
      fallback: 'index.html',
      precompress: false,
      strict: false,
    }),
    csrf: { trustedOrigins: ['localhost'] },
  },
};

export default config;
