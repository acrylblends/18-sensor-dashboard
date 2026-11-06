/** Devices: the inventory at `/devices` with a status filter, and the device detail at `/devices/:id` with readings, thresholds and alerts. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { evaluate, SensorsError, seriesOf, sparkPath, valueText, whenText, type Sensors } from '../sensors/index.ts'

export const name = 'devices'
export const inject = ['sensors', 'shell', 'router']

export function apply(ctx: Context): void {
  const { sensors, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl()
    .get('/devices', (c) => {
      const status = c.req.query('status') === 'offline' ? 'offline' : c.req.query('status') === 'online' ? 'online' : undefined
      const rows = sensors
        .devices()
        .filter((device) => status === undefined || device.status === status)
        .map((device) => {
          const latest = sensors.latest(device.id)
          return `<tr><td><a href="${shell.href(`/devices/${encodeURIComponent(device.id)}`)}"><strong>${e(device.code)}</strong></a><small>${e(device.name)}</small></td><td>${e(device.kind)} · ${e(device.zone)}</td><td><span class="badge ${device.status === 'online' ? 'ok' : 'down'}">${device.status.toUpperCase()}</span></td><td>${latest === undefined ? '—' : `${valueText(latest.value)} ${e(latest.unit)}`}</td><td>${e(whenText(device.lastSeenAt, sensors.now))}</td></tr>`
        })
        .join('')
      const options = [['', 'All devices'], ['online', 'Online'], ['offline', 'Offline']]
        .map(([value, label]) => `<option value="${value ?? ''}"${(value === '' && status === undefined) || value === status ? ' selected' : ''}>${label}</option>`)
        .join('')
      const main = `<div class="head"><div><small>DEVICE FLEET / INVENTORY</small><h1>Devices</h1><p>${String(sensors.devices().length)} registered devices · ${String(sensors.devices().filter((device) => device.status === 'offline').length)} offline</p></div><form method="get" action="${shell.href('/devices')}"><select name="status" aria-label="Filter devices by status" onchange="this.form.submit()">${options}</select></form></div><table class="list"><thead><tr><th>DEVICE</th><th>KIND · ZONE</th><th>STATUS</th><th>LATEST</th><th>LAST SEEN</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="5">No devices match.</td></tr>' : rows}</tbody></table>`
      return c.html(shell.page({ active: 'dashboard', title: 'Devices', main }))
    })
    .get('/devices/:id', (c) => {
      const device = sensors.device(c.req.param('id'))
      if (device === undefined) return c.redirect(shell.url('/devices', { kind: 'error', text: 'That device no longer exists.' }), 303)
      const readings = seriesOf(sensors.readings(device.id), device.id, 48)
      const latest = sensors.latest(device.id)
      const threshold = sensors.thresholdOf(device.id)
      const severity = latest === undefined ? null : evaluate(latest.value, threshold)
      const alerts = sensors
        .alerts()
        .filter((alert) => alert.deviceId === device.id)
        .slice(0, 5)
        .map((alert) => `<div class="devrow"><div><strong>${e(alert.severity.toUpperCase())}</strong><small>${e(whenText(alert.occurredAt, sensors.now))} · ${e(alert.state)}</small></div><b class="${alert.state === 'open' ? 'alert' : 'online'}">${alert.state === 'open' ? '●' : '✓'}</b></div>`)
        .join('')
      const thresholdForm =
        threshold === undefined
          ? `<p style="font-size:8px;color:#8da0a2">No threshold is set for this device.</p>`
          : `<form method="post" action="${shell.href(`/devices/${encodeURIComponent(device.id)}/thresholds`)}"><label>WARNING ABOVE (${e(device.unit)})<input name="warning" type="number" step="any" value="${String(threshold.warning)}"></label><label>CRITICAL ABOVE (${e(device.unit)})<input name="critical" type="number" step="any" value="${String(threshold.critical)}"></label><button style="margin-top:10px;background:#1a9b87;color:white;border:0;border-radius:4px;padding:8px 10px;font-size:8px">Save thresholds</button></form>`
      const main = `${shell.notice(c.req.url)}<div class="head"><div><small>DEVICE FLEET / ${e(device.code)}</small><h1>${e(device.name)}</h1><p>${e(device.kind)} · ${e(device.site)} · ${e(device.zone)} · reports in ${e(device.unit)}</p></div><a class="btn" href="${shell.href('/devices')}">All devices</a></div><section class="dashboard" style="grid-template-columns:minmax(0,1fr) 300px"><article class="card"><div class="ch"><div><b>${e(device.code)}</b><small>${e(device.status.toUpperCase())} · last seen ${e(whenText(device.lastSeenAt, sensors.now))}</small></div><span class="badge ${device.status === 'online' ? 'ok' : 'down'}">${device.status.toUpperCase()}</span></div><div class="sensor"><div class="sensor-top"><strong style="color:${severity === null ? '#1d9b87' : '#c27736'}">● ${severity === null ? 'HEALTHY' : severity.toUpperCase()}</strong><span style="color:#819a9a;font-size:8px">${threshold === undefined ? 'NO THRESHOLD' : `ABOVE ${valueText(threshold.warning)} / ${valueText(threshold.critical)}`}</span></div><div class="reading"><b>${latest === undefined ? '—' : valueText(latest.value)}</b><span>${e(device.unit)}</span></div><svg class="spark" viewBox="0 0 280 64"><path d="${sparkPath(readings)}" fill="none" stroke="#1d9b87" stroke-width="2.2"/><path d="${sparkPath(readings)}V64H0Z" fill="#1d9b87" opacity=".08"/></svg><div class="sensor-foot"><span>${String(readings.length)} readings</span><b>${latest === undefined ? '' : e(whenText(latest.recordedAt, sensors.now))}</b></div></div></article><aside class="card"><div class="ch"><div><b>Thresholds</b><small>${e(device.code)} · ${e(device.zone)}</small></div></div><div class="threshold">${thresholdForm}<p style="font-size:8px;color:#8da0a2;line-height:1.4">A reading above warning opens an alert; above critical it is critical.</p></div></aside><article class="card wide"><div class="ch"><div><b>Readings</b><small>Last 48 values</small></div></div><div class="chartwrap"><svg viewBox="0 0 800 190" preserveAspectRatio="none"><path d="${sparkPath(readings, 800, 190)}" fill="none" stroke="#1a9a83" stroke-width="2.5"/></svg></div></article><article class="card"><div class="ch"><div><b>Recent alerts</b><small>This device</small></div><a class="btn" href="${shell.href('/alerts')}">Alert log</a></div><div class="device">${alerts === '' ? '<p class="empty">No alerts for this device.</p>' : alerts}</div></article></section>`
      return c.html(shell.page({ active: 'dashboard', title: device.code, main }))
    })
    .post('/devices/:id/thresholds', async (c) => {
      const form = await c.req.parseBody()
      try {
        await sensors.setThreshold(c.req.param('id'), form.warning, form.critical)
        return c.redirect(shell.url(`/devices/${encodeURIComponent(c.req.param('id'))}`, { kind: 'ok', text: 'Thresholds saved.' }), 303)
      } catch (error) {
        if (!(error instanceof SensorsError)) throw error
        return c.redirect(shell.url(`/devices/${encodeURIComponent(c.req.param('id'))}`, { kind: 'error', text: error.message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
