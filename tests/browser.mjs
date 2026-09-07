import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { startServer } from './helpers/server.mjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === 'win32' ? 'msedge' : '');
const browser = await chromium.launch({ headless: true, ...(channel ? { channel } : {}) });
await mkdir('test-artifacts', { recursive: true });
try {
  for (const mode of ['fixtures', 'offline']) {
    const server = await startServer(mode);
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    try {
      await page.goto(server.base);
      await page.getByLabel('选择一个或多个目的地城市').click();
      await page.getByLabel('搜索省份或城市').fill('浙江');
      assert.equal(await page.getByText('浙江省', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('杭州').isChecked(), true);
      await page.getByLabel('选择一个或多个目的地城市').click();
      await page.getByLabel('旅行天数').fill('1');
      await page.getByLabel('旅行预算（元）').fill('6000');
      await page.getByLabel('餐饮偏好').fill('杭帮菜');
      await page.getByRole('button', { name: '生成旅行与美食方案' }).click();
      await page.locator('.result').waitFor({ timeout: 30000 });
      await page.locator('.route-map').waitFor();
      assert.ok(await page.locator('.map-marker').count() >= 4);
      const mapPoint = page.locator('.map-point-list button').nth(1);
      const mapPointName = (await mapPoint.innerText()).replace(/^\d+\s*/, '');
      await mapPoint.click();
      assert.ok((await page.locator('.map-popover').innerText()).includes(mapPointName));
      await page.getByRole('button', { name: '第 1 天', exact: true }).click();
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
      if (mode === 'fixtures') {
        // Reproduce the reported three-day bug and the all-pending restaurant state.
        await page.getByLabel('旅行天数').fill('3');
        await page.getByLabel('饮食禁忌 / 过敏').fill('花生过敏');
        const response = page.waitForResponse(r => r.url().endsWith('/api/plan') && r.request().method() === 'POST', { timeout: 60000 });
        await page.getByRole('button', { name: '生成旅行与美食方案' }).click();
        assert.equal((await response).status(), 200);
        await page.waitForFunction(() => document.querySelectorAll('.day').length === 3);
        const names = await page.locator('.stop strong').allTextContents();
        assert.equal(names.length, 9); assert.equal(new Set(names).size, 9);
        assert.equal(await page.locator('.meal').count(), 6);
        assert.equal(await page.getByText('暂未安排餐厅', { exact: true }).count(), 6);
        assert.ok(await page.locator('.meal .restaurant h4:visible').count() >= 6, 'Specific restaurant names must be visible without expanding details');
        assert.ok(await page.getByText('具体门店建议 · 需确认后安排', { exact: true }).count() > 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.locator('.meal').first().screenshot({ path: 'test-artifacts/multiday-food-mobile.png' });
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.locator('.day').first().screenshot({ path: 'test-artifacts/multiday-day-desktop.png' });
      }
      assert.deepEqual(errors, []);
      console.log(`PASS browser: ${mode}, desktop/mobile, no client errors`);
    } finally { await page.close(); server.stop(); }
  }
} finally { await browser.close(); }
