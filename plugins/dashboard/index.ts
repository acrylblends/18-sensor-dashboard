/** The dashboard, device detail, alerts, ingest and threshold forms. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { evaluate, SensorsError, seriesOf, sparkPath, whenText } from '../sensors/index.ts'
const escape = (text: string): string => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
export const name = 'dashboard'
export const inject = ['sensors', 'shell', 'router']
export function apply(ctx: Context): void {
  const { sensors, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix
  const summary = (): string => {
    const stats = sensors.stats()
    return `<section class="summary"><article class="sum"><small>ACTIVE DEVICES</small><strong>${String(stats.active)} / ${String(stats.total)}</strong><span>${String(stats.total - stats.active)} device offline</span></article><article class="sum"><small>READINGS</small><strong>${String(sensors.devices().reduce((sum, device) => sum + sensors.readings(device.id).length, 0))}</strong><span>Saved in this demo</span></article><article class="sum"><small>ALERTS</small><strong style="color:#c27736">${String(stats.alerts).padStart(2, '0')}</strong><span>open alerts</span></article><article class="sum"><small>DATA UPTIME</small><strong>${stats.uptime.toFixed(1)}%</strong><span>Rolling 7 days</span></article></section>`
  }
  const card = (deviceId: string, color: string): string => {
    const device = sensors.device(deviceId)
    if (device === undefined) return ''
    const latest = sensors.latest(deviceId)
    const values = seriesOf(sensors.readings(deviceId), deviceId, 24)
    const threshold = sensors.thresholdOf(deviceId)
    const severity = latest === undefined ? null : evaluate(latest.value, threshold)
    return `<article class="card"><div class="ch"><div><b>${escape(device.name)}</b><small>${escape(device.code)} · ${escape(device.zone)}</small></div><span class="btn" style="border:1px solid var(--line);background:white;border-radius:4px;padding:5px 7px;font-size:7px">24H</span></div><div class="sensor"><div class="sensor-top"><strong style="color:${severity === null ? '#1d9b87' : '#c27736'}">● ${severity === null ? 'HEALTHY' : severity.toUpperCase()}</strong><span style="color:#819a9a;font-size:8px">${threshold === undefined ? 'NO THRESHOLD' : `ABOVE ${String(threshold.warning)} / ${String(threshold.critical)}`}</span></div><div class="reading"><b>${latest?.value ?? '—'}</b><span>${escape(device.unit)}</span></div><svg class="spark" viewBox="0 0 280 64"><path d="${sparkPath(values)}" fill="none" stroke="${color}" stroke-width="2.2"/><path d="${sparkPath(values)}V64H0Z" fill="${color}" opacity=".08"/></svg><div class="sensor-foot"><span>Latest</span><b>${latest === undefined ? '—' : escape(whenText(latest.recordedAt, sensors.now))}</b><span>${String(values.length)} readings</span></div></div></article>`
  }
  const dashboard = (url: string): string => {
    const temp = sensors.devices().find((device) => device.kind === 'Temperature')
    const humidity = sensors.devices().find((device) => device.kind === 'Humidity')
    const devices = sensors.devices().map((device) => {
      const latest = sensors.latest(device.id)
      const threshold = sensors.thresholdOf(device.id)
      const severity = latest === undefined ? null : evaluate(latest.value, threshold)
      return `<div class="devrow"><div><strong>${escape(device.code)}</strong><small>${escape(device.kind)} · ${escape(device.zone)}</small></div><b class="${severity === null ? 'online' : 'alert'}">${latest === undefined ? '—' : `${String(latest.value)} ${escape(device.unit)}`}</b><b class="${device.status === 'online' ? 'online' : 'alert'}">●</b></div>`
    }).join('')
    const co2 = sensors.devices().find((device) => device.kind === 'CO₂' && sensors.thresholdOf(device.id) !== undefined)
    const threshold = co2 === undefined ? undefined : sensors.thresholdOf(co2.id)
    const main = `${shell.notice(url)}<div class="head"><div><small>DEVICE FLEET / ENVIRONMENTAL TELEMETRY</small><h1>Sensor dashboard</h1><p>Live conditions, device health and threshold alerts across Greenhouse North.</p></div><div class="live">● STREAM SIMULATED &nbsp; · &nbsp; ${escape(whenText(sensors.devices()[0]?.lastSeenAt ?? '', sensors.now))}</div></div>${summary()}<section class="dashboard">${temp === undefined ? '' : card(temp.id, '#1d9b87')}${humidity === undefined ? '' : card(humidity.id, '#5298bf')}<article class="card"><div class="ch"><div><b>Device status</b><small>Latest reading by sensor</small></div><a href="${shell.href('/alerts')}" class="btn" style="border:1px solid var(--line);background:white;border-radius:4px;padding:5px 7px;font-size:7px;text-decoration:none;color:#52646a">Alerts</a></div><div class="device">${devices}</div></article><article class="card wide"><div class="ch"><div><b>Environmental history</b><small>Temperature and humidity · last 24 readings</small></div></div><div class="chartwrap"><svg viewBox="0 0 800 190" preserveAspectRatio="none"><g stroke="#edf2f2"><path d="M0 25H800M0 65H800M0 105H800M0 145H800"/></g>${temp === undefined ? '' : `<path d="${sparkPath(seriesOf(sensors.readings(temp.id), temp.id, 24).map((value) => value), 800, 190)}" fill="none" stroke="#1a9a83" stroke-width="2.5"/>`}${humidity === undefined ? '' : `<path d="${sparkPath(seriesOf(sensors.readings(humidity.id), humidity.id, 24), 800, 190)}" fill="none" stroke="#579bc0" stroke-width="2.5"/>`}</svg><div class="legend"><span><i style="background:#1a9a83"></i>Temperature ${temp === undefined ? '' : escape(temp.unit)}</span><span><i style="background:#579bc0"></i>Humidity ${humidity === undefined ? '' : escape(humidity.unit)}</span></div></div></article>${co2 === undefined || threshold === undefined ? '' : `<article class="card"><div class="ch"><div><b>Alert thresholds</b><small>${escape(co2.code)} · ${escape(co2.zone)}</small></div></div><div class="threshold"><h3>${escape(co2.name)}</h3><form method="post" action="${shell.href(`/devices/${encodeURIComponent(co2.id)}/thresholds`)}"><label>WARNING ABOVE (${escape(co2.unit)})<input name="warning" type="number" step="any" value="${String(threshold.warning)}"></label><label>CRITICAL ABOVE (${escape(co2.unit)})<input name="critical" type="number" step="any" value="${String(threshold.critical)}"></label><button style="margin-top:10px;background:#1a9b87;color:white;border:0;border-radius:4px;padding:8px 10px;font-size:8px">Save thresholds</button></form><p style="font-size:8px;color:#8da0a2;line-height:1.4">A reading above warning opens an alert; above critical it is critical. This demo ingests through POST /ingest.</p></div></article>`}</section>`
    return shell.page({ active: 'dashboard', title: 'Sensor dashboard', main })
  }
  const alerts = (url: string): string => {
    const rows = sensors.alerts().map((alert) => {
      const device = sensors.device(alert.deviceId)
      return `<tr><td><b>${escape(device?.code ?? '')}</b><br><small>${escape(device?.name ?? '')}</small></td><td><span class="badge ${alert.severity === 'critical' ? 'down' : 'warn'}">${alert.severity}</span></td><td><span class="badge ${alert.state === 'open' ? 'warn' : 'ok'}">${alert.state}</span></td><td>${escape(whenText(alert.occurredAt, sensors.now))}</td><td>${alert.state === 'acknowledged' ? '' : `<form method="post" action="${shell.href(`/alerts/${encodeURIComponent(alert.id)}/ack`)}"><button style="border:1px solid var(--line);background:#eef5f5;border-radius:4px;padding:5px 7px;font-size:8px">Acknowledge</button></form>`}</td></tr>`
    }).join('')
    return shell.page({ active: 'alerts', title: 'Alerts', main: `${shell.notice(url)}<div class="head"><div><small>DEVICE FLEET / ALERTS</small><h1>Alert log</h1><p>${String(sensors.alerts('open').length)} open alerts.</p></div><a href="${shell.href('/')}" style="font-size:9px;color:#1a8f7e;text-decoration:none">Back to the dashboard ↗</a></div><table class="list"><thead><tr><th>DEVICE</th><th>SEVERITY</th><th>STATE</th><th>WHEN</th><th></th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="5">No alerts.</td></tr>' : rows}</tbody></table>` })
  }
  const app = new Acryl()
    .get('/', (c) => c.html(dashboard(c.req.url)))
    .get('/alerts', (c) => c.html(alerts(c.req.url)))
    .get('/devices/:id', (c) => {
      const device = sensors.device(c.req.param('id'))
      if (device === undefined) return c.redirect(shell.url('/alerts', { kind: 'error', text: 'That device no longer exists.' }), 303)
      return c.html(shell.page({ active: 'dashboard', title: device.code, main: `${shell.notice(c.req.url)}<div class="head"><div><small>DEVICE FLEET / ${escape(device.code)}</small><h1>${escape(device.name)}</h1><p>${escape(device.kind)} · ${escape(device.site)} · ${escape(device.zone)} · reports in ${escape(device.unit)}</p></div><a href="${shell.href('/')}" style="font-size:9px;color:#1a8f7e;text-decoration:none">Back to the dashboard ↗</a></div><section class="dashboard">${card(device.id, '#1d9b87')}<article class="card wide"><div class="ch"><div><b>Readings</b><small>Last ${String(sensors.readings(device.id).length)} values</small></div></div><div class="chartwrap"><svg viewBox="0 0 800 190" preserveAspectRatio="none"><path d="${sparkPath(seriesOf(sensors.readings(device.id), device.id, 48), 800, 190)}" fill="none" stroke="#1a9a83" stroke-width="2.5"/></svg></div></article></section>` }))
    })
    .get('/ingest', (c) => c.json({ error: 'POST a JSON body { deviceId, value, unit }.' }, 405))
    .post('/ingest', async (c) => {
      const form = await c.req.parseBody()
      try {
        const result = await sensors.ingest(String(form.deviceId ?? ''), form.value, String(form.unit ?? ''))
        return c.json({ ok: true, readingId: result.reading.id, alert: result.alert?.severity ?? null }, 201)
      } catch (error) {
        if (!(error instanceof SensorsError)) throw error
        return c.json({ error: error.message }, 400)
      }
    })
    .post('/simulate', async (c) => {
      try { const count = await sensors.simulate(); return c.redirect(shell.url('/', { kind: 'ok', text: `${String(count)} readings ingested.` }), 303) } catch (error) { return c.redirect(shell.url('/', { kind: 'error', text: (error as Error).message }), 303) }
    })
    .post('/alerts/:id/ack', async (c) => {
      try { await sensors.acknowledge(c.req.param('id')); return c.redirect(shell.url('/alerts', { kind: 'ok', text: 'Alert acknowledged.' }), 303) } catch (error) { return c.redirect(shell.url('/alerts', { kind: 'error', text: (error as Error).message }), 303) }
    })
    .post('/devices/:id/thresholds', async (c) => {
      const form = await c.req.parseBody()
      try {
        await sensors.setThreshold(c.req.param('id'), form.warning, form.critical)
        return c.redirect(shell.url('/', { kind: 'ok', text: 'Thresholds saved.' }), 303)
      } catch (error) {
        return c.redirect(shell.url('/', { kind: 'error', text: (error as Error).message }), 303)
      }
    })
  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
