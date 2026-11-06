/** The Sensor Dashboard shell: the SENSEGRID top bar with the tenant, the ingest label and the simulate action. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import type { Sensors } from '../sensors/index.ts'
import { createShell, escapeHtml, type NavItem, type Shell } from './core.ts'
import { STYLES } from './styles.ts'
export * from './core.ts'
export const APP_TITLE = 'Sensor Dashboard'
export interface ShellConfig { readonly prefix?: string }
export const name = 'sensors-shell'
export const inject = ['sensors', 'router']
declare module '@deepseek-ai/cordis' { interface Context { shell: Shell } }
function topbar(_nav: readonly NavItem[], _crumbs: readonly string[], href: (path: string) => string, _meta: string, _active: string | undefined): string {
  return `<header class="top"><a class="logo" href="${href('/')}" style="text-decoration:none;color:inherit">SENSE<span><i>GRID</i></span></a><div class="tenant">SITE / GREENHOUSE NORTH · 12 DEVICES</div><div class="topright">INGEST / HTTP · DEMO STREAM</div><form method="post" action="${href('/simulate')}" style="margin:0"><button style="background:#1a4147;color:#e4f0ed;border:1px solid #45676a;border-radius:4px;padding:8px 11px;font-size:8px">▶ Simulate readings</button></form></header>`
}
export function apply(ctx: Context, config: ShellConfig = {}): void {
  const sensors: Sensors = ctx.sensors
  const prefix = config.prefix ?? ''
  const shell = createShell(prefix, { appTitle: APP_TITLE, css: STYLES, bodyClass: 'sensors', topbar: (nav, crumbs, href, meta, active) => topbar(nav, crumbs, href, meta, active) })
  ctx.provide('shell', shell)
  ctx.router.route(prefix === '' ? '/' : prefix, new Acryl().get('/health', (c) => c.json({ ok: true })))
  void sensors
}
