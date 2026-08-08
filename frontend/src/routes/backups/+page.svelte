<script lang="ts">
  import { k8s } from '$lib/api/kubernetes';
  import { currentNamespace, nsScope } from '$lib/stores/namespace';
  import { watchCNPGResource, type WatchHandle } from '$lib/api/watch';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

  let backups: any[] = $state([]);
  let scheduled: any[] = $state([]);
  let clusters: any[] = $state([]);
  let loading = $state(true);
  let tab: 'backups' | 'scheduled' = $state('backups');
  let errorMsg = $state('');
  let watchers: WatchHandle[] = [];

  $effect(() => {
    if ($currentNamespace) load();
    return () => { watchers.forEach(w => w.close()); };
  });

  // Create backup form
  let showCreateBackup = $state(false);
  let bCluster = $state('');
  let bMethod = $state('volumeSnapshot');
  let bTarget = $state('prefer-standby');

  // Create scheduled backup form
  let showCreateScheduled = $state(false);
  let sCluster = $state('');
  let sSchedule = $state('0 0 2 * * *');
  let sMethod = $state('volumeSnapshot');
  let sImmediate = $state(false);

  // Delete confirm
  let deleteTarget: { kind: string; name: string } | null = $state(null);

  async function load() {
    loading = true;
    watchers.forEach(w => w.close());
    watchers = [];
    // undefined => cluster-scoped list/watch across all namespaces
    const ns = nsScope($currentNamespace);
    
    try {
      const [b, s, c] = await Promise.all([
        k8s.backups.list(ns),
        k8s.scheduledbackups.list(ns),
        k8s.clusters.list(ns),
      ]);
      backups = b.items || [];
      scheduled = s.items || [];
      clusters = c.items || [];
      // Real-time watches — backup status updates live
      const bItems = { get value() { return backups; }, set value(v) { backups = v; } };
      const sItems = { get value() { return scheduled; }, set value(v) { scheduled = v; } };
      watchers.push(watchCNPGResource('backups', ns, bItems));
      watchers.push(watchCNPGResource('scheduledbackups', ns, sItems));
    } catch {}
    loading = false;
  }

  async function createBackup() {
    if (!bCluster) return;
    errorMsg = '';
    try {
      await k8s.backups.create($currentNamespace, {
        apiVersion: 'postgresql.cnpg.io/v1',
        kind: 'Backup',
        metadata: { name: bCluster + '-backup-' + Date.now(), namespace: $currentNamespace },
        spec: { cluster: { name: bCluster }, method: bMethod, target: bTarget },
      });
      showCreateBackup = false;
      bCluster = '';
      load();
    } catch (e: any) {
      try { const body = JSON.parse(e.message.substring(e.message.indexOf('{'))); errorMsg = body.details?.causes?.[0]?.message || body.message || e.message; } catch { errorMsg = e.message; }
    }
  }

  async function createScheduledBackup() {
    if (!sCluster || !sSchedule) return;
    errorMsg = '';
    try {
      await k8s.scheduledbackups.create($currentNamespace, {
        apiVersion: 'postgresql.cnpg.io/v1',
        kind: 'ScheduledBackup',
        metadata: { name: sCluster + '-sched-' + Date.now(), namespace: $currentNamespace },
        spec: { schedule: sSchedule, cluster: { name: sCluster }, method: sMethod, immediate: sImmediate },
      });
      showCreateScheduled = false;
      sCluster = '';
      load();
    } catch (e: any) {
      try { const body = JSON.parse(e.message.substring(e.message.indexOf('{'))); errorMsg = body.details?.causes?.[0]?.message || body.message || e.message; } catch { errorMsg = e.message; }
    }
  }

  async function toggleSuspend(s: any) {
    await k8s.scheduledbackups.patch($currentNamespace, s.metadata.name, { spec: { suspend: !s.spec.suspend } });
    load();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'Backup') {
      await k8s.backups.del($currentNamespace, deleteTarget.name);
    } else {
      await k8s.scheduledbackups.del($currentNamespace, deleteTarget.name);
    }
    deleteTarget = null;
    load();
  }


</script>

