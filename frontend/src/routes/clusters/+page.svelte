<script lang="ts">
  import { onDestroy } from 'svelte';
  import { k8s } from '$lib/api/kubernetes';
  import { currentNamespace, nsScope } from '$lib/stores/namespace';
  import { watchCNPGResource, type WatchHandle } from '$lib/api/watch';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

  let clusters: any[] = $state([]);
  let loading = $state(true);
  let showCreate = $state(false);
  let deleteTarget: string | null = $state(null);
  let watcher: WatchHandle | null = null;

  // Create form fields
  let newName = $state('');
  let newInstances = $state(3);
  let newStorage = $state('10Gi');
  let newStorageClass = $state('');
  let newWalStorage = $state('');
  let newImage = $state('');
  let newSuperuser = $state(false);
  let newDescription = $state('');

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
      clusters = (await k8s.clusters.list(ns)).items || [];
      // Start real-time watch — UI updates instantly on cluster changes
      const items = { get value() { return clusters; }, set value(v) { clusters = v; } };
      watcher = watchCNPGResource('clusters', ns, items);
    } catch {}
    loading = false;
  }

  async function create() {
    if (!newName) return;
    const spec: any = {
      instances: newInstances,
      storage: { size: newStorage },
    };
    if (newStorageClass) spec.storage.storageClass = newStorageClass;
    if (newWalStorage) spec.walStorage = { size: newWalStorage };
    if (newImage) spec.imageName = newImage;
    if (newSuperuser) spec.enableSuperuserAccess = true;
    if (newDescription) spec.description = newDescription;

    await k8s.clusters.create($currentNamespace, {
      apiVersion: 'postgresql.cnpg.io/v1',
      kind: 'Cluster',
      metadata: { name: newName, namespace: $currentNamespace },
      spec,
    });
    showCreate = false;
    newName = '';
    newDescription = '';
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    await k8s.clusters.del($currentNamespace, deleteTarget);
    deleteTarget = null;
    load();
  }


</script>

<div>
  <div class="hdr">
    <h2>PostgreSQL Clusters</h2>
    <button class="btn" onclick={() => showCreate = !showCreate}>{showCreate ? 'Cancel' : '+ New Cluster'}</button>
  </div>

  {#if showCreate}
  <div class="form">
    <h3>Create Cluster</h3>
    <label>Name <input bind:value={newName} placeholder="my-pg" /></label>
    <label>Description <input bind:value={newDescription} placeholder="Production PostgreSQL cluster" /></label>
    <div class="form-row">
      <label>Instances <input type="number" bind:value={newInstances} min="1" /></label>
      <label>Storage Size <input bind:value={newStorage} placeholder="10Gi" /></label>
    </div>
    <div class="form-row">
      <label>Storage Class (optional) <input bind:value={newStorageClass} placeholder="default" /></label>
      <label>WAL Storage (optional) <input bind:value={newWalStorage} placeholder="2Gi" /></label>
    </div>
    <label>Image (optional) <input bind:value={newImage} placeholder="ghcr.io/cloudnative-pg/postgresql:16" /></label>
    <label class="checkbox"><input type="checkbox" bind:checked={newSuperuser} /> Enable superuser access</label>
    <div class="form-actions">
      <button class="btn" onclick={create} disabled={!newName}>Create Cluster</button>
      <button class="btn btn-secondary" onclick={() => showCreate = false}>Cancel</button>
    </div>
  </div>
  {/if}

  {#if loading}<p>Loading...</p>
  {:else if !clusters.length}
    <div class="empty">
      <p>No clusters in <strong>{$currentNamespace}</strong></p>
      <p class="sub">Create a new PostgreSQL cluster to get started.</p>
    </div>
  {:else}
    <div class="grid">
      {#each clusters as c}
      <a href="/clusters/{c.metadata.name}?ns={c.metadata.namespace}" class="card">
        <div class="card-top">
          <h3>{c.metadata.name}</h3>
          <StatusBadge status={c.status?.phase || 'Unknown'} />
        </div>
        <p class="card-ns">{c.metadata.namespace}</p>
        {#if c.spec.description}<p class="card-desc">{c.spec.description}</p>{/if}
        <div class="stats">
          <div><small>Instances</small><strong>{c.status?.readyInstances || 0}/{c.spec.instances}</strong></div>
          <div><small>Primary</small><strong>{c.status?.currentPrimary || '—'}</strong></div>
          <div><small>Storage</small><strong>{c.spec.storage.size}</strong></div>
        </div>
        <div class="card-foot">
          <span>{c.metadata.creationTimestamp?.split('T')[0]}</span>
          <button class="del" onclick={(e) => { e.stopPropagation(); deleteTarget = c.metadata.name; }}>Delete</button>
        </div>
      </a>
      {/each}
    </div>
  {/if}
</div>

<ConfirmDialog
  open={deleteTarget !== null}
  title="Delete Cluster"
  message="Are you sure you want to delete cluster '{deleteTarget}'? This will permanently destroy all data in the cluster."
  confirmLabel="Delete Cluster"
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
  .form input { display: block; width: 100%; padding: .5rem .75rem; margin-top: .25rem; border: 1px solid var(--cnpg-gray-300); border-radius: 6px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .checkbox { flex-direction: row; display: flex; align-items: center; gap: .5rem; }
  .checkbox input { width: auto; margin: 0; }
  .form-actions { display: flex; gap: .75rem; margin-top: 1rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem; }
  .card { background: #fff; border-radius: 12px; padding: 1.25rem; text-decoration: none; color: inherit; box-shadow: 0 1px 3px rgba(0,0,0,.08); border: 1px solid var(--cnpg-gray-200); transition: all .15s; }
  .card:hover { box-shadow: 0 4px 12px rgba(0,0,0,.12); transform: translateY(-1px); }
  .card-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: .5rem; }
  .card-top h3 { margin: 0; color: var(--cnpg-blue-dark); }
  .card-ns { font-family: var(--font-mono); font-size: .75rem; color: var(--cnpg-gray-500); margin: 0 0 .5rem; }
  .card-desc { margin: 0 0 .75rem; font-size: .8rem; color: var(--cnpg-gray-500); }
  .stats { display: flex; gap: 1.5rem; margin-bottom: 1rem; }
  .stats small { display: block; font-size: .7rem; color: var(--cnpg-gray-400); text-transform: uppercase; letter-spacing: .05em; }
  .stats strong { font-size: .95rem; color: var(--cnpg-gray-700); }
  .card-foot { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--cnpg-gray-100); padding-top: .75rem; font-size: .8rem; color: var(--cnpg-gray-400); }
  .del { padding: .3rem .6rem; border-radius: 6px; border: none; background: var(--cnpg-red); color: #fff; font-size: .75rem; cursor: pointer; }
  .empty { text-align: center; padding: 4rem; color: var(--cnpg-gray-500); }
  .empty .sub { font-size: .875rem; color: var(--cnpg-gray-400); margin-top: .25rem; }
</style>
