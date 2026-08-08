<script lang="ts">
  import '../app.css';
  import { auth, restoreSession, logout } from '$lib/stores/auth';
  import { currentNamespace, allNamespaces, ALL_NAMESPACES } from '$lib/stores/namespace';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { k8s } from '$lib/api/kubernetes';
  import { clusters, currentCluster, initClusters, selectCluster } from '$lib/stores/cluster';
  import { loadConfig } from '$lib/auth/oidc';
  let { children } = $props();

  onMount(async () => {
    restoreSession();
    // Cluster list rides along in /config.json, so adding a cluster is a
    // ConfigMap change plus an nginx route -- no image rebuild.
    try {
      const cfg: any = await loadConfig();
      initClusters(cfg.clusters ?? []);
    } catch (e) {
      console.error('Failed to load cluster list:', e);
    }
  });

  // Redirect to login when not authenticated (except on /login itself)
  $effect(() => {
    if (!$auth.authenticated && $page.url.pathname !== '/login') {
      goto('/login');
    }
  });

  // Namespaces are per-cluster: re-read them whenever either changes, and
  // drop the current selection so a namespace from the old cluster is never
  // carried across (it usually does not exist on the new one).
  $effect(() => {
    if ($auth.authenticated && $currentCluster) {
      loadNamespaces();
    }
  });

  function onClusterChange(e: Event) {
    const key = (e.target as HTMLSelectElement).value;
    currentNamespace.set('');
    allNamespaces.set([]);
    selectCluster(key);
  }

  async function loadNamespaces() {
    try {
      const res = await k8s.listNamespaces();
      const names = (res.items || []).map((ns: any) => ns.metadata.name).sort();
      allNamespaces.set(names);
      // Default to every namespace. This is a fleet console: defaulting to
      // 'default' showed an empty page, because CNPG clusters live in their
      // own namespaces and essentially never in 'default'.
      if (!$currentNamespace) currentNamespace.set(ALL_NAMESPACES);
    } catch (e) {
      console.error('Failed to fetch namespaces:', e);
    }
  }

  const nav = [
    { href: '/clusters', label: 'Clusters', icon: '🐘' },
    { href: '/backups', label: 'Backups', icon: '💾' },
    { href: '/poolers', label: 'Poolers', icon: '🔄' },
    { href: '/databases', label: 'Databases', icon: '🗄️' },
    { href: '/replication', label: 'Replication', icon: '🔗' },
    { href: '/monitoring', label: 'Monitoring', icon: '📊' },
    { href: '/settings', label: 'Settings', icon: '⚙️' },
  ];
</script>

{#if $auth.authenticated}
<div class="shell">
  <nav class="sidebar">
    <div class="logo">CNPG Console</div>
    <div class="nav-items">
      {#each nav as item}<a href={item.href} class="nav-link"><span>{item.icon}</span> {item.label}</a>{/each}
    </div>
    <div class="sidebar-bottom">
      {#if $clusters.length > 1}
        <select value={$currentCluster} onchange={onClusterChange} class="ns-sel cluster-sel">
          {#each $clusters as c}<option value={c.key}>{c.label}</option>{/each}
        </select>
      {/if}
      <select bind:value={$currentNamespace} class="ns-sel">
        <option value={ALL_NAMESPACES}>All namespaces</option>
        {#each $allNamespaces as ns}<option value={ns}>{ns}</option>{/each}
      </select>
      <div class="user-info">{$auth.user?.name}</div>
      <button onclick={() => { logout(); goto('/login'); }} class="logout-btn">Logout</button>
    </div>
  </nav>
  <main class="content">{@render children()}</main>
</div>
{:else if $page.url.pathname === '/login'}
  {@render children()}
{:else}
  <div class="loading-screen">
    <p>Redirecting to login...</p>
  </div>
{/if}

<style>
  .shell { display: flex; height: 100vh; }
  .sidebar { width: 240px; background: var(--cnpg-blue-dark); color: #fff; display: flex; flex-direction: column; }
  .logo { padding: 1.5rem 1rem; font-size: 1.2rem; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,.1); }
  .nav-items { flex: 1; padding: 1rem 0; }
  .nav-link { display: flex; gap: .75rem; padding: .75rem 1.25rem; color: rgba(255,255,255,.7); text-decoration: none; }
  .nav-link:hover { background: rgba(255,255,255,.08); color: #fff; }
  .sidebar-bottom { padding: 1rem; border-top: 1px solid rgba(255,255,255,.1); }
  .cluster-sel { font-weight: 600; margin-bottom: .4rem; }
  .ns-sel { width: 100%; padding: .4rem; border-radius: 6px; background: rgba(255,255,255,.05); color: #fff; border: 1px solid rgba(255,255,255,.2); margin-bottom: .5rem; }
  .user-info { font-size: .8rem; color: rgba(255,255,255,.5); margin-bottom: .5rem; }
  .logout-btn { width: 100%; padding: .4rem; border-radius: 6px; border: 1px solid rgba(255,255,255,.2); background: transparent; color: rgba(255,255,255,.6); cursor: pointer; }
  .content { flex: 1; overflow: auto; padding: 2rem; }
  .loading-screen { display: flex; align-items: center; justify-content: center; height: 100vh; color: var(--cnpg-gray-400); }
</style>
