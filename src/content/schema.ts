import { z } from 'zod'

// Same contract for build-time JSON now and the admin API later.

export const locales = ['ru', 'en'] as const
export type Locale = (typeof locales)[number]

// Localized per field: a plain string is the default-language value.
const localizedText = z.union([z.string().min(1), z.object({ ru: z.string().min(1), en: z.string().optional() })])
export type LocalizedText = z.infer<typeof localizedText>

const status = z.enum(['draft', 'published', 'hidden'])

const item = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  order: z.number().int(),
  status,
})

const media = z.object({ url: z.string().min(1), alt: localizedText.optional() })

// "2025-05"; `to: null` means "now".
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)

const stopId = z.enum(['base', 'foothills', 'camps', 'summit', 'atmosphere', 'orbit'])
export type StopId = z.infer<typeof stopId>

export const siteSchema = z.object({
  meta: z.object({
    locale: z.enum(locales),
    title: localizedText,
    description: localizedText,
    siteUrl: z.url().nullable(),
    ogImage: media.nullable(),
  }),
  person: z.object({
    name: localizedText,
    role: localizedText,
    location: localizedText,
    tagline: localizedText,
    about: z.array(localizedText),
    workFormats: localizedText,
    cv: media.nullable(),
  }),
  contacts: z.object({
    email: z.email(),
    telegram: z.string().regex(/^[A-Za-z0-9_]{5,}$/),
    github: z.string().min(1),
    phone: z.string().nullable(),
  }),
  // altitude ranges live in src/content/altitude.ts; here only the words
  stops: z.record(stopId, z.object({ label: localizedText, title: localizedText })),
  education: z.array(item.extend({ institution: localizedText, program: localizedText, year: z.number().int(), note: localizedText.optional() })),
  languages: z.array(item.extend({ name: localizedText, level: localizedText })),
  experience: z.array(
    item.extend({
      company: z.string().min(1),
      role: localizedText,
      from: month,
      to: month.nullable(),
      url: z.url().nullable(),
      summary: localizedText,
      highlights: z.array(localizedText).min(1),
      stack: z.array(z.string()),
    }),
  ),
  stats: z.array(item.extend({ value: z.string().min(1), label: localizedText })),
  skillLayers: z.array(item.extend({ title: localizedText, skills: z.array(z.string()).min(1) })),
  projects: z.array(item.extend({ title: localizedText, description: localizedText, url: z.url().nullable(), stack: z.array(z.string()) })),
  ui: z.object({
    skipToContact: localizedText,
    contactNow: localizedText,
    contactNowShort: localizedText,
    contactHere: localizedText,
    route: localizedText,
    classic: localizedText,
    classicShort: localizedText,
    downloadCv: localizedText,
    contact: localizedText,
    backToEarth: localizedText,
    present: localizedText,
    education: localizedText,
    languages: localizedText,
  }),
})

export type SiteContent = z.infer<typeof siteSchema>
