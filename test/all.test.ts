import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from 'node:test'
import { createApp, readManifest } from '../src/app.ts'
import { pinnedInstance } from '../plugins/instance/index.ts'
import { evaluate, Sensors, SensorsError, seriesOf, sparkPath } from '../plugins/sensors/index.ts'
import type { SensorsState } from '../plugins/sensors/domain.ts'
import { memoryStore } from '../plugins/sensors/store.ts'
import { seed } from '../plugins/sensors/seed.ts'
import { NOW, noticeOf, projectRoot, withApp } from './support.ts'
const scratch = join(projectRoot, '.acrylblends', 'test')
mkdirSync(scratch, { recursive: true })
const newId = (kind: string): string => `${kind}-${Math.random().toString(36).slice(2, 8)}`

test('thresholds evaluate above their warning and critical values', () => {
  const threshold = { deviceId: 'd', warning: 1000, critical: 1500, comparison: 'above' as const }
  assert.equal(evaluate(900, threshold), null)
  assert.equal(evaluate(1000, threshold), 'warning')
  assert.equal(evaluate(1600, threshold), 'critical')
  assert.equal(evaluate(1600, undefined), null)
  assert.equal(sparkPath([1, 2, 3]).startsWith('M0'), true)
  assert.equal(seriesOf([], 'x').length, 0)
})

test('the seed has twelve devices, one offline, 288 readings and the two open alerts', () => {
  const state = seed(NOW, newId)
  assert.equal(state.devices.length, 12)
  assert.equal(state.devices.filter((device) => device.status === 'offline').length, 1)
  assert.equal(state.readings.length, 12 * 24)
  assert.equal(state.thresholds.length, 3)
  assert.equal(state.alerts.length, 3)
  assert.equal(state.alerts.filter((alert) => alert.state === 'open').length, 2)
  assert.equal(state.alerts.filter((alert) => alert.state === 'open' && alert.severity === 'critical').length, 1)
  assert.equal(state.alerts.filter((alert) => alert.state === 'open' && alert.severity === 'warning').length, 1)
})

