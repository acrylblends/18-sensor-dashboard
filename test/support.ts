import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SensorsState } from '../plugins/sensors/domain.ts'
import { memoryStore } from '../plugins/sensors/store.ts'
import { pinnedInstance, withPort } from '../plugins/instance/index.ts'
import { type App, type AppOptions, createApp } from '../src/app.ts'
export const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })
process.env.TZ = 'UTC'
export const NOW = new Date(2026, 10, 6, 9, 41)
export interface TestApp extends App { readonly store: ReturnType<typeof memoryStore<SensorsState>>; page(path: string): Promise<{ status: number; html: string; response: Response }>; post(path: string, fields: Record<string, string>): Promise<Response> }
export async function withApp(run: (app: TestApp) => Promise<void>, options: AppOptions = {}): Promise<void> {
  const home = await mkdtemp(join(scratch, 'app-test-'))
  let ids = 0
  const store = memoryStore<SensorsState>()
  const app = await createApp(withPort(pinnedInstance(home, { root: projectRoot }), 0), { ...options, listen: false, overrides: { ...options.overrides, sensors: { store, clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}`, ...options.overrides?.sensors } } })
  const prefix = options.prefix ?? ''
  const test: TestApp = { ...app, store, async page(path) { const response = await app.root.router.request(`${prefix}${path}`, { headers: { accept: 'text/html' } }); return { status: response.status, html: await response.text(), response } }, post(path, fields) { return Promise.resolve(app.root.router.request(`${prefix}${path}`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html' }, body: new URLSearchParams(fields).toString() })) } }
  try { await run(test) } finally { await app.stop(); await rm(home, { recursive: true, force: true }) }
}
export function noticeOf(response: Response): { kind: string; text: string; path: string } {
  const location = response.headers.get('location') ?? ''
  const url = new URL(location, 'http://local')
  for (const kind of ['ok', 'error', 'warn']) { const text = url.searchParams.get(kind); if (text !== null) return { kind, text, path: url.pathname } }
  return { kind: '', text: '', path: url.pathname }
}
