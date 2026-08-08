<script lang="ts">
  import { k8s } from '$lib/api/kubernetes';
  import { currentNamespace, nsScope } from '$lib/stores/namespace';
  import { watchCNPGResource, type WatchHandle } from '$lib/api/watch';
  import StatusBadge from '$lib/components/StatusBadge.svelte';

  let clusters: any[] = $state([]);
  let events: any[] = $state([]);
  let pods: any[] = $state([]);
  let loading = $state(true);
  let tab: 'overview' | 'events' | 'pods' = $state('overview');
  let watcher: WatchHandle | null = null;
  let selectedPod = $state('');
  let podLogs = $state('');
  let logsLoading = $state(false);

  $effect(() => {
    if ($currentNamespace) load();
    return () => { watcher?.close(); };
  });

  async function load() {
    loading = true;
    watcher?.close();
    // undefined => cluster-scoped list/watch across all namespaces
    const ns = nsScope($currentNamespace);
    
    try {
      const [c, e, p] = await Promise.all([
        k8s.clusters.list(ns),
        k8s.listEvents(ns),
        k8s.listPods(ns, 'cnpg.io/cluster'),
      ]);
      clusters = c.items || [];
      events = (e.items || [])
        .sort((a: any, b: any) =>
          new Date(b.lastTimestamp || b.metadata.creationTimestamp).getTime() -
          new Date(a.lastTimestamp || a.metadata.creationTimestamp).getTime()
        )
        .slice(0, 100);
      pods = p.items || [];
      // Real-time cluster status updates
      const items = { get value() { return clusters; }, set value(v) { clusters = v; } };
      watcher = watchCNPGResource('clusters', ns, items);
    } catch {}
    loading = false;
  }

  async function fetchLogs(podName: string) {
    selectedPod = podName;
    logsLoading = true;
    try {
      const result = await k8s.getPodLogs($currentNamespace, podName, 'postgres', 200);
      podLogs = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
    } catch (e: any) {
      podLogs = 'Error fetching logs: ' + e.message;
    }
    logsLoading = false;
  }

  function formatDate(d?: string) { return d ? new Date(d).toLocaleString() : '—'; }
  function totalInstances() { return clusters.reduce((sum: number, c: any) => sum + (c.spec.instances || 0), 0); }
  function readyInstances() { return clusters.reduce((sum: number, c: any) => sum + (c.status?.readyInstances || 0), 0); }
  function healthyClusters() { return clusters.filter((c: any) => c.status?.phase === 'Cluster in healthy state').length; }


</script>

