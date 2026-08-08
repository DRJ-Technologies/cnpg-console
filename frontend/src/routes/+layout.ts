// Pure client-side SPA: there is no server at runtime (nginx serves static
// files), and every page depends on a browser-held bearer token, so nothing
// can be rendered or prerendered ahead of time.
export const ssr = false;
export const prerender = false;
export const trailingSlash = 'ignore';
