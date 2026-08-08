/**
 * Kubernetes Watch API client.
 *
 * Uses the K8s Watch protocol (?watch=true) which streams NDJSON events
 * over a long-lived HTTP connection. This gives real-time updates without
 * polling — the UI refreshes instantly when resources change in the cluster.
 */

export type WatchEventType = 'ADDED' | 'MODIFIED' | 'DELETED' | 'ERROR';

export interface WatchEvent<T = any> {
  type: WatchEventType;
  object: T;
}

export interface WatchHandle {
  close: () => void;
}

/**
 * Start watching a Kubernetes resource list. Calls `onEvent` for each
 * change (add, modify, delete) in real time.
 *
 * @param path   Full API path, e.g. /apis/postgresql.cnpg.io/v1/namespaces/default/clusters
 * @param onEvent  Callback for each watch event
 * @param onError  Callback for errors (will auto-reconnect after 3s)
 * @returns        Handle with close() to stop watching
 */
export function watchResource(
  path: string,
  onEvent: (event: WatchEvent) => void,
  onError?: (err: Error) => void,
): WatchHandle {
  let abortController = new AbortController();
  let stopped = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  async function connect() {
    if (stopped) return;

    const t = sessionStorage.getItem('access_token');
    const separator = path.includes('?') ? '&' : '?';
    const url = path + separator + 'watch=true';

    try {
      const response = await fetch(url, {
        signal: abortController.signal,
        headers: {
          ...(t ? { Authorization: 'Bearer ' + t } : {}),
        },
      });

      if (!response.ok || !response.body) {
        throw new Error('Watch failed: ' + response.status);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event: WatchEvent = JSON.parse(line);
            if (event.type === 'ERROR') {
              throw new Error(event.object?.message || 'Watch error');
            }
            onEvent(event);
          } catch (parseErr) {
            // Skip unparseable lines
          }
        }
      }
    } catch (err: any) {
      if (stopped || err.name === 'AbortError') return;
      onError?.(err);
    }

    // Auto-reconnect after 3 seconds
    if (!stopped) {
      reconnectTimer = setTimeout(() => {
        abortController = new AbortController();
        connect();
      }, 3000);
    }
  }

  connect();

  return {
    close() {
      stopped = true;
      abortController.abort();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    },
  };
}

const CNPG = 'apis/postgresql.cnpg.io/v1';

/**
 * Convenience: watch a CNPG resource type in a namespace.
 * Automatically manages the item list — adds, updates, and removes items in place.
 */
export function watchCNPGResource(
  resource: string,
  // undefined => cluster-scoped watch across every visible namespace.
  namespace: string | undefined,
  items: { value: any[] },
  onUpdate?: () => void,
): WatchHandle {
  return watchResource(
    namespace
      ? '/' + CNPG + '/namespaces/' + namespace + '/' + resource
      : '/' + CNPG + '/' + resource,
    (event) => {
      const obj = event.object;
      const idx = items.value.findIndex(
        (i: any) => i.metadata.uid === obj.metadata.uid,
      );

      switch (event.type) {
        case 'ADDED':
          if (idx === -1) items.value = [...items.value, obj];
          break;
        case 'MODIFIED':
          if (idx >= 0) {
            items.value[idx] = obj;
            items.value = [...items.value]; // trigger reactivity
          } else {
            items.value = [...items.value, obj];
          }
          break;
        case 'DELETED':
          if (idx >= 0) items.value = items.value.filter((_, i) => i !== idx);
          break;
      }
      onUpdate?.();
    },
  );
}
