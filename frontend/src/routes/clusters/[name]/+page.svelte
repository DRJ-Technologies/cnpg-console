<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { k8s } from '$lib/api/kubernetes';
  import { currentNamespace, nsScope } from '$lib/stores/namespace';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import type { CNPGCluster } from '$lib/types/cnpg';

  let cluster: CNPGCluster | null = $state(null);
  let pods: any[] = $state([]);
  let events: any[] = $state([]);
  let services: any[] = $state([]);
  let pvcs: any[] = $state([]);
  let loading = $state(true);
  let error = $state('');
  let tab: 'overview' | 'instances' | 'config' | 'events' | 'storage' = $state('overview');
  let showSwitchover = $state(false);
  let switchoverTarget = $state('');

  $effect(() => {
    const name = $page.params.name;
    const ns = $page.url.searchParams.get('ns') || nsScope($currentNamespace);
    if (name && ns) load(ns, name);
  });

  async function load(ns: string, name: string) {
    loading = true;
    error = '';
    try {
      const [c, p, e, s, pvc] = await Promise.all([
        k8s.clusters.get(ns, name),
        k8s.listPods(ns, 'cnpg.io/cluster=' + name),
        k8s.listEvents(ns, 'involvedObject.name=' + name),
        k8s.listServices(ns, 'cnpg.io/cluster=' + name),
        k8s.listPVCs(ns, 'cnpg.io/cluster=' + name),
      ]);
      cluster = c;
      pods = p.items || [];
      events = (e.items || []).sort((a: any, b: any) => new Date(b.lastTimestamp || b.metadata.creationTimestamp).getTime() - new Date(a.lastTimestamp || a.metadata.creationTimestamp).getTime()).slice(0, 50);
      services = s.items || [];
      pvcs = pvc.items || [];
    } catch (e: any) {
      error = e.message;
    }
    loading = false;
  }

  async function triggerSwitchover() {
    if (!cluster || !switchoverTarget) return;
    // A concrete cluster always knows its own namespace; prefer that over the
    // selector, which may be the all-namespaces sentinel.
    const ns: string = cluster.metadata.namespace;
    await k8s.clusters.patch(ns, cluster.metadata.name, { status: { targetPrimary: switchoverTarget } });
    showSwitchover = false;
    switchoverTarget = '';
    load(ns, cluster.metadata.name);
  }

  function formatDate(d?: string) { return d ? new Date(d).toLocaleString() : '—'; }
  function replicas() { return pods.filter((p: any) => p.metadata?.labels?.['cnpg.io/instanceRole'] === 'replica'); }
</script>

