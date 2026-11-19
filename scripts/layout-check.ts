import { readdirSync } from 'node:fs'
import path from 'node:path'
import { chromium, type Page } from 'playwright'

const widths = [320, 360, 390, 430, 768, 1024, 1280, 1440]
const baseUrl = process.env.LAYOUT_CHECK_BASE_URL ?? 'http://localhost:3000'
const routeValues: Record<string, string> = {
  groupId: process.env.LAYOUT_CHECK_GROUP_ID ?? '00000000-0000-4000-8000-000000000001',
  slug: process.env.LAYOUT_CHECK_PUBLIC_SLUG ?? 'layout-check',
  token: process.env.LAYOUT_CHECK_MEMBER_TOKEN ?? 'layout-check-invalid-token',
}

type Route = { pattern: string; path: string }
type InspectionResult = {
  horizontalOverflow: boolean
  narrowText: Array<{ target: string; width: number }>
  shortLines: string[]
  visibleCarouselArrows: number
  notificationOutside: boolean
  notificationOccluded: boolean
  notificationHorizontalOverflow: boolean
}

function discoverRoutes(directory: string, segments: string[] = []): Route[] {
  const entries = readdirSync(directory, { withFileTypes: true })
  const routes = entries.some((entry) => entry.isFile() && entry.name === 'page.tsx')
    ? [{
        pattern: `/${segments.join('/')}` || '/',
        path: `/${segments.map((segment) => {
          const dynamic = segment.match(/^\[([^\].]+)\]$/)
          return dynamic ? routeValues[dynamic[1]] ?? 'layout-check' : segment
        }).join('/')}`,
      }]
    : []

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === 'api' || entry.name.startsWith('_')) continue
    const segment = entry.name.startsWith('(') && entry.name.endsWith(')')
      ? null
      : entry.name
    routes.push(...discoverRoutes(
      path.join(directory, entry.name),
      segment ? [...segments, segment] : segments,
    ))
  }

  return routes
}

const inspectionScript = `(() => {
  const describe = (element) => {
    const id = element.id ? '#' + element.id : ''
    const classes = typeof element.className === 'string' && element.className.trim()
      ? '.' + element.className.trim().split(/\\s+/).join('.')
      : ''
    return element.tagName.toLowerCase() + id + classes
  }

  const isVisible = (element) => {
    const style = getComputedStyle(element)
    const bounds = element.getBoundingClientRect()
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && Number(style.opacity) !== 0
      && bounds.width > 0
      && bounds.height > 0
  }

  const narrowText = Array.from(document.body.querySelectorAll('*'))
    .filter(isVisible)
    .flatMap((element) => {
      const text = (element.innerText || '').replace(/\\s+/g, ' ').trim()
      const width = element.getBoundingClientRect().width
      return text.length >= 8 && width < 72
        ? [{ target: describe(element), width: Math.round(width) }]
        : []
    })

  const textBlocks = new Map()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let node
  while ((node = walker.nextNode())) {
    const parent = node.parentElement
    const text = node.textContent || ''
    if (!parent || !text.trim() || !isVisible(parent)) continue
    const block = parent.closest('p,h1,h2,h3,h4,h5,li,td,th,label,blockquote,button,a')
    if (!block || block.closest('.hero-visual') || !isVisible(block)) continue
    let lines = textBlocks.get(block)
    if (!lines) {
      lines = []
      textBlocks.set(block, lines)
    }
    const tolerance = Math.max(3, parseFloat(getComputedStyle(block).fontSize) * 0.35)
    for (let index = 0; index < text.length; index += 1) {
      range.setStart(node, index)
      range.setEnd(node, index + 1)
      const bounds = range.getBoundingClientRect()
      if (bounds.width === 0 || bounds.height === 0) continue
      const line = lines.find((candidate) => Math.abs(candidate.top - bounds.top) < tolerance)
      if (line) line.text += text[index]
      else lines.push({ top: bounds.top, text: text[index] })
    }
  }
  range.detach()
  const shortLines = []
  for (const [block, lines] of textBlocks) {
    if (lines.length < 2) continue
    if (lines.some((line) => {
      const visibleCharacters = line.text.replace(/\\s/g, '').length
      return visibleCharacters > 0 && visibleCharacters < 4
    })) shortLines.push(describe(block))
  }

  const panel = document.querySelector('.notifications-panel')
  const panelBounds = panel && isVisible(panel) ? panel.getBoundingClientRect() : null
  const notificationOutside = panelBounds
    ? panelBounds.left < 0
      || panelBounds.top < 0
      || panelBounds.right > window.innerWidth
      || panelBounds.bottom > window.innerHeight
    : false
  const notificationHorizontalOverflow = panelBounds
    ? panel.scrollWidth > panel.clientWidth + 1
    : false
  const mobileTabs = document.querySelector('.mobile-tabs')
  const tabsBounds = mobileTabs && isVisible(mobileTabs) ? mobileTabs.getBoundingClientRect() : null
  let notificationOccluded = false
  if (panelBounds && tabsBounds) {
    const left = Math.max(panelBounds.left, tabsBounds.left)
    const right = Math.min(panelBounds.right, tabsBounds.right)
    const top = Math.max(panelBounds.top, tabsBounds.top)
    const bottom = Math.min(panelBounds.bottom, tabsBounds.bottom)
    if (right > left && bottom > top) {
      const topElement = document.elementFromPoint((left + right) / 2, (top + bottom) / 2)
      notificationOccluded = Boolean(topElement && !panel.contains(topElement))
    }
  }
  const touch = matchMedia('(hover: none), (pointer: coarse)').matches
  const visibleCarouselArrows = touch
    ? Array.from(document.querySelectorAll('.carousel-arrow, .carousel-edge-zone'))
        .filter(isVisible).length
    : 0

  return {
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
    narrowText,
    shortLines,
    visibleCarouselArrows,
    notificationOutside,
    notificationOccluded,
    notificationHorizontalOverflow,
  }
})()`