<div>
  <div class="hdr">
    <h2>Backups & WAL Archive</h2>
    <div class="actions">
      <button class="btn" onclick={() => showCreateBackup = !showCreateBackup}>+ Backup</button>
      <button class="btn btn-secondary" onclick={() => showCreateScheduled = !showCreateScheduled}>+ Schedule</button>
    </div>
  </div>

  {#if showCreateBackup}
  <div class="form">
    <h3>Create On-Demand Backup</h3>
    <label>Cluster
      <select bind:value={bCluster}>
        <option value="">Select cluster...</option>
        {#each clusters as c}<option value={c.metadata.name}>{c.metadata.name}</option>{/each}
      </select>
    </label>
    <label>Method
      <select bind:value={bMethod}>
        <option value="volumeSnapshot">Volume Snapshot</option>
        <option value="barmanObjectStore">Barman Object Store</option>
        <option value="plugin">Plugin</option>
      </select>
    </label>
    <label>Target
      <select bind:value={bTarget}>
        <option value="prefer-standby">Prefer Standby</option>
        <option value="primary">Primary</option>
      </select>
    </label>
    <div class="form-actions">
      <button class="btn" onclick={createBackup} disabled={!bCluster}>Create Backup</button>
      <button class="btn btn-secondary" onclick={() => showCreateBackup = false}>Cancel</button>
    </div>
  </div>
  {/if}

  {#if showCreateScheduled}
  <div class="form">
    <h3>Create Scheduled Backup</h3>
    <label>Cluster
      <select bind:value={sCluster}>
        <option value="">Select cluster...</option>
        {#each clusters as c}<option value={c.metadata.name}>{c.metadata.name}</option>{/each}
      </select>
    </label>
    <label>Schedule (6-field cron)
      <input bind:value={sSchedule} placeholder="0 0 2 * * *" />
      <small>Format: second minute hour day month weekday</small>
    </label>
    <label>Method
      <select bind:value={sMethod}>
        <option value="volumeSnapshot">Volume Snapshot</option>
        <option value="barmanObjectStore">Barman Object Store</option>
        <option value="plugin">Plugin</option>
      </select>
    </label>
    <label class="checkbox"><input type="checkbox" bind:checked={sImmediate} /> Trigger immediately on creation</label>
    <div class="form-actions">
      <button class="btn" onclick={createScheduledBackup} disabled={!sCluster || !sSchedule}>Create Schedule</button>
      <button class="btn btn-secondary" onclick={() => showCreateScheduled = false}>Cancel</button>
    </div>
  </div>
  {/if}

  {#if errorMsg}<div class="error-box">{errorMsg} <button class="dismiss" onclick={() => errorMsg = ''}>&times;</button></div>{/if}

  <div class="tabs">
    <button class:active={tab==='backups'} onclick={()=>tab='backups'}>Backups ({backups.length})</button>
    <button class:active={tab==='scheduled'} onclick={()=>tab='scheduled'}>Scheduled ({scheduled.length})</button>
  </div>

  {#if loading}<p>Loading...</p>
  {:else if tab==='backups'}
    {#if !backups.length}<p class="empty">No backups in <strong>{$currentNamespace}</strong>. Create one to get started.</p>{:else}
    <table>
      <thead><tr><th>Name</th><th>Cluster</th><th>Method</th><th>Phase</th><th>Started</th><th>Stopped</th><th>WAL</th><th></th></tr></thead>
      <tbody>{#each backups as b}
        <tr>
          <td><strong>{b.metadata.name}</strong></td>
          <td>{b.spec.cluster.name}</td>
          <td>{b.status?.method || b.spec.method || '—'}</td>
          <td><StatusBadge status={b.status?.phase || 'Pending'} /></td>
          <td>{b.status?.startedAt?.split('T')[0] || '—'}</td>
          <td>{b.status?.stoppedAt?.split('T')[0] || '—'}</td>
          <td class="mono">{b.status?.beginWal ? b.status.beginWal.substring(0, 12) + '...' : '—'}</td>
          <td><button class="del" onclick={() => deleteTarget = { kind: 'Backup', name: b.metadata.name }}>Delete</button></td>
        </tr>
      {/each}</tbody>
    </table>{/if}
  {:else}
    {#if !scheduled.length}<p class="empty">No scheduled backups.</p>{:else}
    <table>
      <thead><tr><th>Name</th><th>Cluster</th><th>Schedule</th><th>Method</th><th>Suspended</th><th></th></tr></thead>
      <tbody>{#each scheduled as s}
        <tr>
          <td><strong>{s.metadata.name}</strong></td>
          <td>{s.spec.cluster.name}</td>
          <td><code>{s.spec.schedule}</code></td>
          <td>{s.spec.method || 'volumeSnapshot'}</td>
          <td>
            <button class="toggle" class:suspended={s.spec.suspend} onclick={() => toggleSuspend(s)}>
              {s.spec.suspend ? 'Suspended' : 'Active'}
            </button>
          </td>
          <td><button class="del" onclick={() => deleteTarget = { kind: 'ScheduledBackup', name: s.metadata.name }}>Delete</button></td>
        </tr>
      {/each}</tbody>
    </table>{/if}
  {/if}
</div>

<ConfirmDialog
  open={deleteTarget !== null}
  title="Delete {deleteTarget?.kind || ''}"
  message="Are you sure you want to delete '{deleteTarget?.name}'? This action cannot be undone."
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
  .form small { display: block; margin-top: .25rem; color: var(--cnpg-gray-400); }
  .checkbox { flex-direction: row; display: flex; align-items: center; gap: .5rem; }
  .checkbox input { width: auto; margin: 0; }
  .form-actions { display: flex; gap: .75rem; margin-top: 1rem; }
  .tabs { display: flex; gap: .5rem; margin-bottom: 1.5rem; }
  .tabs button { padding: .5rem 1rem; border-radius: 6px; border: 1px solid var(--cnpg-gray-200); background: #fff; cursor: pointer; }
  .tabs button.active { background: var(--cnpg-teal); color: #fff; border-color: var(--cnpg-teal); }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  th { text-align: left; padding: .75rem 1rem; background: var(--cnpg-gray-50); color: var(--cnpg-gray-500); font-size: .8rem; text-transform: uppercase; }
  td { padding: .75rem 1rem; border-top: 1px solid var(--cnpg-gray-100); }
  code { font-family: var(--font-mono); background: var(--cnpg-gray-100); padding: .15rem .4rem; border-radius: 4px; font-size: .85rem; }
  .mono { font-family: var(--font-mono); font-size: .8rem; }
  .del { padding: .3rem .6rem; border-radius: 6px; border: none; background: var(--cnpg-red); color: #fff; font-size: .75rem; cursor: pointer; }
  .toggle { padding: .3rem .6rem; border-radius: 6px; border: 1px solid var(--cnpg-gray-300); background: #dcfce7; color: #166534; font-size: .75rem; cursor: pointer; }
  .toggle.suspended { background: var(--cnpg-gray-100); color: var(--cnpg-gray-500); }
  .empty { text-align: center; padding: 3rem; color: var(--cnpg-gray-400); }
  .error-box { background: #fee2e2; color: #991b1b; padding: .75rem 1rem; border-radius: 8px; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; font-size: .875rem; }
  .dismiss { background: none; border: none; color: #991b1b; font-size: 1.25rem; cursor: pointer; padding: 0; line-height: 1; }
</style>