<div>
  <h2>Monitoring</h2>

  <div class="tabs">
    <button class:active={tab==='overview'} onclick={()=>tab='overview'}>Overview</button>
    <button class:active={tab==='events'} onclick={()=>tab='events'}>Events ({events.length})</button>
    <button class:active={tab==='pods'} onclick={()=>tab='pods'}>Pods ({pods.length})</button>
  </div>

  {#if loading}<p>Loading...</p>
  {:else if tab === 'overview'}
    <div class="metrics-grid">
      <div class="metric-card">
        <div class="metric-value">{clusters.length}</div>
        <div class="metric-label">Total Clusters</div>
      </div>
      <div class="metric-card">
        <div class="metric-value healthy">{healthyClusters()}</div>
        <div class="metric-label">Healthy Clusters</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{readyInstances()} / {totalInstances()}</div>
        <div class="metric-label">Ready Instances</div>
      </div>
      <div class="metric-card">
        <div class="metric-value">{pods.length}</div>
        <div class="metric-label">PostgreSQL Pods</div>
      </div>
    </div>

    <h3>Cluster Health</h3>
    {#if !clusters.length}<p class="empty">No clusters in this namespace.</p>{:else}
    <table>
      <thead><tr><th>Cluster</th><th>Phase</th><th>Instances</th><th>Primary</th><th>Last Backup</th><th>Created</th></tr></thead>
      <tbody>{#each clusters as c}
        <tr>
          <td><a href="/clusters/{c.metadata.name}"><strong>{c.metadata.name}</strong></a></td>
          <td><StatusBadge status={c.status?.phase || 'Unknown'} /></td>
          <td>{c.status?.readyInstances || 0} / {c.spec.instances}</td>
          <td><code>{c.status?.currentPrimary || '—'}</code></td>
          <td>{c.status?.lastSuccessfulBackup ? formatDate(c.status.lastSuccessfulBackup) : 'Never'}</td>
          <td>{formatDate(c.metadata.creationTimestamp)}</td>
        </tr>
      {/each}</tbody>
    </table>{/if}

    <h3 style="margin-top:1.5rem">Recent Events</h3>
    {#if !events.length}<p class="empty">No events.</p>{:else}
    <table>
      <thead><tr><th>Time</th><th>Type</th><th>Object</th><th>Reason</th><th>Message</th></tr></thead>
      <tbody>{#each events.slice(0, 10) as ev}
        <tr>
          <td class="nowrap">{formatDate(ev.lastTimestamp || ev.metadata.creationTimestamp)}</td>
          <td><StatusBadge status={ev.type || 'Normal'} /></td>
          <td>{ev.involvedObject?.name || '—'}</td>
          <td>{ev.reason || '—'}</td>
          <td class="msg">{ev.message || '—'}</td>
        </tr>
      {/each}</tbody>
    </table>{/if}

  {:else if tab === 'events'}
    {#if !events.length}<p class="empty">No events in <strong>{$currentNamespace}</strong>.</p>{:else}
    <table>
      <thead><tr><th>Time</th><th>Type</th><th>Kind</th><th>Object</th><th>Reason</th><th>Message</th></tr></thead>
      <tbody>{#each events as ev}
        <tr>
          <td class="nowrap">{formatDate(ev.lastTimestamp || ev.metadata.creationTimestamp)}</td>
          <td><StatusBadge status={ev.type || 'Normal'} /></td>
          <td>{ev.involvedObject?.kind || '—'}</td>
          <td>{ev.involvedObject?.name || '—'}</td>
          <td>{ev.reason || '—'}</td>
          <td class="msg">{ev.message || '—'}</td>
        </tr>
      {/each}</tbody>
    </table>{/if}

  {:else if tab === 'pods'}
    <div class="pods-layout">
      <div class="pods-list">
        <table>
          <thead><tr><th>Pod</th><th>Cluster</th><th>Role</th><th>Status</th><th>Node</th><th></th></tr></thead>
          <tbody>{#each pods as pod}
            <tr class:selected={selectedPod === pod.metadata.name}>
              <td><strong>{pod.metadata.name}</strong></td>
              <td>{pod.metadata.labels?.['cnpg.io/cluster'] || '—'}</td>
              <td><StatusBadge status={pod.metadata.labels?.['cnpg.io/instanceRole'] || '?'} /></td>
              <td><StatusBadge status={pod.status?.phase || 'Unknown'} /></td>
              <td>{pod.spec?.nodeName || '—'}</td>
              <td><button class="log-btn" onclick={() => fetchLogs(pod.metadata.name)}>Logs</button></td>
            </tr>
          {/each}</tbody>
        </table>
        {#if !pods.length}<p class="empty">No CNPG pods found.</p>{/if}
      </div>
      {#if selectedPod}
      <div class="logs-panel">
        <div class="logs-header">
          <strong>Logs: {selectedPod}</strong>
          <button class="close-logs" onclick={() => { selectedPod = ''; podLogs = ''; }}>&times;</button>
        </div>
        {#if logsLoading}<p>Loading logs...</p>{:else}
        <pre class="logs">{podLogs}</pre>
        {/if}
      </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  h2 { color: var(--cnpg-blue-dark); margin-bottom: 1rem; }
  h3 { color: var(--cnpg-blue-dark); margin-bottom: .75rem; font-size: 1rem; }
  .tabs { display: flex; gap: .5rem; margin-bottom: 1.5rem; }
  .tabs button { padding: .5rem 1rem; border-radius: 6px; border: 1px solid var(--cnpg-gray-200); background: #fff; cursor: pointer; }
  .tabs button.active { background: var(--cnpg-teal); color: #fff; border-color: var(--cnpg-teal); }
  .metrics-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
  .metric-card { background: #fff; border-radius: 12px; padding: 1.25rem; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,.08); border: 1px solid var(--cnpg-gray-200); }
  .metric-value { font-size: 2rem; font-weight: 700; color: var(--cnpg-blue-dark); }
  .metric-value.healthy { color: var(--cnpg-green); }
  .metric-label { font-size: .8rem; color: var(--cnpg-gray-500); margin-top: .25rem; text-transform: uppercase; letter-spacing: .05em; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  th { text-align: left; padding: .75rem 1rem; background: var(--cnpg-gray-50); color: var(--cnpg-gray-500); font-size: .75rem; text-transform: uppercase; }
  td { padding: .75rem 1rem; border-top: 1px solid var(--cnpg-gray-100); font-size: .85rem; }
  td a { color: var(--cnpg-teal); text-decoration: none; }
  code { font-family: var(--font-mono); font-size: .8rem; background: var(--cnpg-gray-100); padding: .1rem .3rem; border-radius: 3px; }
  .nowrap { white-space: nowrap; }
  .msg { max-width: 350px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { text-align: center; padding: 3rem; color: var(--cnpg-gray-400); }
  .log-btn { padding: .3rem .6rem; border-radius: 6px; border: 1px solid var(--cnpg-gray-300); background: var(--cnpg-gray-50); color: var(--cnpg-gray-600); font-size: .75rem; cursor: pointer; }
  .pods-layout { display: flex; flex-direction: column; gap: 1rem; }
  tr.selected td { background: var(--cnpg-gray-100); }
  .logs-panel { background: var(--cnpg-blue-dark); border-radius: 12px; overflow: hidden; }
  .logs-header { display: flex; justify-content: space-between; align-items: center; padding: .75rem 1rem; background: rgba(255,255,255,.05); color: #fff; }
  .close-logs { background: none; border: none; color: rgba(255,255,255,.6); font-size: 1.25rem; cursor: pointer; }
  .logs { margin: 0; padding: 1rem; color: #e2e8f0; font-family: var(--font-mono); font-size: .8rem; line-height: 1.6; overflow-x: auto; max-height: 400px; overflow-y: auto; white-space: pre-wrap; word-break: break-all; }
</style>
