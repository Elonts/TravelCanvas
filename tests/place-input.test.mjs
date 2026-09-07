import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePlaceNames } from '../lib/place-input.mjs';

test('custom place input accepts Chinese punctuation, commas and newlines while removing duplicates', () => {
  assert.deepEqual(parsePlaceNames('灵隐寺、 雷峰塔，灵隐寺\n楼外楼孤山店,知味观湖滨店'), ['灵隐寺', '雷峰塔', '楼外楼孤山店', '知味观湖滨店']);
});

test('custom place input drops invalid names and enforces its limit', () => {
  assert.deepEqual(parsePlaceNames('A、合格地点、另一个地点', 1), ['合格地点']);
});
