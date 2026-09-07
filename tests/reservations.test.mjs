import assert from 'node:assert/strict';
import test from 'node:test';
import { reservationEvidence } from '../lib/reservations.mjs';

test('reservation requirement only trusts a government HTTPS source containing the exact attraction', () => {
  const evidence = reservationEvidence('故宫博物院', [{ title: '参观提示', url: 'https://example.gov.cn/tour', content: '故宫博物院实行预约参观，请提前办理。' }], '2026-09-07T00:00:00.000Z');
  assert.equal(evidence.status, 'required');
  assert.equal(evidence.sourceUrl, 'https://example.gov.cn/tour');
  assert.equal(reservationEvidence('故宫博物院', [{ title: '攻略', url: 'https://example.com', content: '故宫博物院需要预约。' }]).status, 'unknown');
});

test('unmatched and lookalike government domains remain unknown', () => {
  assert.equal(reservationEvidence('灵隐寺', [{ title: '提示', url: 'https://gov.cn.evil.test', content: '灵隐寺必须预约。' }]).status, 'unknown');
  assert.equal(reservationEvidence('灵隐寺', [{ title: '提示', url: 'https://example.gov.cn', content: '其他景点必须预约。' }]).status, 'unknown');
});
