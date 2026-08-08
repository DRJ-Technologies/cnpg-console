const CNPG = 'apis/postgresql.cnpg.io/v1';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const t = sessionStorage.getItem('access_token');
  const r = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: 'Bearer ' + t } : {}),
      ...opts?.headers,
    },
  });
  if (!r.ok) throw new Error('K8s ' + r.status + ': ' + (await r.text()));
  return r.json();
}

function crud(res: string) {
  return {
    list: (ns?: string) =>
      req<any>(ns ? '/' + CNPG + '/namespaces/' + ns + '/' + res : '/' + CNPG + '/' + res),
    get: (ns: string, n: string) =>
      req<any>('/' + CNPG + '/namespaces/' + ns + '/' + res + '/' + n),
    create: (ns: string, body: any) =>
      req<any>('/' + CNPG + '/namespaces/' + ns + '/' + res, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    update: (ns: string, n: string, body: any) =>
      req<any>('/' + CNPG + '/namespaces/' + ns + '/' + res + '/' + n, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
    patch: (ns: string, n: string, body: any) =>
      req<any>('/' + CNPG + '/namespaces/' + ns + '/' + res + '/' + n, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/merge-patch+json' },
        body: JSON.stringify(body),
      }),
    del: (ns: string, n: string) =>
      req<any>('/' + CNPG + '/namespaces/' + ns + '/' + res + '/' + n, {
        method: 'DELETE',
      }),
  };
}

function clusterScopedCrud(res: string) {
  return {
    list: () => req<any>('/' + CNPG + '/' + res),
    get: (n: string) => req<any>('/' + CNPG + '/' + res + '/' + n),
    create: (body: any) =>
      req<any>('/' + CNPG + '/' + res, { method: 'POST', body: JSON.stringify(body) }),
    update: (n: string, body: any) =>
      req<any>('/' + CNPG + '/' + res + '/' + n, { method: 'PUT', body: JSON.stringify(body) }),
    del: (n: string) =>
      req<any>('/' + CNPG + '/' + res + '/' + n, { method: 'DELETE' }),
  };
}

export const k8s = {
  // CNPG resources
  clusters: crud('clusters'),
  backups: crud('backups'),
  scheduledbackups: crud('scheduledbackups'),
  poolers: crud('poolers'),
  databases: crud('databases'),
  publications: crud('publications'),
  subscriptions: crud('subscriptions'),
  imagecatalogs: crud('imagecatalogs'),
  clusterimagecatalogs: clusterScopedCrud('clusterimagecatalogs'),

  // Core K8s resources
  listNamespaces: () => req<any>('/api/v1/namespaces'),
  // undefined ns => cluster-scoped (/api/v1/pods), i.e. all namespaces.
  listPods: (ns: string | undefined, labelSelector?: string) =>
    req<any>(
      (ns ? '/api/v1/namespaces/' + ns + '/pods' : '/api/v1/pods') +
        (labelSelector ? '?labelSelector=' + encodeURIComponent(labelSelector) : ''),
    ),
  getPodLogs: (ns: string, pod: string, container?: string, tailLines?: number) =>
    req<string>(
      '/api/v1/namespaces/' +
        ns +
        '/pods/' +
        pod +
        '/log?tailLines=' +
        (tailLines || 100) +
        (container ? '&container=' + container : ''),
    ),
  listEvents: (ns: string | undefined, fieldSelector?: string) =>
    req<any>(
      (ns ? '/api/v1/namespaces/' + ns + '/events' : '/api/v1/events') +
        (fieldSelector ? '?fieldSelector=' + encodeURIComponent(fieldSelector) : ''),
    ),
  listServices: (ns: string | undefined, labelSelector?: string) =>
    req<any>(
      (ns ? '/api/v1/namespaces/' + ns + '/services' : '/api/v1/services') +
        (labelSelector ? '?labelSelector=' + encodeURIComponent(labelSelector) : ''),
    ),
  listSecrets: (ns: string, labelSelector?: string) =>
    req<any>(
      '/api/v1/namespaces/' + ns + '/secrets' + (labelSelector ? '?labelSelector=' + encodeURIComponent(labelSelector) : ''),
    ),
  listPVCs: (ns: string, labelSelector?: string) =>
    req<any>(
      '/api/v1/namespaces/' + ns + '/persistentvolumeclaims' + (labelSelector ? '?labelSelector=' + encodeURIComponent(labelSelector) : ''),
    ),
  listStorageClasses: () => req<any>('/apis/storage.k8s.io/v1/storageclasses'),
  listVolumeSnapshots: (ns: string) =>
    req<any>('/apis/snapshot.storage.k8s.io/v1/namespaces/' + ns + '/volumesnapshots'),
};
