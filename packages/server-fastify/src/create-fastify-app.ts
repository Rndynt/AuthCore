export async function createFastifyApp(_container: unknown) { const mod = await import('../../../src/server.js'); return mod; }
