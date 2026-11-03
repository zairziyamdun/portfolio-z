import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { z } from 'zod'
import { createRenderer } from '../src/content/render'
import { siteSchema } from '../src/content/schema'

// Renders content/site.json into index.html; later the admin API replaces the JSON source.
export function contentPlugin(file = 'content/site.json'): Plugin {
  const path = resolve(file)

  const load = () => {
    const parsed = siteSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
    if (!parsed.success) throw new Error(`${file} не прошёл проверку схемы:\n${z.prettifyError(parsed.error)}`)
    return parsed.data
  }

  return {
    name: 'portfolio-content',
    configureServer(server) {
      server.watcher.add(path)
      server.watcher.on('change', (changed) => {
        if (resolve(changed) === path) server.ws.send({ type: 'full-reload' })
      })
    },
    transformIndexHtml(html) {
      const render = createRenderer(load())
      return html
        .replace('<html lang="ru">', `<html lang="${render.lang}">`)
        .replace('<!-- content:head -->', render.head())
        .replace('<!-- content:body -->', render.body())
    },
  }
}
