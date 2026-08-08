<script lang="ts">
  import { k8s } from '$lib/api/kubernetes';
  import { currentNamespace, nsScope } from '$lib/stores/namespace';
  import { watchCNPGResource, type WatchHandle } from '$lib/api/watch';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

  let poolers: any[] = $state([]);
  let clusters: any[] = $state([]);
  let loading = $state(true);
  let showCreate = $state(false);
  let deleteTarget: string | null = $state(null);
  let watcher: WatchHandle | null = null;

  let pName = $state('');
  let pCluster = $state('');
  let pInstances = $state(1);
  let pType: 'rw' | 'ro' = $state('rw');
  let pPoolMode: 'session' | 'transaction' | 'statement' = $state('transaction');

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
      const [p, c] = await Promise.all([k8s.poolers.list(ns), k8s.clusters.list(ns)]);
      poolers = p.items || [];
      clusters = c.items || [];
      const items = { get value() { return poolers; }, set value(v) { poolers = v; } };
      watcher = watchCNPGResource('poolers', ns, items);
    } catch {}
    loading = false;
  }

  async function create() {
    if (!pName || !pCluster) return;
    await k8s.poolers.create($currentNamespace, {
      apiVersion: 'postgresql.cnpg.io/v1',
      kind: 'Pooler',
      metadata: { name: pName, namespace: $currentNamespace },
      spec: {
        cluster: { name: pCluster },
        instances: pInstances,
        type: pType,
        pgbouncer: { poolMode: pPoolMode },
      },
    });
    showCreate = false;
    pName = '';
    pCluster = '';
    load();
  }

  async function togglePause(p: any) {
    await k8s.poolers.patch($currentNamespace, p.metadata.name, { spec: { paused: !p.spec.paused } });
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await k8s.poolers.del($currentNamespace, deleteTarget);
    deleteTarget = null;
    load();
  }


</script>

<div>
  <div class="hdr">
    <h2>Connection Poolers (PgBouncer)</h2>
    <button class="btn" onclick={() => showCreate = !showCreate}>{showCreate ? 'Cancel' : '+ New Pooler'}</button>
  </div>

  {#if showCreate}
  <div class="form">
    <h3>Create Pooler</h3>
    <label>Name <input bind:value={pName} placeholder="my-pooler" /></label>
    <label>Cluster
      <select bind:value={pCluster}>
        <option value="">Select cluster...</option>
        {#each clusters as c}<option value={c.metadata.name}>{c.metadata.name}</option>{/each}
      </select>
    </label>
    <label>Instances <input type="number" bind:value={pInstances} min="1" /></label>
    <div class="form-row">
      <label>Type
        <select bind:value={pType}>
          <option value="rw">Read-Write (primary)</option>
          <option value="ro">Read-Only (replicas)</option>
        </select>
      </label>
      <label>Pool Mode
        <select bind:value={pPoolMode}>
          <option value="transaction">Transaction</option>
          <option value="session">Session</option>
          <option value="statement">Statement</option>
        </select>
      </label>
    </div>
    <div class="form-actions">
      <button class="btn" onclick={create} disabled={!pName || !pCluster}>Create</button>
      <button class="btn btn-secondary" onclick={() => showCreate = false}>Cancel</button>
    </div>
  </div>
  {/if}

  {#if loading}<p>Loading...</p>
  {:else if !poolers.length}<p class="empty">No poolers in <strong>{$currentNamespace}</strong>.</p>
  {:else}
  <table>
    <thead><tr><th>Name</th><th>Cluster</th><th>Instances</th><th>Type</th><th>Pool Mode</th><th>Status</th><th></th></tr></thead>
    <tbody>{#each poolers as p}
      <tr>
        <td><strong>{p.metadata.name}</strong></td>
        <td><a href="/clusters/{p.spec.cluster.name}">{p.spec.cluster.name}</a></td>
        <td>{p.spec.instances}</td>
        <td><StatusBadge status={p.spec.type || 'rw'} /></td>
        <td>{p.spec.pgbouncer.poolMode}</td>
        <td>
          <button class="toggle" class:paused={p.spec.paused} onclick={() => togglePause(p)}>
            {p.spec.paused ? 'Paused' : 'Active'}
          </button>
        </td>
        <td><button class="del" onclick={() => deleteTarget = p.metadata.name}>Delete</button></td>
      </tr>
    {/each}</tbody>
  </table>{/if}
</div>

<ConfirmDialog
  open={deleteTarget !== null}
  title="Delete Pooler"
  message="Are you sure you want to delete pooler '{deleteTarget}'?"
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
  .del { padding: .3rem .6rem; border-radius: 6px; border: none; background: var(--cnpg-red); color: #fff; font-size: .75rem; cursor: pointer; }
  .toggle { padding: .3rem .6rem; border-radius: 6px; border: 1px solid var(--cnpg-gray-300); background: #dcfce7; color: #166534; font-size: .75rem; cursor: pointer; }
  .toggle.paused { background: var(--cnpg-gray-100); color: var(--cnpg-gray-500); }
  .empty { text-align: center; padding: 3rem; color: var(--cnpg-gray-400); }
</style>