async function inspectPage(page: Page): Promise<InspectionResult> {
  return page.evaluate<InspectionResult>(inspectionScript)
}

async function main() {
  const routes = discoverRoutes(path.join(process.cwd(), 'app'))
  const failures: string[] = []
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 360, height: 900 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce',
    ...(process.env.LAYOUT_CHECK_STORAGE_STATE
      ? { storageState: process.env.LAYOUT_CHECK_STORAGE_STATE }
      : {}),
  })
  const page = await context.newPage()

  try {
    for (const route of routes) {
      let response
      try {
        response = await page.goto(`${baseUrl}${route.path}`, { waitUntil: 'domcontentloaded' })
      } catch (error) {
        throw new Error(`Could not load route ${route.pattern}: ${String(error)}`)
      }
      if (!response || !response.ok()) {
        failures.push(`${route.pattern}: page returned ${response?.status() ?? 'no response'}`)
      }
      await page.waitForTimeout(100)

      const notificationTrigger = page.locator('.notifications-trigger')
      if (await notificationTrigger.count()) {
        await notificationTrigger.click()
        await page.waitForTimeout(100)
      }

      for (const width of widths) {
        await page.setViewportSize({ width, height: 900 })
        await page.waitForTimeout(50)
        const result = await inspectPage(page)
        const prefix = `${route.pattern} at ${width}px`
        if (result.horizontalOverflow) failures.push(`${prefix}: horizontal overflow`)
        if (result.narrowText.length) {
          const targets = result.narrowText.slice(0, 5).map(({ target, width }) => `${target} (${width}px)`).join(', ')
          failures.push(`${prefix}: text in a box narrower than 72px: ${targets}`)
        }
        if (result.shortLines.length) {
          failures.push(`${prefix}: multi-line text has a line under 4 characters: ${result.shortLines.slice(0, 5).join(', ')}`)
        }
        if (result.visibleCarouselArrows) failures.push(`${prefix}: carousel arrows are visible on touch`)
        if (result.notificationOutside) failures.push(`${prefix}: notification panel extends past the viewport`)
        if (result.notificationOccluded) failures.push(`${prefix}: notification panel is covered by the mobile tabs`)
        if (result.notificationHorizontalOverflow) failures.push(`${prefix}: notification panel scrolls horizontally`)
      }

      if (await notificationTrigger.count()) await notificationTrigger.click()
    }
  } finally {
    await context.close()
    await browser.close()
  }

  if (failures.length) {
    console.error(`Layout check found ${failures.length} issue(s):`)
    for (const failure of failures) console.error(`- ${failure}`)
    process.exitCode = 1
    return
  }

  console.log(`Layout check passed: ${routes.length} routes at ${widths.length} viewport widths.`)
}

void main()
