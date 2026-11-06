/** Sensor Dashboard's types and pure rules: devices, readings, thresholds and alerts. */
export type DeviceStatus = 'online' | 'offline'
export type Severity = 'warning' | 'critical'
export interface Device { readonly id: string; readonly code: string; readonly name: string; readonly kind: string; readonly site: string; readonly zone: string; readonly unit: string; readonly status: DeviceStatus; readonly lastSeenAt: string }
export interface Reading { readonly id: string; readonly deviceId: string; readonly value: number; readonly unit: string; readonly recordedAt: string }
export interface Threshold { readonly deviceId: string; readonly warning: number; readonly critical: number; readonly comparison: 'above' | 'below' }
export interface Alert { readonly id: string; readonly deviceId: string; readonly readingId: string; readonly severity: Severity; readonly state: 'open' | 'acknowledged'; readonly occurredAt: string; readonly acknowledgedAt?: string }
export interface SensorsState { readonly version: 1; devices: Device[]; readings: Reading[]; thresholds: Threshold[]; alerts: Alert[] }
export type SensorsErrorCode = 'invalid' | 'not-found' | 'conflict'
export class SensorsError extends Error { readonly code: SensorsErrorCode; constructor(code: SensorsErrorCode, message: string) { super(message); this.code = code; this.name = 'SensorsError' } }
const pad = (n: number): string => String(n).padStart(2, '0')
export const dayOf = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
export const stampOf = (date: Date): string => `${dayOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
export function whenText(stamp: string, now: Date): string {
  const seconds = Math.max(1, Math.floor((now.getTime() - new Date(stamp).getTime()) / 1000))
  if (seconds < 90) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 90) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  return `${hours}h ago`
}
/** `24.6`, `1,240`, `36`: readings shown with at most one decimal and grouped thousands. */
export function valueText(value: number): string {
  const rounded = Number.isInteger(value) ? value : Math.round(value * 10) / 10
  const [whole, fraction] = String(Math.abs(rounded)).split('.') as [string, string | undefined]
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${rounded < 0 ? '-' : ''}${grouped}${fraction === undefined ? '' : `.${fraction}`}`
}

/** The severity a value crosses for a threshold, or null when it is inside the range. */
export function evaluate(value: number, threshold: Threshold | undefined): Severity | null {
  if (threshold === undefined) return null
  if (threshold.comparison === 'above') return value >= threshold.critical ? 'critical' : value >= threshold.warning ? 'warning' : null
  return value <= threshold.critical ? 'critical' : value <= threshold.warning ? 'warning' : null
}
export function seriesOf(readings: readonly Reading[], deviceId: string, limit = 24): number[] {
  return readings.filter((reading) => reading.deviceId === deviceId).slice(-limit).map((reading) => reading.value)
}
export function sparkPath(values: readonly number[], width = 280, height = 64): string {
  if (values.length === 0) return ''
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'}${((index / Math.max(1, values.length - 1)) * width).toFixed(0)} ${(height - ((value - min) / span) * height).toFixed(0)}`).join(' ')
}
export function cleanReading(value: unknown): number {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new SensorsError('invalid', 'The reading value must be a number.')
  return number
}
export function cleanThreshold(value: unknown, field: string): number {
  const number = Number(value)
  if (!Number.isFinite(number)) throw new SensorsError('invalid', `The ${field} threshold must be a number.`)
  return number
}
