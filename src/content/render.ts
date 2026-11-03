import { STOP_ALTITUDES, formatRange } from './altitude'
import type { Locale, LocalizedText, SiteContent, StopId } from './schema'

// Build-time templating: data → static HTML, no DOM and no runtime cost.

type Ordered = { order: number; status: string }

const escapeMap: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => escapeMap[c])

function published<T extends Ordered>(items: T[]): T[] {
  return items.filter((i) => i.status === 'published').sort((a, b) => a.order - b.order)
}

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

export function createRenderer(site: SiteContent, locale: Locale = site.meta.locale) {
  const t = (v: LocalizedText) => esc(typeof v === 'string' ? v : (v[locale] ?? v.ru))
  const raw = (v: LocalizedText) => (typeof v === 'string' ? v : (v[locale] ?? v.ru))

  const monthName = (ym: string) => {
    const [y, m] = ym.split('-').map(Number)
    return `${new Date(y, m - 1).toLocaleString(locale, { month: 'long' })} ${y}`
  }
  const period = (from: string, to: string | null) => {
    const [y1, m1] = from.split('-').map(Number)
    const [y2, m2] = (to ?? new Date().toISOString().slice(0, 7)).split('-').map(Number)
    const months = y2 * 12 + m2 - (y1 * 12 + m1) + 1
    const end = to ? monthName(to) : raw(site.ui.present)
    return `${monthName(from)} — ${end} · ${months} ${plural(months, 'месяц', 'месяца', 'месяцев')}`
  }

  const tags = (list: string[]) => (list.length ? `<p class="tags">${list.map(esc).join(' · ')}</p>` : '')
  const link = (url: string | null, label: string) => (url ? `<a href="${esc(url)}" rel="noopener">${label}</a>` : label)
  // orbit keeps the conventional #contact anchor used by the skip link and buttons
  const anchor = (id: StopId) => (id === 'orbit' ? 'contact' : id)
  const range = (id: StopId) => formatRange(...STOP_ALTITUDES[id], locale)

  const stop = (id: StopId, body: string) => {
    const s = site.stops[id]
    const heading = id === 'base' ? `<h1>${t(s.title)}</h1>` : `<h2 id="${id}-title">${t(s.title)}</h2>`
    const labelled = id === 'base' ? '' : ` aria-labelledby="${id}-title"`
    return `<section class="stop stop--${id}" id="${anchor(id)}" data-stop="${id}" data-label="${t(s.label)}"${labelled}>
  <p class="kicker">${esc(range(id))} · ${t(s.label)}</p>
  ${heading}
  ${body}
</section>`
  }

  const { person, contacts, ui } = site
  const telegramUrl = `https://t.me/${contacts.telegram}`
  const githubUrl = `https://github.com/${contacts.github}`

  function head(): string {
    const ld = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: raw(person.name),
      jobTitle: raw(person.role),
      email: `mailto:${contacts.email}`,
      address: { '@type': 'PostalAddress', addressLocality: raw(person.location) },
      alumniOf: published(site.education).map((e) => ({ '@type': 'CollegeOrUniversity', name: raw(e.institution) })),
      knowsLanguage: published(site.languages).map((l) => raw(l.name)),
      sameAs: [githubUrl, telegramUrl],
      ...(site.meta.siteUrl ? { url: site.meta.siteUrl } : {}),
    }
    const og = site.meta.ogImage ? `<meta property="og:image" content="${esc(site.meta.ogImage.url)}" />` : ''
    const canonical = site.meta.siteUrl ? `<link rel="canonical" href="${esc(site.meta.siteUrl)}" />` : ''
    return `<title>${t(site.meta.title)}</title>
    <meta name="description" content="${t(site.meta.description)}" />
    <meta property="og:type" content="profile" />
    <meta property="og:title" content="${t(site.meta.title)}" />
    <meta property="og:description" content="${t(site.meta.description)}" />
    ${og}
    ${canonical}
    <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`
  }

  function body(): string {
    const cv = person.cv ? `<a class="btn btn--primary" href="${esc(person.cv.url)}" download>${t(ui.downloadCv)}</a>` : ''
    const contactBtnClass = person.cv ? 'btn' : 'btn btn--primary'

    const base = stop(
      'base',
      `<p class="role">${t(person.role)} · ${t(person.location)}</p>
  <p class="lead">${t(person.tagline)}</p>
  <div class="actions">${cv}<a class="${contactBtnClass}" href="#contact">${t(ui.contact)}</a></div>`,
    )

    const education = published(site.education)
      .map((e) => `<li><strong>${t(e.institution)}</strong> — ${t(e.program)}, ${e.year}${e.note ? ` · ${t(e.note)}` : ''}</li>`)
      .join('')
    const languages = published(site.languages)
      .map((l) => `<li>${t(l.name)} — ${t(l.level)}</li>`)
      .join('')
    const foothills = stop(
      'foothills',
      `${person.about.map((p) => `<p class="text">${t(p)}</p>`).join('')}
  <div class="columns">
    <div><h3>${t(ui.education)}</h3><ul class="list">${education}</ul></div>
    <div><h3>${t(ui.languages)}</h3><ul class="list">${languages}</ul></div>
  </div>
  <p class="meta">${t(person.workFormats)}</p>`,
    )

    const experience = published(site.experience)
    // one tent per card on the slope; markers follow the tents on screen
    const markers = experience
      .map(
        (e, i) => `<div class="camp-marker" data-marker="${e.id}">
        <span class="camp-marker__dot"></span>
        <span class="camp-marker__label">${t(ui.camp)} ${i + 1} · ${esc(e.company)}</span>
      </div>`,
      )
      .join('')

    const camps = stop(
      'camps',
      experience
        .map(
          (e, i) => `<article class="camp" data-camp="${e.id}">
    <p class="camp__no">${t(ui.camp)} ${i + 1}</p>
    <h3>${link(e.url, esc(e.company))} — ${t(e.role)}</h3>
    <p class="meta">${esc(period(e.from, e.to))}</p>
    <p class="text">${t(e.summary)}</p>
    <ul>${e.highlights.map((h) => `<li>${t(h)}</li>`).join('')}</ul>
    ${tags(e.stack)}
  </article>`,
        )
        .join(''),
    )

    const summit = stop(
      'summit',
      `<dl class="stats">${published(site.stats)
        .map((s) => `<div><dt>${t(s.label)}</dt><dd>${esc(s.value)}</dd></div>`)
        .join('')}</dl>`,
    )

    const atmosphere = stop(
      'atmosphere',
      `<div class="layers">${published(site.skillLayers)
        .map((l) => `<div><h3>${t(l.title)}</h3><p>${l.skills.map(esc).join(', ')}</p></div>`)
        .join('')}</div>`,
    )

    const projects = published(site.projects)
      .map(
        (p) => `<li class="project">
      <h3>${link(p.url, t(p.title))}</h3>
      <p class="text">${t(p.description)}</p>
      ${tags(p.stack)}
    </li>`,
      )
      .join('')
    const phone = contacts.phone ? `<li><a href="tel:${esc(contacts.phone.replace(/[^\d+]/g, ''))}">${esc(contacts.phone)}</a></li>` : ''
    const orbit = stop(
      'orbit',
      `<ul class="projects">${projects}</ul>
  <ul class="contacts">
    <li><a href="mailto:${esc(contacts.email)}">${esc(contacts.email)}</a></li>
    <li><a href="${telegramUrl}" rel="noopener">Telegram @${esc(contacts.telegram)}</a></li>
    <li><a href="${githubUrl}" rel="noopener">GitHub ${esc(contacts.github)}</a></li>
    ${phone}
  </ul>
  <button class="btn" type="button" data-return>${t(ui.backToEarth)}</button>`,
    )

    // Cyrillic initials like «ЗЗ» read as digits, so the logo is the first name.
    const firstName = raw(person.name).split(/\s+/)[0]
    const stopIds = Object.keys(STOP_ALTITUDES) as StopId[]
    // highest first, like a mountain route; DOM order matches visual order for tabbing
    const route = [...stopIds]
      .reverse()
      .map(
        (id) => `<li><a href="#${anchor(id)}">
          <span class="route__alt">${esc(range(id))}</span>
          <span class="route__label">${t(site.stops[id].label)}</span>
          <span class="route__title">${t(site.stops[id].title)}</span>
        </a></li>`,
      )
      .join('')

    // The pill swaps to a direct Telegram link once the visitor reaches the orbit.
    return `<a class="skip-link" href="#contact">${t(ui.skipToContact)}</a>
    <header class="site-header">
      <a class="logo" href="#top" data-return aria-label="${t(person.name)}">${esc(firstName)}</a>
      <a class="pill" href="#contact" data-pill data-here-href="${telegramUrl}" data-here-text="${t(ui.contactHere)}">
        <span class="label-full">${t(ui.contactNow)}</span><span class="label-short">${t(ui.contactNowShort)}</span>
      </a>
      <div class="header-actions">
        <button class="toggle" type="button" data-classic aria-pressed="false"><span class="label-full">${t(ui.classic)}</span><span class="label-short">${t(ui.classicShort)}</span></button>
        <button class="toggle" type="button" popovertarget="route" aria-haspopup="true">${t(ui.route)}</button>
      </div>
    </header>
    <nav class="route" id="route" popover aria-label="${t(ui.route)}">
      <ol>${route}</ol>
    </nav>
    <div class="stage" aria-hidden="true"></div>
    <aside class="altimeter" aria-hidden="true">
      <span class="altimeter__value" data-altimeter-value>0</span>
      <span class="altimeter__unit" data-altimeter-unit>м</span>
      <span class="altimeter__zone" data-altimeter-zone>${t(site.stops.base.label)}</span>
    </aside>
    <main id="top">
${[base, foothills, camps, summit, atmosphere, orbit].join('\n')}
    </main>
    <div class="camp-markers" aria-hidden="true">${markers}</div>
    <div class="veil" aria-hidden="true"></div>`
  }

  return { head, body, lang: locale }
}
