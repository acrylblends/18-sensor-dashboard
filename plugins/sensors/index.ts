/** The fleet as a plugin: devices, readings, thresholds and alerts in the app's data home, provided as `ctx.sensors`. */
import { randomUUID } from 'node:crypto'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import type { SensorsState } from './domain.ts'
import { Sensors, type SensorsAdapters } from './sensors.ts'
import { jsonFileStore, type Store } from './store.ts'
export * from './domain.ts'
export * from './sensors.ts'
export * from './store.ts'
export { seed } from './seed.ts'
declare module '@deepseek-ai/cordis' { interface Context { sensors: Sensors } }
export interface SensorsConfig { readonly store?: Store<SensorsState>; readonly clock?: () => Date; readonly newId?: SensorsAdapters['newId']; readonly file?: string }
export const name = 'sensors'
export const inject = ['appInstance']
export async function apply(ctx: Context, config: SensorsConfig = {}): Promise<void> {
  const file = config.file ?? 'sensor-dashboard.json'
  const sensors = await Sensors.open({ store: config.store ?? jsonFileStore<SensorsState>(isAbsolute(file) ? file : join(ctx.appInstance.home, file), 'Sensor Dashboard'), clock: config.clock ?? (() => new Date()), newId: config.newId ?? ((kind) => `${kind}-${randomUUID().slice(0, 8)}`) })
  ctx.provide('sensors', sensors)
}
