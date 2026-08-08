<script lang="ts">
  import { k8s } from '$lib/api/kubernetes';
  import { currentNamespace, nsScope } from '$lib/stores/namespace';
  import { watchCNPGResource, type WatchHandle } from '$lib/api/watch';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

  let dbs: any[] = $state([]);
  let clusters: any[] = $state([]);
  let loading = $state(true);
  let showCreate = $state(false);
  let deleteTarget: string | null = $state(null);
  let watcher: WatchHandle | null = null;

  let dName = $state('');
  let dCluster = $state('');
  let dOwner = $state('app');
  let dEncoding = $state('UTF8');
  let dTemplate = $state('');
  let dLocale = $state('');

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
      const [d, c] = await Promise.all([k8s.databases.list(ns), k8s.clusters.list(ns)]);
      dbs = d.items || [];
      clusters = c.items || [];
      const items = { get value() { return dbs; }, set value(v) { dbs = v; } };
      watcher = watchCNPGResource('databases', ns, items);
    } catch {}
    loading = false;
  }

  async function create() {
    if (!dName || !dCluster || !dOwner) return;
    const spec: any = { cluster: { name: dCluster }, name: dName, owner: dOwner };
    if (dEncoding) spec.encoding = dEncoding;
    if (dTemplate) spec.template = dTemplate;
    if (dLocale) spec.locale = dLocale;
    await k8s.databases.create($currentNamespace, {
      apiVersion: 'postgresql.cnpg.io/v1',
      kind: 'Database',
      metadata: { name: dCluster + '-' + dName, namespace: $currentNamespace },
      spec,
    });
    showCreate = false;
    dName = '';
    dCluster = '';
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await k8s.databases.del($currentNamespace, deleteTarget);
    deleteTarget = null;
    load();
  }


</script>

<div>
  <div class="hdr">
    <h2>Databases</h2>
    <button class="btn" onclick={() => showCreate = !showCreate}>{showCreate ? 'Cancel' : '+ New Database'}</button>
  </div>

  {#if showCreate}
  <div class="form">
    <h3>Create Database</h3>
    <label>Cluster
      <select bind:value={dCluster}>
        <option value="">Select cluster...</option>
        {#each clusters as c}<option value={c.metadata.name}>{c.metadata.name}</option>{/each}
      </select>
    </label>
    <label>Database Name <input bind:value={dName} placeholder="mydb" /></label>
    <label>Owner <input bind:value={dOwner} placeholder="app" /></label>
    <div class="form-row">
      <label>Encoding <input bind:value={dEncoding} placeholder="UTF8" /></label>
      <label>Template <input bind:value={dTemplate} placeholder="template0" /></label>
    </div>
    <label>Locale <input bind:value={dLocale} placeholder="en_US.utf8" /></label>
    <div class="form-actions">
      <button class="btn" onclick={create} disabled={!dName || !dCluster || !dOwner}>Create</button>
      <button class="btn btn-secondary" onclick={() => showCreate = false}>Cancel</button>
    </div>
  </div>
  {/if}

  {#if loading}<p>Loading...</p>
  {:else if !dbs.length}<p class="empty">No databases in <strong>{$currentNamespace}</strong>.</p>
  {:else}
  <table>
    <thead><tr><th>Database</th><th>K8s Resource</th><th>Cluster</th><th>Owner</th><th>Status</th><th></th></tr></thead>
    <tbody>{#each dbs as d}
      <tr>
        <td><strong>{d.spec.name}</strong></td>
        <td class="mono">{d.metadata.name}</td>
        <td><a href="/clusters/{d.spec.cluster.name}">{d.spec.cluster.name}</a></td>
        <td>{d.spec.owner}</td>
        <td><StatusBadge status={d.status?.applied ? 'applied' : (d.status?.message || 'pending')} /></td>
        <td><button class="del" onclick={() => deleteTarget = d.metadata.name}>Delete</button></td>
      </tr>
    {/each}</tbody>
  </table>{/if}
</div>

<ConfirmDialog
  open={deleteTarget !== null}
  title="Delete Database"
  message="Are you sure you want to delete database resource '{deleteTarget}'? This will drop the database if reclaimPolicy is 'delete'."
  confirmLabel="Delete"
  danger={true}
  onconfirm={confirmDelete}
  oncancel={() => deleteTarget = null}
/>

<style>
  .hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  h2 { margin: 0; color: var(--cnpg-blue-dark); }
  .btn { padding: .6rem 1.2rem; border-radius: 8px; border: none; background: var(--cnpg-teal); color: #fff; font-weight: 600; cursor: pointer; }
  .btn-secondary { background: #fff; color: var(--cnpg-gray-700); border: 1px solid var(--cnpg-gray-300); }
  .form { background: #fff; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .form h3 { margin: 0 0 1rem; color: var(--cnpg-blue-dark); }
  .form label { display: block; margin-bottom: .75rem; font-size: .875rem; color: var(--cnpg-gray-600); }
  .form input, .form select { display: block; width: 100%; padding: .5rem .75rem; margin-top: .25rem; border: 1px solid var(--cnpg-gray-300); border-radius: 6px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .form-actions { display: flex; gap: .75rem; margin-top: 1rem; }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  th { text-align: left; padding: .75rem 1rem; background: var(--cnpg-gray-50); color: var(--cnpg-gray-500); font-size: .8rem; text-transform: uppercase; }
  td { padding: .75rem 1rem; border-top: 1px solid var(--cnpg-gray-100); }
  td a { color: var(--cnpg-teal); text-decoration: none; }
  .mono { font-family: var(--font-mono); font-size: .85rem; color: var(--cnpg-gray-500); }
  .del { padding: .3rem .6rem; border-radius: 6px; border: none; background: var(--cnpg-red); color: #fff; font-size: .75rem; cursor: pointer; }
  .empty { text-align: center; padding: 3rem; color: var(--cnpg-gray-400); }
</style>
