import { chromium, type Frame, type Page } from 'playwright'
import { existsSync } from 'node:fs'

const frontendUrl = process.env.CRESCO_TEST_FRONTEND_URL ?? 'http://127.0.0.1:4173'

const apps = [
  {
    title: '事件循环推演台',
    appId: 'web-app-event-loop',
    async interact(frame: Frame) {
      const onboarding = frame.locator('#ob-close')
      if (await onboarding.isVisible()) await onboarding.click()
      const before = await frame.evaluate(() => (window as any).render_game_to_text())
      await frame.locator('#btn-fwd').click()
      const after = await frame.evaluate(() => (window as any).render_game_to_text())
      if (before === after) throw new Error('single-step did not change state')
      return after
    },
  },
  {
    title: '神经网络训练可视化',
    appId: 'web-app-nn-trainer',
    async interact(frame: Frame) {
      const before = await frame.evaluate(() => (window as any).render_game_to_text())
      await frame.getByRole('button', { name: '单步训练' }).click()
      const after = await frame.evaluate(() => (window as any).render_game_to_text())
      if (!after.includes('epoch:1')) throw new Error(`training step failed: ${after}`)
      return `${before} -> ${after}`
    },
  },
  {
    title: 'KIMI 立体课本：喷气发动机实验台',
    appId: 'web-app-kimi-jet-lab',
    async interact(frame: Frame) {
      await frame.getByRole('button', { name: '启动机' }).click()
      const state = await frame.evaluate(() => (window as any).render_game_to_text())
      if (!state.includes('"run":"starting"')) {
        throw new Error(`starter did not change run state: ${state}`)
      }
      return state
    },
  },
  {
    title: '一片叶子的能量工厂',
    appId: 'web-app-photosynthesis',
    async interact(frame: Frame) {
      const before = await frame.evaluate(() => (window as any).render_game_to_text())
      await frame.locator('#nextBtn').click()
      const after = await frame.evaluate(() => (window as any).render_game_to_text())
      if (before === after) throw new Error('next step did not change module state')
      return after
    },
  },
]

async function findAppFrame(page: Page, appId: string): Promise<Frame> {
  await page.waitForFunction(
    expected => [...document.querySelectorAll('iframe')]
      .some(frame => (frame as HTMLIFrameElement).src.includes(String(expected))),
    appId,
  )
  const handle = await page.locator(`iframe[src*="${appId}"]`).elementHandle()
  const frame = await handle?.contentFrame()
  if (!frame) throw new Error(`iframe not available for ${appId}`)
  await frame.waitForLoadState('domcontentloaded')
  await frame.waitForFunction(() => document.body?.innerText.trim().length > 20, undefined, {
    timeout: 10_000,
  }).catch(async error => {
    const box = await page.locator(`iframe[src*="${appId}"]`).boundingBox()
    const state = await frame.evaluate(() => ({
      title: document.title,
      bodyDisplay: getComputedStyle(document.body).display,
      textLength: document.body?.innerText.trim().length ?? 0,
    }))
    throw new Error(`${appId} did not render content: ${JSON.stringify({ box, state })}`, {
      cause: error,
    })
  })
  return frame
}

const installedChromium = [
  chromium.executablePath(),
  '/home/dzz/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
  '/home/dzz/.cache/ms-playwright/chromium-1161/chrome-linux/chrome',
].find(existsSync)
if (!installedChromium) throw new Error('No installed Chromium executable found')

const browser = await chromium.launch({
  headless: true,
  executablePath: installedChromium,
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const browserErrors: string[] = []
page.on('pageerror', error => browserErrors.push(`pageerror: ${error.message}`))
page.on('requestfailed', request => {
  browserErrors.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`)
})
page.on('response', response => {
  if (response.status() >= 400) {
    browserErrors.push(`http-${response.status()}: ${response.url()}`)
  }
})

const results: Array<Record<string, unknown>> = []
let cardTitles: string[] = []
try {
  await page.goto(`${frontendUrl}/artifacts`, { waitUntil: 'networkidle' })
  cardTitles = await page.locator('.artifact-list article h2').allTextContents()
  for (const app of apps) {
    if (!cardTitles.includes(app.title)) throw new Error(`missing artifact card: ${app.title}`)
  }

  for (const app of apps) {
    console.error(`VERIFY ${app.appId}`)
    const errorsBefore = browserErrors.length
    const card = page.locator('.artifact-list article').filter({
      has: page.locator('h2', { hasText: app.title }),
    })
    await card.getByRole('button', { name: '在右侧打开' }).click()
    const frame = await findAppFrame(page, app.appId)
    const sidePane = await frame.evaluate(() => ({
      title: document.title,
      textLength: document.body.innerText.trim().length,
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      buttons: document.querySelectorAll('button').length,
      canvases: document.querySelectorAll('canvas').length,
    }))
    if (sidePane.textLength < 20) throw new Error(`${app.appId} rendered blank`)

    const interaction = await app.interact(frame)
    await page.getByRole('button', { name: '沉浸', exact: true }).click()
    await page.waitForTimeout(150)
    const immersive = await frame.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    if (immersive.width < 1000) throw new Error(`${app.appId} immersive resize failed`)

    results.push({
      appId: app.appId,
      title: app.title,
      sidePane,
      immersive,
      interaction,
      errors: browserErrors.slice(errorsBefore),
    })
    await page.goto(`${frontendUrl}/artifacts`, { waitUntil: 'networkidle' })
  }
} finally {
  await browser.close()
}

console.log(JSON.stringify({ cardTitles, results, browserErrors }, null, 2))
