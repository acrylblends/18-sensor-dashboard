/** The HTTP ingest contract at `/ingest`: POST { deviceId or code, value, unit, timestamp? } with device, unit and timestamp validation. */
import type { Context } from '@deepseek-ai/cordis'
import { Acryl } from '../acryl-router/src/index.ts'
import { SensorsError, type Sensors } from '../sensors/index.ts'

export const name = 'ingest'
export const inject = ['sensors', 'shell', 'router']

export function apply(ctx: Context): void {
  const { sensors, shell } = ctx
  const prefix = shell.prefix

  const app = new Acryl()
    .get('/ingest', (c) => c.json({ contract: 'POST /ingest { deviceId | code, value, unit, timestamp? }' }))
    .post('/ingest', async (c) => {
      let body: Record<string, unknown>
      try {
        body = (await c.req.json()) as Record<string, unknown>
      } catch {
        body = (await c.req.parseBody()) as Record<string, unknown>
      }
      const key = String(body.deviceId ?? body.code ?? '')
      const device = sensors.device(key) ?? sensors.devices().find((item) => item.code === key)
      try {
        if (device === undefined) throw new SensorsError('not-found', 'That device is not registered.')
        const result = await sensors.ingest(device.id, body.value, String(body.unit ?? device.unit), body.timestamp)
        return c.json({ ok: true, readingId: result.reading.id, alert: result.alert?.severity ?? null }, 201)
      } catch (error) {
        if (!(error instanceof SensorsError)) throw error
        return c.json({ error: error.message }, 400)
      }
    })

  ctx.router.route(prefix === '' ? '/' : prefix, app)
}
