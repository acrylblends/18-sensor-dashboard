/**
 * The page shell every page plugin shares (`ctx.shell`): the top bar entries pages register, links under the mount prefix, the page wrapper and the
 * notice of a redirect. A page plugin registers its entry with `ctx.shell.nav(...)` inside `ctx.effect`, so the entry leaves with the plugin, mounts
 * its routes at `ctx.shell.prefix` and writes every link with `ctx.shell.href(path)`.
 */
export interface NavItem {
  /** The page plugin's name. */
  readonly id: string
  readonly label: string
  /** A short glyph shown before the label. */
  readonly icon: string
  /** The page's path under the prefix (`/prompts`). */
  readonly path: string
  /** Where it sits: lower first. */
  readonly order: number
  /** A number shown after the label, read at each render; nothing when absent or zero. */
  count?(): number
}

export interface PageInput {
  /** The nav item id to highlight. */
  readonly active?: string
  /** The browser tab's title (the app name is added). */
  readonly title: string
  /** The breadcrumb segments (optional for a top bar that does not show them). */
  readonly crumbs?: readonly string[]
  /** The page's content. */
  readonly main: string
  /** Extra HTML at the end of the body: a page's own `<script>`. */
  readonly scripts?: string
  /** The right meta in the top bar (default: `LOCAL HISTORY SAVED`). */
  readonly meta?: string
}

/** A line after a form was sent: `?ok=` or `?error=` on the redirect. */
export type Notice = { readonly kind: 'ok' | 'error' | 'warn'; readonly text: string }

export interface Shell {
  readonly prefix: string
  e(text: string): string
  /** The URL of a path of the app, under the prefix. */
  href(path: string): string
  nav(item: NavItem): () => void
  navItems(): readonly NavItem[]
  has(id: string): boolean
  page(input: PageInput): string
  /** The notice of a request's `?ok=` / `?error=` / `?warn=` query, as HTML (empty when there is none). */
  notice(url: string): string
  back(value: unknown, fallback: string): string
  /** A path with a notice for the page it lands on: `url('/prompts', { kind: 'ok', text: 'Saved.' })`. */
  url(path: string, notice?: Notice): string
}

export const escapeHtml = (text: string): string =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')

export function noticeQuery(notice: Notice): string {
  return `?${notice.kind}=${encodeURIComponent(notice.text)}`
}

/** The page's toast, its copy buttons and the client-side filter of a list. */
export const CLIENT_SCRIPT = `<script>
(function () {
  var toastTimer;
  function toast(message) {
    var element = document.getElementById('toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { element.classList.remove('show'); }, 2200);
  }
  window.promptLabToast = toast;
  function copy(text, message) {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(function () { toast(message); }, function () { toast('Copy failed'); });
      return;
    }
    var area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
    toast(message);
  }
  document.querySelectorAll('[data-copy]').forEach(function (button) {
    button.addEventListener('click', function () {
      var source = document.getElementById(button.dataset.copy);
      if (source) copy(source.textContent, 'Copied to the clipboard');
    });
  });
  document.querySelectorAll('[data-toast]').forEach(function (button) {
    button.addEventListener('click', function () { toast(button.dataset.toast); });
  });
  document.querySelectorAll('[data-search]').forEach(function (input) {
    input.addEventListener('input', function () {
      var query = input.value.toLowerCase();
      var scope = document.querySelector(input.dataset.search);
      if (!scope) return;
      scope.querySelectorAll('[data-row]').forEach(function (row) {
        row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
      });
    });
  });
}());
</script>`

export interface ShellLook {
  readonly appTitle: string
  readonly css: string
  /** The top bar's HTML. */
  topbar(nav: readonly NavItem[], crumbs: readonly string[], href: (path: string) => string, meta: string, active: string | undefined): string
  /** The class of the wrapper around the page's main HTML. */
  readonly bodyClass: string
}

export function createShell(prefix: string, look: ShellLook): Shell {
  const items = new Map<string, NavItem>()
  const href = (path: string): string => `${prefix}${path.startsWith('/') ? path : `/${path}`}`
  const navItems = () => [...items.values()].sort((a, b) => a.order - b.order)
  return {
    prefix,
    e: escapeHtml,
    href,
    nav(item) {
      if (items.has(item.id)) throw new Error(`the shell already has "${item.id}"`)
      items.set(item.id, item)
      return () => {
        if (items.get(item.id) === item) items.delete(item.id)
      }
    },
    navItems,
    has: (id) => items.has(id),
    back(value, fallback) {
      return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
        ? value
        : fallback
    },
    url(path, notice) {
      const [base, query] = path.split('?') as [string, string | undefined]
      const noticeText = notice === undefined ? '' : noticeQuery(notice).slice(1)
      const joined = [query, noticeText].filter((part) => part !== undefined && part !== '').join('&')
      return `${href(base)}${joined === '' ? '' : `?${joined}`}`
    },
    notice(url) {
      const query = new URL(url, 'http://local').searchParams
      for (const kind of ['error', 'warn', 'ok'] as const) {
        const text = query.get(kind)
        if (text !== null && text !== '')
          return `<p class="notice ${kind}" role="${kind === 'ok' ? 'status' : 'alert'}">${escapeHtml(text)}</p>`
      }
      return ''
    },
    page({ active, title, crumbs, main, scripts, meta }) {
      const segments = crumbs ?? []
      const trail = segments
        .map((crumb, index) => (index === segments.length - 1 ? `<b>${escapeHtml(crumb)}</b>` : `${escapeHtml(crumb)} <span>/</span>`))
        .join(' ')
      return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${escapeHtml(look.appTitle)}</title>
<style>${look.css}</style>
</head>
<body class="${look.bodyClass}">
${look.topbar(navItems(), crumbs ?? [], href, meta ?? 'INGEST / HTTP · DEMO STREAM', active)}
<main class="wrap">${main}</main>
<div id="toast" class="toast" aria-live="polite"></div>
${scripts ?? CLIENT_SCRIPT}
</body>
</html>`
    },
  }
}
