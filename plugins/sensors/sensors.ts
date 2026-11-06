/** The device fleet: devices, readings, thresholds and alerts, and the ingest operation. */
import { cleanReading, cleanThreshold, evaluate, type Alert, type Device, type SensorsState, SensorsError, stampOf, type Reading, type Severity, type Threshold } from './domain.ts'
import { seed } from './seed.ts'
import type { Store } from './store.ts'
export interface SensorsAdapters { readonly store: Store<SensorsState>; readonly clock: () => Date; readonly newId: (kind: string) => string }
export class Sensors {
  private state: SensorsState
  private readonly adapters: SensorsAdapters
  private constructor(state: SensorsState, adapters: SensorsAdapters) { this.state = state; this.adapters = adapters }
  static async open(adapters: SensorsAdapters): Promise<Sensors> { const saved = await adapters.store.load(); return new Sensors(saved ?? seed(adapters.clock(), adapters.newId), adapters) }
  get now(): Date { return this.adapters.clock() }
  devices(): readonly Device[] { return this.state.devices }
  device(id: string): Device | undefined { return this.state.devices.find((device) => device.id === id) }
  readings(deviceId: string): readonly Reading[] { return this.state.readings.filter((reading) => reading.deviceId === deviceId) }
  latest(deviceId: string): Reading | undefined { return this.readings(deviceId).at(-1) }
  thresholdOf(deviceId: string): Threshold | undefined { return this.state.thresholds.find((threshold) => threshold.deviceId === deviceId) }
  alerts(state?: 'open' | 'acknowledged'): readonly Alert[] { return [...this.state.alerts].filter((alert) => state === undefined || alert.state === state).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)) }
  stats(): { active: number; total: number; alerts: number; uptime: number } {
    const active = this.state.devices.filter((device) => device.status === 'online').length
    return { active, total: this.state.devices.length, alerts: this.state.alerts.filter((alert) => alert.state === 'open').length, uptime: 99.7 }
  }
  /** Ingest one reading: validate the device and unit, record it, then open an alert when a threshold is crossed. */
  async ingest(deviceId: string, value: unknown, unit: string): Promise<{ reading: Reading; alert: Alert | undefined }> {
    const device = this.device(deviceId)
    if (device === undefined) throw new SensorsError('not-found', 'That device is not registered.')
    if (unit !== '' && unit !== device.unit) throw new SensorsError('invalid', `This device reports in ${device.unit}.`)
    const number = cleanReading(value)
    const reading: Reading = { id: this.adapters.newId('reading'), deviceId, value: number, unit: device.unit, recordedAt: stampOf(this.adapters.clock()) }
    this.state.readings.push(reading)
    this.state.devices = this.state.devices.map((item) => (item.id === deviceId ? { ...item, status: 'online', lastSeenAt: reading.recordedAt } : item))
    const severity: Severity | null = evaluate(number, this.thresholdOf(deviceId))
    let alert: Alert | undefined
    if (severity !== null && !this.state.alerts.some((item) => item.deviceId === deviceId && item.state === 'open')) {
      alert = { id: this.adapters.newId('alert'), deviceId, readingId: reading.id, severity, state: 'open', occurredAt: reading.recordedAt }
      this.state.alerts.push(alert)
    }
    await this.save()
    return { reading, alert }
  }
  async acknowledge(alertId: string): Promise<Alert> {
    const alert = this.state.alerts.find((item) => item.id === alertId)
    if (alert === undefined) throw new SensorsError('not-found', 'That alert no longer exists.')
    if (alert.state === 'acknowledged') return alert
    const next = { ...alert, state: 'acknowledged' as const, acknowledgedAt: stampOf(this.adapters.clock()) }
    this.state.alerts = this.state.alerts.map((item) => (item.id === alertId ? next : item))
    await this.save()
    return next
  }
  async setThreshold(deviceId: string, warning: unknown, critical: unknown): Promise<Threshold> {
    if (this.device(deviceId) === undefined) throw new SensorsError('not-found', 'That device is not registered.')
    const warn = cleanThreshold(warning, 'warning')
    const crit = cleanThreshold(critical, 'critical')
    if (warn >= crit) throw new SensorsError('invalid', 'The warning threshold must be below the critical one.')
    const threshold: Threshold = { deviceId, warning: warn, critical: crit, comparison: 'above' }
    this.state.thresholds = [...this.state.thresholds.filter((item) => item.deviceId !== deviceId), threshold]
    await this.save()
    return threshold
  }
  /** A demo refresh: append a new reading around each online device's last value. */
  async simulate(): Promise<number> {
    let count = 0
    for (const device of this.state.devices.filter((item) => item.status === 'online')) {
      const last = this.latest(device.id)?.value ?? 0
      await this.ingest(device.id, Math.round((last + (Math.random() - 0.5) * 0.6) * 100) / 100, device.unit)
      count++
    }
    return count
  }
  private async save(): Promise<void> { this.state = { ...this.state, devices: [...this.state.devices], readings: [...this.state.readings], thresholds: [...this.state.thresholds], alerts: [...this.state.alerts] }; await this.adapters.store.save(this.state) }
}