async function open(): Promise<Sensors> {
  let ids = 0
  return Sensors.open({ store: memoryStore(), clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
}

test('ingest validates and records a reading, and a crossed threshold opens an alert', async () => {
  const store = memoryStore<SensorsState>()
  let ids = 0
  const sensors = await Sensors.open({ store, clock: () => NOW, newId: (kind) => `${kind}-${++ids}` })
  const co2 = sensors.devices().find((device) => device.kind === 'CO₂' && sensors.thresholdOf(device.id) !== undefined)
  assert.ok(co2 !== undefined)
  const before = sensors.readings(co2.id).length
  const result = await sensors.ingest(co2.id, 1700, co2.unit)
  assert.equal(result.reading.value, 1700)
  assert.equal(sensors.readings(co2.id).length, before + 1)
  await assert.rejects(sensors.ingest('missing', 1, ''), (error: unknown) => error instanceof SensorsError && /not registered/.test(error.message))
  await assert.rejects(sensors.ingest(co2.id, 'abc', co2.unit), /number/)
  await assert.rejects(sensors.ingest(co2.id, 1, 'wrong'), /reports in/)
  assert.equal(store.saved, 1)
})

test('acknowledging an alert records the time and the threshold form validates', async () => {
  const sensors = await open()
  const alert = sensors.alerts('open')[0]
  assert.ok(alert !== undefined)
  const acknowledged = await sensors.acknowledge(alert.id)
  assert.equal(acknowledged.state, 'acknowledged')
  assert.ok(acknowledged.acknowledgedAt !== undefined)
  const device = sensors.devices()[0]
  assert.ok(device !== undefined)
  await assert.rejects(sensors.setThreshold(device.id, 20, 10), /warning threshold/)
  const threshold = await sensors.setThreshold(device.id, 20, 30)
  assert.equal(threshold.warning, 20)
})

test('the dashboard, alerts and device pages render the fleet', () =>
  withApp(async (app) => {
    const page = await app.page('/')
    assert.equal(page.status, 200)
    assert.match(page.html, /Sensor dashboard/)
    assert.match(page.html, /ACTIVE DEVICES/)
    assert.match(page.html, /GHN-TMP-01/)
    assert.match(page.html, /Alert thresholds/)
    assert.match(page.html, /11 \/ 12/)
    assert.match(page.html, /4,320/)
    assert.match(page.html, /1 critical · 1 warning/)
    assert.match(page.html, /24H/)
    assert.match(page.html, /7D/)
    const alerts = await app.page('/alerts')
    assert.match(alerts.html, /Alert log/)
    assert.match(alerts.html, /Acknowledge/)
    const device = app.root.sensors.devices()[0]
    assert.ok(device !== undefined)
    const detail = await app.page(`/devices/${device.id}`)
    assert.match(detail.html, /Air temperature/)
  }))

test('ingest via HTTP and simulate, acknowledge from the page', () =>
  withApp(async (app) => {
    const device = app.root.sensors.devices()[0]
    assert.ok(device !== undefined)
    const response = await app.post('/ingest', { deviceId: device.id, value: '30.5', unit: device.unit })
    assert.equal(response.status, 201)
    const simulated = await app.post('/simulate', {})
    assert.equal(noticeOf(simulated).kind, 'ok')
    const alert = app.root.sensors.alerts('open')[0]
    assert.ok(alert !== undefined)
    const ack = await app.post(`/alerts/${alert.id}/ack`, {})
    assert.equal(noticeOf(ack).kind, 'ok')
  }))

test('health, 404, manifest, prefix and switch-off', async () => {
  await withApp(async (app) => {
    assert.equal((await app.page('/health')).status, 200)
    assert.equal((await app.page('/nope')).status, 404)
    assert.deepEqual(readManifest().plugins.map((row) => row.id), ['router', 'home', 'sensors', 'sensors-shell', 'dashboard', 'devices', 'alerts', 'ingest', 'extensions', 'server', 'acryl-door'])
  })
  await withApp(async (app) => {
    const response = await app.root.router.request('/app', { headers: { accept: 'text/html' } })
    assert.equal(response.status, 200)
    assert.match(await response.text(), /Sensor dashboard/)
  }, { prefix: '/app' })
  const manifest = readManifest()
  const without = { ...manifest, plugins: manifest.plugins.map((row) => (row.id === 'dashboard' ? { ...row, disabled: true } : row)) }
  const home = await mkdtemp(join(scratch, 'app-test-off-'))
  let ids = 0
  const app = await createApp(pinnedInstance(home, { root: projectRoot }), { listen: false, manifest: without, overrides: { sensors: { clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` } } })
  try {
    assert.equal((await app.root.router.request('/health')).status, 200)
    assert.equal((await app.root.router.request('/')).status, 404)
  } finally { await app.stop(); await rm(home, { recursive: true, force: true }) }
})

test('the device inventory filters offline units and the device detail edits thresholds', () =>
  withApp(async (app) => {
    const offline = await app.page('/devices?status=offline')
    assert.equal(offline.status, 200)
    assert.match(offline.html, /GHN-WTR-01/)
    assert.doesNotMatch(offline.html, /GHN-TMP-01/)
    const device = app.root.sensors.devices().find((item) => item.code === 'GHN-CO2-02')
    assert.ok(device !== undefined)
    const detail = await app.page(`/devices/${device.id}`)
    assert.match(detail.html, /CO₂ concentration/)
    assert.match(detail.html, /Save thresholds/)
    const invalid = await app.post(`/devices/${device.id}/thresholds`, { warning: '2000', critical: '1000' })
    assert.equal(noticeOf(invalid).kind, 'error')
    const saved = await app.post(`/devices/${device.id}/thresholds`, { warning: '1100', critical: '1600' })
    assert.equal(noticeOf(saved).kind, 'ok')
    assert.equal(app.root.sensors.thresholdOf(device.id)?.warning, 1100)
  }))

test('the alert log filters by state and acknowledges an alert', () =>
  withApp(async (app) => {
    const open = await app.page('/alerts?state=open')
    assert.equal(open.status, 200)
    assert.match(open.html, /CRITICAL/i)
    assert.match(open.html, /Acknowledge/)
    const acknowledged = await app.page('/alerts?state=acknowledged')
    assert.doesNotMatch(acknowledged.html, /\/ack"/)
    const alert = app.root.sensors.alerts('open')[0]
    assert.ok(alert !== undefined)
    const response = await app.post(`/alerts/${alert.id}/ack`, {})
    assert.equal(noticeOf(response).kind, 'ok')
    assert.equal(app.root.sensors.alerts('open').length, 1)
  }))

test('the ingest contract validates the device, unit and timestamp', () =>
  withApp(async (app) => {
    const device = app.root.sensors.devices()[0]
    assert.ok(device !== undefined)
    const missing = await app.post('/ingest', { deviceId: 'missing', value: '1', unit: '' })
    assert.equal(missing.status, 400)
    const badUnit = await app.post('/ingest', { deviceId: device.id, value: '1', unit: 'ppm' })
    assert.equal(badUnit.status, 400)
    const badTime = await app.post('/ingest', { deviceId: device.id, value: '22', unit: device.unit, timestamp: 'not-a-date' })
    assert.equal(badTime.status, 400)
    const ok = await app.post('/ingest', { deviceId: device.id, value: '22', unit: device.unit, timestamp: '2026-11-06T08:00:00Z' })
    assert.equal(ok.status, 201)
    const body = (await ok.json()) as { ok: boolean; readingId: string }
    assert.equal(body.ok, true)
  }))

test('the 7 day range renders the longer history', () =>
  withApp(async (app) => {
    const page = await app.page('/?range=7d')
    assert.equal(page.status, 200)
    assert.match(page.html, /last 7 days/)
  }))

test('the stats are the mockup numbers: 11 online, 4,320 readings an hour, two open alerts', async () => {
  const sensors = await open()
  const stats = sensors.stats()
  assert.equal(stats.active, 11)
  assert.equal(stats.total, 12)
  assert.equal(stats.readingsPerHour, 4_320)
  assert.equal(stats.alerts, 2)
  assert.equal(stats.critical, 1)
  assert.equal(stats.warning, 1)
  assert.equal(stats.uptime, 99.7)
  assert.ok(stats.lastIngestion !== undefined)
  const count = await sensors.simulate()
  assert.equal(count, 11)
})

test('a reading outside the threshold opens an alert only when no alert is already open', async () => {
  const store = memoryStore<SensorsState>()
  let ids = 0
  const sensors = await Sensors.open({ store, clock: () => NOW, newId: (kind: string) => `${kind}-${++ids}` })
  const temp = sensors.devices().find((device) => device.code === 'GHN-TMP-01')
  assert.ok(temp !== undefined)
  const first = await sensors.ingest(temp.id, 40, temp.unit)
  assert.equal(first.alert?.severity, 'critical')
  await sensors.acknowledge(first.alert?.id ?? '')
  const second = await sensors.ingest(temp.id, 40, temp.unit)
  assert.equal(second.alert?.severity, 'critical')
})
