/** The alert log at `/alerts`: threshold crossings, their severity and state, and the acknowledge action. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { whenText, type Sensors } from '../sensors/index.ts'

export const name = 'alerts'
export const inject = ['sensors', 'shell', 'router']

export function apply(ctx: Context): void {
  const { sensors, shell } = ctx
  const e = shell.e
  const prefix = shell.prefix

  const app = new Acryl()
    .get('/alerts', (c) => {
      const filter = c.req.query('state')
      const state = filter === 'open' || filter === 'acknowledged' ? filter : undefined
      const rows = sensors
        .alerts(state)
        .map((alert) => {
          const device = sensors.device(alert.deviceId)
          return `<tr><td><b>${e(device?.code ?? '')}</b><br><small>${e(device?.name ?? '')}</small></td><td><span class="badge ${alert.severity === 'critical' ? 'down' : 'warn'}">${alert.severity}</span></td><td><span class="badge ${alert.state === 'open' ? 'warn' : 'ok'}">${alert.state}</span></td><td>${e(whenText(alert.occurredAt, sensors.now))}</td><td>${alert.state === 'acknowledged' ? (alert.acknowledgedAt === undefined ? '' : e(whenText(alert.acknowledgedAt, sensors.now))) : `<form method="post" action="${shell.href(`/alerts/${encodeURIComponent(alert.id)}/ack`)}"><button style="border:1px solid #d8e4e4;background:#eef5f5;border-radius:4px;padding:5px 7px;font-size:8px">Acknowledge</button></form>`}</td></tr>`
        })
        .join('')
      const options = [['', 'All alerts'], ['open', 'Open'], ['acknowledged', 'Acknowledged']]
        .map(([value, label]) => `<option value="${value ?? ''}"${(value === '' && state === undefined) || value === state ? ' selected' : ''}>${label}</option>`)
        .join('')
      const main = `${shell.notice(c.req.url)}<div class="head"><div><small>DEVICE FLEET / ALERTS</small><h1>Alert log</h1><p>${String(sensors.alerts('open').length)} open · ${String(sensors.alerts('acknowledged').length)} acknowledged</p></div><form method="get" action="${shell.href('/alerts')}"><select name="state" aria-label="Filter alerts by state" onchange="this.form.submit()">${options}</select></form></div><table class="list"><thead><tr><th>DEVICE</th><th>SEVERITY</th><th>STATE</th><th>WHEN</th><th>ACKNOWLEDGED</th></tr></thead><tbody>${rows === '' ? '<tr><td colspan="5">No alerts match.</td></tr>' : rows}</tbody></table>`
      return c.html(shell.page({ active: 'alerts', title: 'Alerts', main }))
    })
    .post('/alerts/:id/ack', async (c) => {
      try {
        await sensors.acknowledge(c.req.param('id'))
        return c.redirect(shell.url('/alerts', { kind: 'ok', text: 'Alert acknowledged.' }), 303)
      } catch (error) {
        return c.redirect(shell.url('/alerts', { kind: 'error', text: (error as Error).message }), 303)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
