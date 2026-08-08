<script lang="ts">
  import { onMount } from 'svelte';
  import { login } from '$lib/stores/auth';
  import { goto } from '$app/navigation';
  import { loadConfig, beginLogin, completeLogin, decodeClaims } from '$lib/auth/oidc';

  let authUrl = $state('');
  let error = $state('');
  let busy = $state(false);

  onMount(async () => {
    const params = new URLSearchParams(window.location.search);

    // The issuer reports failures on the redirect, not in the token exchange.
    const idpError = params.get('error');
    if (idpError) {
      error = `${idpError}: ${params.get('error_description') ?? 'no description given'}`;
      return;
    }

    try {
      const cfg = await loadConfig();

      const code = params.get('code');
      if (code) {
        busy = true;
        const idToken = await completeLogin(cfg, code, params.get('state') ?? '');
        // Strip code/state so a refresh does not replay a spent code.
        history.replaceState({}, '', '/login');
        login(idToken, decodeClaims(idToken));
        await goto('/clusters');
        return;
      }

      authUrl = await beginLogin(cfg);
    } catch (e: any) {
      error = e?.message ?? String(e);
      busy = false;
    }
  });
</script>

<div class="login-page">
  <div class="login-card">
    <span style="font-size:3rem">🐘</span>
    <h1>CNPG Console</h1>
    <p>Web management for CloudNativePG</p>

    {#if error}
      <p class="error">{error}</p>
      <a href="/login" class="login-btn">Try again</a>
    {:else if busy}
      <p>Signing in…</p>
    {:else if authUrl}
      <a href={authUrl} class="login-btn">Sign in with SSO</a>
    {:else}
      <p>Loading…</p>
    {/if}
  </div>
</div>

<style>
  .login-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, var(--cnpg-blue-dark), var(--cnpg-blue)); }
  .login-card { background: #fff; border-radius: 16px; padding: 3rem; text-align: center; box-shadow: 0 25px 50px rgba(0,0,0,.25); max-width: 380px; width: 90%; }
  h1 { margin: .5rem 0 .25rem; color: var(--cnpg-blue-dark); }
  p { color: var(--cnpg-gray-500); margin: 0 0 2rem; }
  .login-btn { display: block; padding: .875rem; border-radius: 8px; background: var(--cnpg-teal); color: #fff; text-decoration: none; font-weight: 600; }
  .error { color: #b3261e; font-size: .8125rem; word-break: break-word; margin-bottom: 1rem; }
</style>
