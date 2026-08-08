import { writable, get } from 'svelte/store';

/**
 * Kubernetes cluster selection.
 *
 * The console talks to more than one Kubernetes cluster. Rather than running a
 * separate deployment per cluster, every API call is prefixed with
 * /k8s/<key>/ and nginx maps each key to that cluster's API server. The
 * browser only ever sees this origin, and the user's OIDC bearer token is
 * forwarded unchanged — so each cluster authorizes the real user through its
 * own OIDC provider and RBAC. A cluster the user has no binding on simply
 * returns 403; there is no shared credential that could leak access across
 * clusters.
 *
 * The list is served from /config.json so adding a cluster is a ConfigMap
 * change plus an nginx route, not an image rebuild.
 */
export interface ClusterOption {
  /** URL-safe key; must match the nginx location and [a-z0-9-]+ */
  key: string;
  /** Human label for the picker */
  label: string;
}

export const clusters = writable<ClusterOption[]>([]);
export const currentCluster = writable<string>('');

const LAST_KEY = 'cnpg_console_cluster';

export function initClusters(list: ClusterOption[]) {
  clusters.set(list);
  if (!list.length) return;
  const remembered = localStorage.getItem(LAST_KEY);
  const valid = remembered && list.some((c) => c.key === remembered);
  currentCluster.set(valid ? (remembered as string) : list[0].key);
}

export function selectCluster(key: string) {
  currentCluster.set(key);
  localStorage.setItem(LAST_KEY, key);
}

/**
 * Prefix a Kubernetes API path with the selected cluster.
 * Returns the path unchanged when no cluster is configured, which keeps
 * single-cluster installs (and `npm run dev` against kubectl proxy) working.
 */
export function apiPath(path: string): string {
  const c = get(currentCluster);
  if (!c) return path;
  return '/k8s/' + c + (path.startsWith('/') ? path : '/' + path);
}
