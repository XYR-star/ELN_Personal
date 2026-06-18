import test from 'node:test';
import assert from 'node:assert/strict';
import { createI18n, normalizeLang } from '../public/i18n.js';

test('normalizeLang follows eLabFTW locale values', () => {
  assert.equal(normalizeLang('zh_CN'), 'zh_CN');
  assert.equal(normalizeLang('zh-CN'), 'zh_CN');
  assert.equal(normalizeLang('en_GB'), 'en_GB');
  assert.equal(normalizeLang('en-US'), 'en_US');
});

test('normalizeLang falls back to Chinese for unsupported or missing values', () => {
  assert.equal(normalizeLang('fr_FR'), 'zh_CN');
  assert.equal(normalizeLang(''), 'zh_CN');
  assert.equal(normalizeLang(undefined), 'zh_CN');
});

test('createI18n translates planner labels and falls back to Chinese key values', () => {
  const english = createI18n('en_GB');
  const chinese = createI18n('zh_CN');

  assert.equal(english.t('app.title'), 'Experiment Planner');
  assert.equal(english.t('action.newPlan'), 'New plan');
  assert.equal(chinese.t('app.title'), '实验规划日历');
  assert.equal(english.t('missing.key'), 'missing.key');
});