{#if loading}
  <p>Loading cluster details...</p>
{:else if error}
  <div class="error-box">Error: {error}</div>
{:else if cluster}
  <div class="breadcrumb"><a href="/clusters">Clusters</a> / <strong>{cluster.metadata.name}</strong></div>

  <div class="header">
    <div>
      <h2>{cluster.metadata.name}</h2>
      {#if cluster.spec.description}<p class="desc">{cluster.spec.description}</p>{/if}
    </div>
    <div class="header-actions">
      <StatusBadge status={cluster.status?.phase || 'Unknown'} size="md" />
      {#if replicas().length > 0}
        <button class="btn btn-secondary" onclick={() => showSwitchover = true}>Switchover</button>
      {/if}
    </div>
  </div>

  <div class="tabs">
    <button class:active={tab==='overview'} onclick={()=>tab='overview'}>Overview</button>
    <button class:active={tab==='instances'} onclick={()=>tab='instances'}>Instances ({pods.length})</button>
    <button class:active={tab==='config'} onclick={()=>tab='config'}>Configuration</button>
    <button class:active={tab==='storage'} onclick={()=>tab='storage'}>Storage ({pvcs.length})</button>
    <button class:active={tab==='events'} onclick={()=>tab='events'}>Events ({events.length})</button>
  </div>

  {#if tab === 'overview'}
    <div class="grid-2">
      <div class="card">
        <h4>Cluster Info</h4>
        <dl>
          <dt>Namespace</dt><dd>{cluster.metadata.namespace}</dd>
          <dt>Instances</dt><dd>{cluster.status?.readyInstances || 0} / {cluster.spec.instances} ready</dd>
          <dt>Primary</dt><dd>{cluster.status?.currentPrimary || '—'}</dd>
          <dt>Image</dt><dd>{cluster.spec.imageName || 'Default'}</dd>
          <dt>Created</dt><dd>{formatDate(cluster.metadata.creationTimestamp)}</dd>
          <dt>Update Strategy</dt><dd>{cluster.spec.primaryUpdateStrategy || 'unsupervised'}</dd>
          <dt>Log Level</dt><dd>{cluster.spec.logLevel || 'info'}</dd>
        </dl>
      </div>
      <div class="card">
        <h4>Backup Status</h4>
        <dl>
          <dt>Last Successful</dt><dd>{formatDate(cluster.status?.lastSuccessfulBackup)}</dd>
          <dt>First Recoverability</dt><dd>{formatDate(cluster.status?.firstRecoverabilityPoint)}</dd>
          <dt>Retention Policy</dt><dd>{cluster.spec.backup?.retentionPolicy || '—'}</dd>
        </dl>
        <h4 style="margin-top:1rem">Services</h4>
        {#each services as svc}
          <div class="svc-row"><code>{svc.metadata.name}</code> <span class="svc-type">{svc.spec.type}</span></div>
        {/each}
        {#if !services.length}<p class="subtle">No services found.</p>{/if}
      </div>
    </div>

    {#if cluster.status?.conditions?.length}
    <div class="card" style="margin-top:1rem">
      <h4>Conditions</h4>
      <table>
        <thead><tr><th>Type</th><th>Status</th><th>Reason</th><th>Last Transition</th></tr></thead>
        <tbody>
          {#each cluster.status.conditions as cond}
            <tr>
              <td>{cond.type}</td>
              <td><StatusBadge status={cond.status} /></td>
              <td>{cond.reason || '—'}</td>
              <td>{formatDate(cond.lastTransitionTime)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {/if}

  {:else if tab === 'instances'}
    <div class="card">
      <table>
        <thead><tr><th>Pod</th><th>Role</th><th>Status</th><th>Node</th><th>IP</th><th>Started</th></tr></thead>
        <tbody>
          {#each pods as pod}
            <tr>
              <td><strong>{pod.metadata.name}</strong></td>
              <td><StatusBadge status={pod.metadata.labels?.['cnpg.io/instanceRole'] || '?'} /></td>
              <td><StatusBadge status={pod.status?.phase || 'Unknown'} /></td>
              <td>{pod.spec?.nodeName || '—'}</td>
              <td><code>{pod.status?.podIP || '—'}</code></td>
              <td>{formatDate(pod.status?.startTime)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if !pods.length}<p class="subtle" style="padding:1rem">No pods found.</p>{/if}
    </div>

  {:else if tab === 'config'}
    <div class="grid-2">
      <div class="card">
        <h4>PostgreSQL Parameters</h4>
        {#if cluster.spec.postgresql?.parameters && Object.keys(cluster.spec.postgresql.parameters).length}
          <table>
            <thead><tr><th>Parameter</th><th>Value</th></tr></thead>
            <tbody>
              {#each Object.entries(cluster.spec.postgresql.parameters) as [k, v]}
                <tr><td><code>{k}</code></td><td>{v}</td></tr>
              {/each}
            </tbody>
          </table>
        {:else}<p class="subtle">Using defaults.</p>{/if}
      </div>
      <div class="card">
        <h4>pg_hba.conf Rules</h4>
        {#if cluster.spec.postgresql?.pg_hba?.length}
          {#each cluster.spec.postgresql.pg_hba as rule}
            <div class="code-line"><code>{rule}</code></div>
          {/each}
        {:else}<p class="subtle">Using defaults.</p>{/if}

        <h4 style="margin-top:1.5rem">Shared Preload Libraries</h4>
        {#if cluster.spec.postgresql?.shared_preload_libraries?.length}
          <div class="tags">
            {#each cluster.spec.postgresql.shared_preload_libraries as lib}
              <span class="tag">{lib}</span>
            {/each}
          </div>
        {:else}<p class="subtle">None configured.</p>{/if}
      </div>
    </div>

    {#if cluster.spec.managed?.roles?.length}
    <div class="card" style="margin-top:1rem">
      <h4>Managed Roles</h4>
      <table>
        <thead><tr><th>Name</th><th>Login</th><th>Superuser</th><th>CreateDB</th><th>Replication</th></tr></thead>
        <tbody>
          {#each cluster.spec.managed.roles as role}
            <tr>
              <td><strong>{role.name}</strong></td>
              <td>{role.login ? 'Yes' : 'No'}</td>
              <td>{role.superuser ? 'Yes' : 'No'}</td>
              <td>{role.createdb ? 'Yes' : 'No'}</td>
              <td>{role.replication ? 'Yes' : 'No'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {/if}

  {:else if tab === 'storage'}
    <div class="grid-2">
      <div class="card">
        <h4>PGDATA Storage</h4>
        <dl>
          <dt>Size</dt><dd>{cluster.spec.storage.size}</dd>
          <dt>Storage Class</dt><dd>{cluster.spec.storage.storageClass || 'Default'}</dd>
          <dt>Resize in Use</dt><dd>{cluster.spec.storage.resizeInUseVolumes !== false ? 'Yes' : 'No'}</dd>
        </dl>
      </div>
      {#if cluster.spec.walStorage}
      <div class="card">
        <h4>WAL Storage</h4>
        <dl>
          <dt>Size</dt><dd>{cluster.spec.walStorage.size}</dd>
          <dt>Storage Class</dt><dd>{cluster.spec.walStorage.storageClass || 'Default'}</dd>
        </dl>
      </div>
      {/if}
    </div>
    {#if pvcs.length}
    <div class="card" style="margin-top:1rem">
      <h4>Persistent Volume Claims</h4>
      <table>
        <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Capacity</th><th>Storage Class</th></tr></thead>
        <tbody>
          {#each pvcs as pvc}
            <tr>
              <td>{pvc.metadata.name}</td>
              <td>{pvc.metadata.labels?.['cnpg.io/pvcRole'] || '—'}</td>
              <td><StatusBadge status={pvc.status?.phase || 'Unknown'} /></td>
              <td>{pvc.status?.capacity?.storage || pvc.spec?.resources?.requests?.storage || '—'}</td>
              <td>{pvc.spec?.storageClassName || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    {/if}

  {:else if tab === 'events'}
    <div class="card">
      <table>
        <thead><tr><th>Time</th><th>Type</th><th>Reason</th><th>Message</th></tr></thead>
        <tbody>
          {#each events as ev}
            <tr>
              <td class="nowrap">{formatDate(ev.lastTimestamp || ev.metadata.creationTimestamp)}</td>
              <td><StatusBadge status={ev.type || 'Normal'} /></td>
              <td>{ev.reason || '—'}</td>
              <td class="msg">{ev.message || '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if !events.length}<p class="subtle" style="padding:1rem">No events.</p>{/if}
    </div>
  {/if}
{/if}

<ConfirmDialog
  open={showSwitchover}
  title="Trigger Switchover"
  message="Select the target replica to promote as the new primary."
  confirmLabel="Switchover"
  onconfirm={triggerSwitchover}
  oncancel={() => showSwitchover = false}
/>

<style>
  .breadcrumb { margin-bottom: 1rem; font-size: .875rem; color: var(--cnpg-gray-500); }
  .breadcrumb a { color: var(--cnpg-teal); text-decoration: none; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
  h2 { margin: 0; color: var(--cnpg-blue-dark); }
  .desc { margin: .25rem 0 0; color: var(--cnpg-gray-500); }
  .header-actions { display: flex; gap: .75rem; align-items: center; }
  .btn { padding: .5rem 1rem; border-radius: 8px; border: none; font-weight: 600; cursor: pointer; }
  .btn-secondary { background: var(--cnpg-gray-100); color: var(--cnpg-gray-700); border: 1px solid var(--cnpg-gray-300); }
  .tabs { display: flex; gap: .5rem; margin-bottom: 1.5rem; flex-wrap: wrap; }
  .tabs button { padding: .5rem 1rem; border-radius: 6px; border: 1px solid var(--cnpg-gray-200); background: #fff; cursor: pointer; font-size: .875rem; }
  .tabs button.active { background: var(--cnpg-teal); color: #fff; border-color: var(--cnpg-teal); }
  .grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1rem; }
  .card { background: #fff; border-radius: 12px; padding: 1.25rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); border: 1px solid var(--cnpg-gray-200); }
  .card h4 { margin: 0 0 .75rem; color: var(--cnpg-blue-dark); font-size: .9rem; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: .4rem .75rem; margin: 0; }
  dt { font-size: .8rem; color: var(--cnpg-gray-500); font-weight: 500; }
  dd { margin: 0; font-size: .875rem; color: var(--cnpg-gray-700); }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; padding: .5rem .75rem; background: var(--cnpg-gray-50); color: var(--cnpg-gray-500); font-size: .75rem; text-transform: uppercase; }
  td { padding: .5rem .75rem; border-top: 1px solid var(--cnpg-gray-100); font-size: .85rem; }
  code { font-family: var(--font-mono); font-size: .8rem; background: var(--cnpg-gray-100); padding: .1rem .3rem; border-radius: 3px; }
  .code-line { padding: .3rem 0; }
  .tags { display: flex; gap: .5rem; flex-wrap: wrap; }
  .tag { background: var(--cnpg-gray-100); padding: .2rem .6rem; border-radius: 4px; font-size: .8rem; font-family: var(--font-mono); }
  .subtle { color: var(--cnpg-gray-400); font-size: .85rem; margin: 0; }
  .svc-row { display: flex; justify-content: space-between; padding: .3rem 0; }
  .svc-type { font-size: .75rem; color: var(--cnpg-gray-400); }
  .nowrap { white-space: nowrap; }
  .msg { max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .error-box { background: #fee2e2; color: #991b1b; padding: 1rem; border-radius: 8px; }
</style>
