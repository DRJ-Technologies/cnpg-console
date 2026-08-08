import { writable } from 'svelte/store';

/**
 * Sentinel for "every namespace I can see".
 *
 * The Kubernetes API already exposes cluster-scoped list/watch endpoints
 * (/apis/<group>/<version>/<resource>, with no /namespaces/<ns> segment), so
 * this is not a client-side merge of per-namespace calls — it is one request.
 *
 * '*' is safe as a sentinel because it is not a legal namespace name (RFC 1123
 * labels are lowercase alphanumerics and '-'), so it can never collide with a
 * real namespace returned by the API.
 */
export const ALL_NAMESPACES = '*';

export const currentNamespace = writable<string>('');
export const allNamespaces = writable<string[]>([]);

/**
 * Translate the selected namespace into the argument the API helpers expect:
 * `undefined` means cluster-scoped (all namespaces).
 */
export function nsScope(ns: string): string | undefined {
  return !ns || ns === ALL_NAMESPACES ? undefined : ns;
}
