/** The greenhouse a new install starts with: twelve devices, readings, two thresholds and two alerts. */
import type { Alert, Device, Reading, SensorsState, Threshold } from './domain.ts'
import { stampOf } from './domain.ts'
export function seed(now: Date, newId: (kind: string) => string): SensorsState {
  const at = (minutesAgo: number): string => stampOf(new Date(now.getTime() - minutesAgo * 60_000))
  const devices: Device[] = [
    { id: newId('device'), code: 'GHN-TMP-01', name: 'Air temperature', kind: 'Temperature', site: 'Greenhouse North', zone: 'Zone A', unit: '°C', status: 'online', lastSeenAt: at(0.5) },
    { id: newId('device'), code: 'GHN-HUM-03', name: 'Relative humidity', kind: 'Humidity', site: 'Greenhouse North', zone: 'Zone A', unit: '% RH', status: 'online', lastSeenAt: at(0.6) },
    { id: newId('device'), code: 'GHN-CO2-02', name: 'CO₂ concentration', kind: 'CO₂', site: 'Greenhouse North', zone: 'Zone B', unit: 'ppm', status: 'online', lastSeenAt: at(0.4) },
    { id: newId('device'), code: 'GHN-SOL-04', name: 'Soil moisture', kind: 'Soil moisture', site: 'Greenhouse North', zone: 'Zone C', unit: '%', status: 'online', lastSeenAt: at(0.7) },
    { id: newId('device'), code: 'GHN-LUX-01', name: 'Light', kind: 'Light', site: 'Greenhouse North', zone: 'Zone A', unit: 'lx', status: 'online', lastSeenAt: at(0.5) },
    { id: newId('device'), code: 'GHN-TMP-02', name: 'Air temperature', kind: 'Temperature', site: 'Greenhouse North', zone: 'Zone B', unit: '°C', status: 'online', lastSeenAt: at(0.8) },
    { id: newId('device'), code: 'GHN-HUM-04', name: 'Relative humidity', kind: 'Humidity', site: 'Greenhouse North', zone: 'Zone B', unit: '% RH', status: 'online', lastSeenAt: at(0.9) },
    { id: newId('device'), code: 'GHN-SOL-05', name: 'Soil moisture', kind: 'Soil moisture', site: 'Greenhouse North', zone: 'Zone A', unit: '%', status: 'online', lastSeenAt: at(0.4) },
    { id: newId('device'), code: 'GHN-LUX-02', name: 'Light', kind: 'Light', site: 'Greenhouse North', zone: 'Zone C', unit: 'lx', status: 'online', lastSeenAt: at(0.6) },
    { id: newId('device'), code: 'GHN-CO2-01', name: 'CO₂ concentration', kind: 'CO₂', site: 'Greenhouse North', zone: 'Zone A', unit: 'ppm', status: 'online', lastSeenAt: at(0.5) },
    { id: newId('device'), code: 'GHN-TMP-03', name: 'Air temperature', kind: 'Temperature', site: 'Greenhouse North', zone: 'Zone C', unit: '°C', status: 'online', lastSeenAt: at(0.7) },
    { id: newId('device'), code: 'GHN-WTR-01', name: 'Water flow', kind: 'Flow', site: 'Greenhouse North', zone: 'Utility', unit: 'L/min', status: 'offline', lastSeenAt: at(40) },
  ]
  const values: Readonly<Record<string, number>> = { 'GHN-TMP-01': 24.6, 'GHN-HUM-03': 58.2, 'GHN-CO2-02': 1240, 'GHN-SOL-04': 36, 'GHN-LUX-01': 820, 'GHN-TMP-02': 33, 'GHN-HUM-04': 61.4, 'GHN-SOL-05': 33, 'GHN-LUX-02': 760, 'GHN-CO2-01': 940, 'GHN-TMP-03': 25.1, 'GHN-WTR-01': 0 }
  const readings: Reading[] = []
  for (const device of devices) {
    const base = values[device.code] ?? 0
    for (let index = 0; index < 24; index++) readings.push({ id: newId('reading'), deviceId: device.id, value: index === 23 ? base : Math.round((base + Math.sin(index / 3) * (base * 0.04) + (index % 2 === 0 ? 0.2 : -0.2)) * 100) / 100, unit: device.unit, recordedAt: at(24 * 60 - index * 60) })
  }
  const thresholds: Threshold[] = [
    { deviceId: devices[2]!.id, warning: 1000, critical: 1500, comparison: 'above' },
    { deviceId: devices[0]!.id, warning: 28, critical: 32, comparison: 'above' },
    { deviceId: devices[5]!.id, warning: 28, critical: 32, comparison: 'above' },
  ]
  const co2 = readings.filter((reading) => reading.deviceId === devices[2]!.id).at(-1)
  const temp = readings.filter((reading) => reading.deviceId === devices[0]!.id).at(-1)
  const hot = readings.filter((reading) => reading.deviceId === devices[5]!.id).at(-1)
  const alerts: Alert[] = [
    { id: newId('alert'), deviceId: devices[2]!.id, readingId: co2?.id ?? '', severity: 'warning', state: 'open', occurredAt: at(3) },
    { id: newId('alert'), deviceId: devices[0]!.id, readingId: temp?.id ?? '', severity: 'warning', state: 'acknowledged', occurredAt: at(90), acknowledgedAt: at(80) },
    { id: newId('alert'), deviceId: devices[5]!.id, readingId: hot?.id ?? '', severity: 'critical', state: 'open', occurredAt: at(5) },
  ]
  return { version: 1, devices, readings, thresholds, alerts }
}
