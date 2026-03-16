/**
 * Next.js Instrumentation — runs once when the server starts.
 * Sets up a global HTTP proxy dispatcher so that server-side `fetch()`
 * respects the local proxy (e.g. Clash on 127.0.0.1:7897).
 *
 * Only activates when `https_proxy` or `HTTPS_PROXY` env var is set.
 * Has no effect in the browser or on Vercel (where no proxy is needed).
 */
export async function register() {
  const proxyUrl =
    process.env.https_proxy ||
    process.env.HTTPS_PROXY ||
    process.env.http_proxy ||
    process.env.HTTP_PROXY;

  if (proxyUrl && typeof globalThis.fetch !== "undefined") {
    try {
      const { ProxyAgent, setGlobalDispatcher } = await import("undici");
      setGlobalDispatcher(new ProxyAgent(proxyUrl));
      console.log(`[instrumentation] Global fetch proxy → ${proxyUrl}`);
    } catch {
      // undici not installed or incompatible — skip silently
    }
  }
}
