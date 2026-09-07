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
      await page.getByRole('button', { name: /发现景区、美食与娱乐候选/ }).click();
      await page.locator('.candidate-panel').waitFor({ timeout: 60000 });

      if (mode === 'offline') {
        assert.equal(await page.locator('.candidate-card').count(), 0);
        assert.equal(await page.getByRole('button', { name: /用已选地点生成路线/ }).isDisabled(), true);
        assert.ok((await page.locator('.candidate-panel').innerText()).includes('高德 部分待确认'));
      } else {
        for (const label of ['景区 · 杭州', '美食 · 杭州', '娱乐 · 杭州']) {
          const card = page.locator('.candidate-card').filter({ hasText: label }).first();
          await card.getByRole('button', { name: '加入行程' }).click();
        }
        assert.ok(await page.locator('.candidate-image img').count() >= 3);
        await page.waitForFunction(() => [...document.querySelectorAll('.candidate-image img')].slice(0, 3).every(image => image.complete && image.naturalWidth > 0));
        assert.ok(await page.getByText(/小红书公开笔记证据/).count() > 0);
        await page.getByRole('button', { name: /用已选地点生成路线/ }).click();
        await page.locator('.result').waitFor({ timeout: 60000 });
        await page.locator('.route-map').waitFor();
        assert.ok(await page.locator('.map-point-list button').count() >= 3);
        assert.ok((await page.locator('.map-fallback').innerText()).includes('未配置高德 JS Key'));
        assert.equal(await page.locator('.day-tabs button').count(), 1);
        assert.ok(await page.locator('.day-guide').count() === 1);
        assert.ok(await page.getByRole('link', { name: /在高德地图打开并导航/ }).count() >= 3);
        const firstNavigation = await page.getByRole('link', { name: /在高德地图打开并导航/ }).first().getAttribute('href');
        assert.ok(firstNavigation.startsWith('https://uri.amap.com/navigation?'));
        const mapPoint = page.locator('.map-point-list button').nth(1);
        const mapPointName = (await mapPoint.innerText()).replace(/^\d+\s*/, '');
        await mapPoint.click();
        assert.ok((await page.locator('.map-popover').innerText()).includes(mapPointName));
        assert.equal(await page.locator('.meal').count(), 2);
        const meal = page.locator('.meal').first();
        if (await meal.getByRole('button', { name: '解锁餐厅' }).count()) await meal.getByRole('button', { name: '解锁餐厅' }).click();
        const before = await meal.locator('h4').first().innerText();
        await meal.getByRole('button', { name: '更省钱', exact: true }).click();
        await page.waitForFunction(name => document.querySelector('.meal h4')?.textContent !== name, before);
        assert.notEqual(await meal.locator('h4').first().innerText(), before);
        await meal.getByRole('button', { name: '锁定这家' }).click();
        await meal.getByRole('button', { name: '解锁餐厅' }).waitFor();
        assert.equal(await meal.getByRole('button', { name: '更省钱', exact: true }).isDisabled(), true);
        assert.ok(await page.locator('.evidence-tip').count() > 0);
      }

      await page.screenshot({ path: `test-artifacts/${mode}-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile layout must not overflow');
      await page.screenshot({ path: `test-artifacts/${mode}-mobile.png`, fullPage: true });
      assert.deepEqual(errors, []);
      console.log(`PASS browser: ${mode}, two-stage discovery and responsive layout`);
    } finally { await page.close(); server.stop(); }
  }
} finally { await browser.close(); }
