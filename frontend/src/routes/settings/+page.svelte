<script lang="ts">
  import { onMount } from 'svelte';
  import { k8s } from '$lib/api/kubernetes';
  import { currentNamespace, nsScope } from '$lib/stores/namespace';

  let scs: any[] = $state([]);
  let imageCatalogs: any[] = $state([]);
  let clusterImageCatalogs: any[] = $state([]);
  let tab: 'storage' | 'images' = $state('storage');

  currentNamespace.subscribe(() => loadImageCatalogs());

  async function loadImageCatalogs() {
    // undefined => cluster-scoped list/watch across all namespaces
    const ns = nsScope($currentNamespace);
    
    try {
      imageCatalogs = (await k8s.imagecatalogs.list(ns)).items || [];
    } catch {}
  }

  onMount(async () => {
    try { scs = (await k8s.listStorageClasses()).items || []; } catch {}
    try { clusterImageCatalogs = (await k8s.clusterimagecatalogs.list()).items || []; } catch {}
    loadImageCatalogs();
  });
</script>

<div>
  <h2>Settings</h2>

  <div class="tabs">
    <button class:active={tab==='storage'} onclick={()=>tab='storage'}>Storage Classes</button>
    <button class:active={tab==='images'} onclick={()=>tab='images'}>Image Catalogs</button>
  </div>

  {#if tab === 'storage'}
    {#if !scs.length}<p class="empty">No storage classes found.</p>{:else}
    <table>
      <thead><tr><th>Name</th><th>Provisioner</th><th>Reclaim Policy</th><th>Volume Binding</th><th>Default</th></tr></thead>
      <tbody>{#each scs as s}
        <tr>
          <td><strong>{s.metadata.name}</strong></td>
          <td><code>{s.provisioner}</code></td>
          <td>{s.reclaimPolicy}</td>
          <td>{s.volumeBindingMode}</td>
          <td>{s.metadata.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true' ? 'Yes' : 'No'}</td>
        </tr>
      {/each}</tbody>
    </table>{/if}

  {:else if tab === 'images'}
    <h3>Namespace Image Catalogs ({$currentNamespace})</h3>
    {#if !imageCatalogs.length}<p class="empty">No image catalogs in this namespace.</p>{:else}
    <table>
      <thead><tr><th>Name</th><th>Images</th></tr></thead>
      <tbody>{#each imageCatalogs as ic}
        <tr>
          <td><strong>{ic.metadata.name}</strong></td>
          <td>
            {#each ic.spec.images as img}
              <div class="image-row"><span class="major">PG {img.major}</span> <code>{img.image}</code></div>
            {/each}
          </td>
        </tr>
      {/each}</tbody>
    </table>{/if}

    <h3 style="margin-top:1.5rem">Cluster-wide Image Catalogs</h3>
    {#if !clusterImageCatalogs.length}<p class="empty">No cluster-wide image catalogs.</p>{:else}
    <table>
      <thead><tr><th>Name</th><th>Images</th></tr></thead>
      <tbody>{#each clusterImageCatalogs as cic}
        <tr>
          <td><strong>{cic.metadata.name}</strong></td>
          <td>
            {#each cic.spec.images as img}
              <div class="image-row"><span class="major">PG {img.major}</span> <code>{img.image}</code></div>
            {/each}
          </td>
        </tr>
      {/each}</tbody>
    </table>{/if}
  {/if}
</div>

<style>
  h2 { color: var(--cnpg-blue-dark); margin-bottom: 1rem; }
  h3 { color: var(--cnpg-gray-600); margin-bottom: .75rem; font-size: .95rem; }
  .tabs { display: flex; gap: .5rem; margin-bottom: 1.5rem; }
  .tabs button { padding: .5rem 1rem; border-radius: 6px; border: 1px solid var(--cnpg-gray-200); background: #fff; cursor: pointer; }
  .tabs button.active { background: var(--cnpg-teal); color: #fff; border-color: var(--cnpg-teal); }
  table { width: 100%; border-collapse: collapse; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  th { text-align: left; padding: .75rem 1rem; background: var(--cnpg-gray-50); color: var(--cnpg-gray-500); font-size: .8rem; text-transform: uppercase; }
  td { padding: .75rem 1rem; border-top: 1px solid var(--cnpg-gray-100); }
  code { font-family: var(--font-mono); background: var(--cnpg-gray-100); padding: .15rem .4rem; border-radius: 4px; font-size: .85rem; }
  .image-row { padding: .2rem 0; display: flex; gap: .75rem; align-items: center; }
  .major { font-weight: 600; color: var(--cnpg-blue); font-size: .85rem; min-width: 4rem; }
  .empty { text-align: center; padding: 2rem; color: var(--cnpg-gray-400); }
</style>
