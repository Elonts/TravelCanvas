import assert from 'node:assert/strict';
import test from 'node:test';
import { userFacingRequestError } from '../lib/client-errors.mjs';

test('network failures explain how to restart the local service in Chinese', () => {
  assert.match(userFacingRequestError(new TypeError('Failed to fetch'), '失败'), /无法连接本地服务/);
  assert.match(userFacingRequestError(new TypeError('NetworkError'), '失败'), /启动 TravelCanvas/);
});

test('server messages remain visible and unknown failures use the supplied fallback', () => {
  assert.equal(userFacingRequestError(new Error('候选已过期'), '失败'), '候选已过期');
  assert.equal(userFacingRequestError('unknown', '路线生成失败'), '路线生成失败');
});
