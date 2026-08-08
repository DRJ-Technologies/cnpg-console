<script lang="ts">
  import { k8s } from '$lib/api/kubernetes';
  import { currentNamespace, nsScope } from '$lib/stores/namespace';
  import { watchCNPGResource, type WatchHandle } from '$lib/api/watch';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

  let publications: any[] = $state([]);
  let subscriptions: any[] = $state([]);
  let clusters: any[] = $state([]);
  let loading = $state(true);
  let tab: 'publications' | 'subscriptions' = $state('publications');
  let watchers: WatchHandle[] = [];

  // Create publication form
  let showCreatePub = $state(false);
  let pubCluster = $state('');
  let pubDbname = $state('');
  let pubName = $state('');
  let pubAllTables = $state(true);

  // Create subscription form
  let showCreateSub = $state(false);
  let subCluster = $state('');
  let subDbname = $state('');
  let subName = $state('');
  let subExtCluster = $state('');
  let subPubName = $state('');

  let deleteTarget: { kind: string; name: string } | null = $state(null);

  $effect(() => {
    if ($currentNamespace) load();
    return () => { watchers.forEach(w => w.close()); };
  });

  async function load() {
    loading = true;
    watchers.forEach(w => w.close());
    watchers = [];
    // undefined => cluster-scoped list/watch across all namespaces
    const ns = nsScope($currentNamespace);
    
    try {
      const [p, s, c] = await Promise.all([
        k8s.publications.list(ns),
        k8s.subscriptions.list(ns),
        k8s.clusters.list(ns),
      ]);
      publications = p.items || [];
      subscriptions = s.items || [];
      clusters = c.items || [];
      const pItems = { get value() { return publications; }, set value(v) { publications = v; } };
      const sItems = { get value() { return subscriptions; }, set value(v) { subscriptions = v; } };
      watchers.push(watchCNPGResource('publications', ns, pItems));
      watchers.push(watchCNPGResource('subscriptions', ns, sItems));
    } catch {}
    loading = false;
  }

  async function createPublication() {
    if (!pubCluster || !pubDbname || !pubName) return;
    await k8s.publications.create($currentNamespace, {
      apiVersion: 'postgresql.cnpg.io/v1',
      kind: 'Publication',
      metadata: { name: pubCluster + '-pub-' + pubName, namespace: $currentNamespace },
      spec: {
        cluster: { name: pubCluster },
        dbname: pubDbname,
        name: pubName,
        target: { allTables: pubAllTables },
      },
    });
    showCreatePub = false;
    pubName = '';
    load();
  }

  async function createSubscription() {
    if (!subCluster || !subDbname || !subName || !subExtCluster || !subPubName) return;
    await k8s.subscriptions.create($currentNamespace, {
      apiVersion: 'postgresql.cnpg.io/v1',
      kind: 'Subscription',
      metadata: { name: subCluster + '-sub-' + subName, namespace: $currentNamespace },
      spec: {
        cluster: { name: subCluster },
        dbname: subDbname,
        name: subName,
        externalClusterName: subExtCluster,
        publicationName: subPubName,
      },
    });
    showCreateSub = false;
    subName = '';
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'Publication') {
      await k8s.publications.del($currentNamespace, deleteTarget.name);
    } else {
      await k8s.subscriptions.del($currentNamespace, deleteTarget.name);
    }
    deleteTarget = null;
    load();
  }


</script>

