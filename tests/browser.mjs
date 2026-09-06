import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startServer } from './helpers/server.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
await mkdir('test-artifacts', { recursive: true });
try {
  for (const mode of ['fixtures', 'offline']) {
    const server = await startServer(mode);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(server.base);
      await page.getByLabel('旅行天数').fill('1');
      await page.getByLabel('旅行预算（元）').fill('6000');
      await page.getByLabel('餐饮偏好').fill('杭帮菜');
      await page.getByRole('button', { name: '生成旅行与美食方案' }).click();
      await page.locator('.result').waitFor({ timeout: 30000 });
      assert.equal(await page.locator('.meal').count(), 2);
      if (mode === 'fixtures') {
        const meal = page.locator('.meal').first();
        const before = await meal.locator('h4').first().innerText();
        await meal.getByRole('button', { name: '更省钱', exact: true }).click();
        await page.waitForFunction(name => document.querySelector('.meal h4')?.textContent !== name, before);
        assert.notEqual(await meal.locator('h4').first().innerText(), before);
        await meal.getByRole('button', { name: '锁定这家' }).click();
        await meal.getByRole('button', { name: '解锁餐厅' }).waitFor();
        assert.equal(await meal.getByRole('button', { name: '更省钱', exact: true }).isDisabled(), true);
        await meal.getByRole('button', { name: '解锁餐厅' }).click();
        await meal.getByRole('button', { name: '锁定这家' }).waitFor();
        await meal.getByRole('button', { name: '更顺路', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.result')?.getAttribute('aria-busy') === 'false');
        assert.equal(await page.locator('.error[role="alert"]').count(), 0, (await page.locator('.error[role="alert"]').allTextContents()).join());
        assert.ok(await page.locator('.evidence-tip').count() > 0);
      } else assert.equal(await page.getByText('暂未安排餐厅', { exact: true }).count(), 2);
      await page.locator('.result').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `test-artifacts/${mode}-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile layout must not overflow');
      await page.screenshot({ path: `test-artifacts/${mode}-mobile.png`, fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`PASS browser: ${mode}, desktop/mobile, no client errors`);
    } finally { await page.close(); server.stop(); }
  }
} finally { await browser.close(); }
