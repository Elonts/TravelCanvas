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
    const entertainmentRequests = []; page.on('request', request => { if (request.url().includes('/api/plan/entertainment')) entertainmentRequests.push(request.postDataJSON()); });
    try {
      await page.goto(server.base);
      assert.equal(await page.getByRole('heading', { name: '从想去，到走得通。' }).count(), 1);
      assert.equal(await page.locator('.journey-preview[data-state="idle"]').count(), 1);
      assert.ok((await page.locator('.journey-preview-foot').innerText()).includes('不代表真实路线'));
      await page.getByLabel('选择一个或多个目的地城市').click();
      await page.getByLabel('搜索省份或城市').fill('浙江');
      assert.equal(await page.getByText('浙江省', { exact: true }).count(), 1);
      assert.equal(await page.getByLabel('杭州').isChecked(), true);
      await page.getByLabel('选择一个或多个目的地城市').click();
      await page.getByLabel('旅行天数').fill('1');
      await page.locator('.advanced-planning > summary').click();
      await page.getByLabel('旅行预算（元）').fill('6000');
      await page.getByLabel('餐饮偏好').fill('杭帮菜');
      await page.getByRole('button', { name: /开始发现地点/ }).click();
      await page.locator('.candidate-panel').waitFor({ timeout: 60000 });
      assert.equal(await page.locator('.journey-preview[data-state="discovery"]').count(), 1);
      assert.ok((await page.locator('.journey-preview-foot').innerText()).includes('候选阶段不连接为道路路线'));

      if (mode === 'offline') {
        assert.equal(await page.locator('.candidate-card').count(), 0);
        assert.equal(await page.getByRole('button', { name: /用已选地点生成路线/ }).isDisabled(), true);
        assert.ok((await page.locator('.candidate-panel').innerText()).includes('高德 部分待确认'));
      } else {
        const customAttraction = page.getByText('没有想去的景点？批量添加').locator('..');
        await customAttraction.getByRole('textbox').fill('雷峰塔、灵隐寺');
        await customAttraction.getByRole('button', { name: /核验并加入候选/ }).click();
        await page.getByRole('heading', { name: '雷峰塔', exact: true }).waitFor({ timeout: 60000 });
        for (const label of ['景区 · 杭州', '美食 · 杭州']) {
          const card = page.locator('.candidate-card').filter({ hasText: label }).first();
          await card.getByRole('button', { name: '加入行程' }).click();
        }
        const unknownFood = page.locator('.candidate-card').filter({ hasText: '测试未知餐厅（西湖店）' });
        await unknownFood.getByRole('button', { name: '加入行程' }).click();
        assert.ok(await page.locator('.candidate-image img').count() >= 3);
        await page.waitForFunction(() => [...document.querySelectorAll('.candidate-image img')].slice(0, 3).every(image => image.complete && image.naturalWidth > 0));
        assert.ok(await page.getByText(/小红书公开笔记证据/).count() > 0);
        await page.getByRole('button', { name: /用已选地点生成路线/ }).click();
        await page.locator('.result').waitFor({ timeout: 60000 });
        assert.equal(await page.locator('.journey-live[data-state="plan"]').count(), 1);
        await page.locator('.route-map').waitFor();
        assert.ok(await page.locator('.map-point-list button').count() >= 3);
        assert.equal(await page.getByLabel('高德交互式行程路线图').count(), 1);
        if (await page.locator('.map-fallback').count()) assert.ok((await page.locator('.map-fallback').innerText()).includes('地图'));
        assert.equal(await page.locator('.day-tabs button').count(), 1);
        assert.ok(await page.locator('.day-guide').count() === 1);
        assert.equal(await page.locator('.sidebar .weather').count(), 0);
        assert.equal(await page.locator('.sidebar .hotels').count(), 0);
        assert.ok(await page.getByRole('link', { name: /去携程查看酒店/ }).count() > 0);
        assert.ok(await page.getByText(/预约提示：预约要求待确认/).count() > 0);
        assert.ok(await page.getByRole('link', { name: /在高德地图打开并导航/ }).count() >= 3);
        const firstNavigation = await page.getByRole('link', { name: /在高德地图打开并导航/ }).first().getAttribute('href');
        assert.ok(firstNavigation.startsWith('https://uri.amap.com/navigation?'));
        const mapPoint = page.locator('.map-point-list button').nth(1);
        const mapPointName = (await mapPoint.innerText()).replace(/^\d+\s*/, '');
        await mapPoint.click();
        assert.ok((await page.locator('.map-popover').innerText()).includes(mapPointName));
        assert.equal(await page.locator('.meal').count(), 2);
        const foodSummaryText = await page.locator('.sidebar .card').filter({ hasText: '餐饮预算 · 全员' }).innerText();
        assert.match(foodSummaryText, /餐价格待确认（不是 ¥0）|另有 \d+ 餐待确认/);
        assert.ok(await page.getByText(/匹配口味：杭帮菜/).count() > 0);
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
        await meal.getByRole('button', { name: '解锁餐厅' }).click();
        const pendingRestaurants = meal.locator('details.alternatives').filter({ hasText: '查看其他待确认或不符合条件的候选' });
        await pendingRestaurants.locator(':scope > summary').click();
        const expensiveRestaurant = pendingRestaurants.locator('.restaurant').filter({ hasText: '测试昂贵餐厅' });
        await Promise.all([
          page.waitForResponse(response => response.url().includes('/api/food') && response.request().method() === 'POST'),
          expensiveRestaurant.getByRole('button', { name: '了解提示，仍要选择并锁定' }).click()
        ]);
        await meal.getByRole('button', { name: '解锁餐厅' }).waitFor();
        assert.ok((await meal.innerText()).includes('全员本餐费用超过分配预算'));
        assert.ok(await page.getByText('按已知价格预计超出').count() > 0);
        const entertainmentType = page.getByLabel('娱乐项目');
        assert.ok(await entertainmentType.count() === 1);
        for (const option of ['台球', '足浴', '剧本杀', '酒馆']) assert.ok((await entertainmentType.locator('option').allTextContents()).includes(option));
        assert.equal(await page.getByText('想看的娱乐项目（可多选）').count(), 0);
        await entertainmentType.selectOption({ label: '其他' });
        const customEntertainment = page.getByLabel('具体活动类型（必填）');
        await customEntertainment.waitFor();
        assert.equal(await page.getByRole('button', { name: '按当天路线查找地点' }).isDisabled(), true);
        await customEntertainment.fill('密室逃脱');
        assert.equal(await page.getByRole('button', { name: '按当天路线查找地点' }).isDisabled(), false);
        const saveDay = page.getByRole('button', { name: '保存修改并重新规划当天路线' });
        assert.equal(await saveDay.isDisabled(), true);
        await entertainmentType.selectOption({ label: '足浴' });
        await Promise.all([page.waitForResponse(response => response.url().includes('/api/plan/entertainment') && response.request().method() === 'POST'), page.getByRole('button', { name: '按当天路线查找地点' }).click()]);
        const venue = page.getByLabel('推荐的具体地点');
        await venue.waitFor();
        assert.ok(await venue.locator('option').count() > 7);
        assert.match((await venue.locator('option').nth(1).innerText()), /距离 0\.6 公里/);
        const venueValue = await venue.locator('option').nth(1).getAttribute('value');
        assert.ok(venueValue);
        await venue.selectOption(venueValue);
        await page.getByRole('button', { name: '添加到当天草稿' }).click();
        await entertainmentType.selectOption({ label: '剧本杀' });
        await Promise.all([page.waitForResponse(response => response.url().includes('/api/plan/entertainment') && response.request().method() === 'POST'), page.getByRole('button', { name: '按当天路线查找地点' }).click()]);
        assert.deepEqual(entertainmentRequests.at(-1).selectedIds, [venueValue]);
        assert.equal(await page.locator('.entertainment-draft').count(), 1, 'searching another type must keep the first draft venue');
        const secondVenue = page.getByLabel('推荐的具体地点');
        const secondValues = await secondVenue.locator('option').evaluateAll(options => options.map(option => option.value).filter(Boolean));
        const secondValue = secondValues.find(value => value !== venueValue);
        assert.ok(secondValue);
        await secondVenue.selectOption(secondValue);
        const addSecond = page.getByRole('button', { name: '添加到当天草稿' });
        assert.equal(await addSecond.isDisabled(), false);
        await addSecond.click();
        assert.equal(await page.locator('.entertainment-draft > div').count(), 2, JSON.stringify({ draft: await page.locator('.entertainment-draft').innerText(), type: await entertainmentType.inputValue(), venue: await secondVenue.inputValue(), secondValue }));
        assert.equal(await saveDay.isDisabled(), false);
        const stopsBeforeEntertainment = await page.locator('.day .stop').count();
        await Promise.all([page.waitForResponse(response => response.url().includes('/api/plan/day') && response.request().method() === 'POST'), saveDay.click()]);
        await page.getByText(/检索本身不会立即改变路线/).waitFor();
        assert.equal(await page.locator('.day .stop').count(), stopsBeforeEntertainment + 2);
        assert.ok((await page.locator('.day').innerText()).includes('足浴'));
        assert.ok((await page.locator('.day').innerText()).includes('剧本杀'));
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