<div>
  <div class="hdr">
    <h2>Logical Replication</h2>
    <div class="actions">
      {#if tab === 'publications'}
        <button class="btn" onclick={() => showCreatePub = !showCreatePub}>+ Publication</button>
      {:else}
        <button class="btn" onclick={() => showCreateSub = !showCreateSub}>+ Subscription</button>
      {/if}
    </div>
  </div>

  <div class="tabs">
    <button class:active={tab==='publications'} onclick={()=>tab='publications'}>Publications ({publications.length})</button>
    <button class:active={tab==='subscriptions'} onclick={()=>tab='subscriptions'}>Subscriptions ({subscriptions.length})</button>
  </div>

  {#if showCreatePub && tab === 'publications'}
  <div class="form">
    <h3>Create Publication</h3>
    <label>Cluster
      <select bind:value={pubCluster}>
        <option value="">Select cluster...</option>
        {#each clusters as c}<option value={c.metadata.name}>{c.metadata.name}</option>{/each}
      </select>
    </label>
    <label>Database Name <input bind:value={pubDbname} placeholder="mydb" /></label>
    <label>Publication Name <input bind:value={pubName} placeholder="my_publication" /></label>
    <label class="checkbox"><input type="checkbox" bind:checked={pubAllTables} /> Publish all tables</label>
    <div class="form-actions">
      <button class="btn" onclick={createPublication} disabled={!pubCluster || !pubDbname || !pubName}>Create</button>
      <button class="btn btn-secondary" onclick={() => showCreatePub = false}>Cancel</button>
    </div>
  </div>
  {/if}

  {#if showCreateSub && tab === 'subscriptions'}
  <div class="form">
    <h3>Create Subscription</h3>
    <label>Cluster
      <select bind:value={subCluster}>
        <option value="">Select cluster...</option>
        {#each clusters as c}<option value={c.metadata.name}>{c.metadata.name}</option>{/each}
      </select>
    </label>
    <label>Database Name <input bind:value={subDbname} placeholder="mydb" /></label>
    <label>Subscription Name <input bind:value={subName} placeholder="my_subscription" /></label>
    <label>External Cluster Name <input bind:value={subExtCluster} placeholder="source-cluster" /></label>
    <label>Publication Name <input bind:value={subPubName} placeholder="my_publication" /></label>
    <div class="form-actions">
      <button class="btn" onclick={createSubscription} disabled={!subCluster || !subDbname || !subName || !subExtCluster || !subPubName}>Create</button>
      <button class="btn btn-secondary" onclick={() => showCreateSub = false}>Cancel</button>
    </div>
  </div>
  {/if}

  {#if loading}<p>Loading...</p>
  {:else if tab === 'publications'}
    {#if !publications.length}<p class="empty">No publications in <strong>{$currentNamespace}</strong>.</p>{:else}
    <table>
      <thead><tr><th>Name</th><th>Cluster</th><th>Database</th><th>PG Name</th><th>Status</th><th></th></tr></thead>
      <tbody>{#each publications as p}
        <tr>
          <td><strong>{p.metadata.name}</strong></td>
          <td><a href="/clusters/{p.spec.cluster.name}">{p.spec.cluster.name}</a></td>
          <td>{p.spec.dbname}</td>
          <td><code>{p.spec.name}</code></td>
          <td><StatusBadge status={p.status?.applied ? 'applied' : 'pending'} /></td>
          <td><button class="del" onclick={() => deleteTarget = { kind: 'Publication', name: p.metadata.name }}>Delete</button></td>
        </tr>
      {/each}</tbody>
    </table>{/if}
  {:else}
    {#if !subscriptions.length}<p class="empty">No subscriptions in <strong>{$currentNamespace}</strong>.</p>{:else}
    <table>
      <thead><tr><th>Name</th><th>Cluster</th><th>Database</th><th>External Cluster</th><th>Publication</th><th>Status</th><th></th></tr></thead>
      <tbody>{#each subscriptions as s}
        <tr>
          <td><strong>{s.metadata.name}</strong></td>
          <td><a href="/clusters/{s.spec.cluster.name}">{s.spec.cluster.name}</a></td>
          <td>{s.spec.dbname}</td>
          <td>{s.spec.externalClusterName}</td>
          <td><code>{s.spec.publicationName}</code></td>
          <td><StatusBadge status={s.status?.applied ? 'applied' : 'pending'} /></td>
          <td><button class="del" onclick={() => deleteTarget = { kind: 'Subscription', name: s.metadata.name }}>Delete</button></td>
        </tr>
      {/each}</tbody>
    </table>{/if}
  {/if}
</div>

<ConfirmDialog
  open={deleteTarget !== null}
  title="Delete {deleteTarget?.kind || ''}"
  message="Are you sure you want to delete '{deleteTarget?.name}'?"
  confirmLabel="Delete"
  danger={true}
  onconfirm={confirmDelete}
  oncancel={() => deleteTarget = null}
/>

<style>
  .hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
  h2 { margin: 0; color: var(--cnpg-blue-dark); }
  .actions { display: flex; gap: .5rem; }
  .btn { padding: .6rem 1.2rem; border-radius: 8px; border: none; background: var(--cnpg-teal); color: #fff; font-weight: 600; cursor: pointer; }
  .btn-secondary { background: #fff; color: var(--cnpg-gray-700); border: 1px solid var(--cnpg-gray-300); }
  .form { background: #fff; padding: 1.5rem; border-radius: 12px; margin-bottom: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  .form h3 { margin: 0 0 1rem; color: var(--cnpg-blue-dark); }
  .form label { display: block; margin-bottom: .75rem; font-size: .875rem; color: var(--cnpg-gray-600); }
  .form input, .form select { display: block; width: 100%; padding: .5rem .75rem; margin-top: .25rem; border: 1px solid var(--cnpg-gray-300); border-radius: 6px; }
  .checkbox { flex-direction: row; display: flex; align-items: center; gap: .5rem; }
  .checkbox input { width: auto; margin: 0; }
  .form-actions { display: flex; gap: .75rem; margin-top: 1rem; }
  .tabs { display: flex; gap: .5rem; margin-bottom: 1.5rem; }
  .tabs button { padding: .5rem 1rem; border-radius: 6px; border: 1px solid var(--cnpg-gray-200); background: #fff; cursor: pointer; }
  .tabs button.active { background: var(--cnpg-teal); color: #fff; border-color: var(--cnpg-teal); }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  th { text-align: left; padding: .75rem 1rem; background: var(--cnpg-gray-50); color: var(--cnpg-gray-500); font-size: .8rem; text-transform: uppercase; }
  td { padding: .75rem 1rem; border-top: 1px solid var(--cnpg-gray-100); }
  td a { color: var(--cnpg-teal); text-decoration: none; }
  code { font-family: var(--font-mono); background: var(--cnpg-gray-100); padding: .15rem .4rem; border-radius: 4px; font-size: .85rem; }
  .del { padding: .3rem .6rem; border-radius: 6px; border: none; background: var(--cnpg-red); color: #fff; font-size: .75rem; cursor: pointer; }
  .empty { text-align: center; padding: 3rem; color: var(--cnpg-gray-400); }
</style>
