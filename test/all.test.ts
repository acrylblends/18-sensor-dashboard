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

test('the seed has twelve devices, readings, two thresholds and two alerts', () => {
  const state = seed(NOW, newId)
  assert.equal(state.devices.length, 12)
  assert.equal(state.devices.filter((device) => device.status === 'offline').length, 1)
  assert.equal(state.readings.length, 12 * 24)
  assert.equal(state.thresholds.length, 2)
  assert.equal(state.alerts.length, 2)
  assert.equal(state.alerts.filter((alert) => alert.state === 'open').length, 1)
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
    assert.deepEqual(readManifest().plugins.map((row) => row.id), ['router', 'home', 'sensors', 'sensors-shell', 'dashboard', 'extensions', 'server', 'acryl-door'])
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
