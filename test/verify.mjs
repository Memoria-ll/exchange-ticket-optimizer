// 交換券価値最適化ツール — 地域対応 DOM非依存 検証ハーネス
//
// HTML の <script> 本文（ブートストラップの fetch チェーンを除く）を
// vm コンテキストで評価し、実際の関数（applyRegion / obtainable / computeFlow /
// solveScenario / verifyModel 等）を本物の入口として直接呼び出す。
// ローカルに再実装した resolver/predicate は注入しない。
//
// 実行: node test/verify.mjs

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));

const results = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
  }
}

// ---------------------------------------------------------------
// 1. data/*.json が parse できる
// ---------------------------------------------------------------
let config, regions, transfer, recipes, machines;
check('data/*.json が parse できる', () => {
  config  = readJson(path.join(root, 'data/config.json'));
  regions = readJson(path.join(root, 'data/regions.json'));
  transfer = readJson(path.join(root, 'data/transfer.json'));
  recipes  = readJson(path.join(root, 'data/recipes.json'));
  machines = readJson(path.join(root, 'data/machines.json'));
});

// ---------------------------------------------------------------
// HTML の <script> 本文を抽出し、ブートストラップの fetch 部分を切り落として評価
// ---------------------------------------------------------------
const html = fs.readFileSync(path.join(root, '交換券最適化ツール.html'), 'utf8');
const scriptMatch = html.match(/<script>([\s\S]*)<\/script>/);
if (!scriptMatch) throw new Error('<script> タグが見つかりません');
let scriptBody = scriptMatch[1];
const cutIdx = scriptBody.indexOf('const fetchJson=');
if (cutIdx < 0) throw new Error('ブートストラップの目印 (const fetchJson=) が見つかりません');
scriptBody = scriptBody.slice(0, cutIdx);

const sandbox = {
  console,
  Math, Float64Array, Set, Array, Object, JSON,
  performance: { now: () => Date.now() },
  setTimeout, clearTimeout,
};
vm.createContext(sandbox);
vm.runInContext(scriptBody, sandbox, { filename: 'tool-script.js' });

// トップレベル let は vm コンテキストの字句スコープに残る（sandbox のプロパティにはならない）。
// runInContext の戻り値経由で読み書きする（関数宣言は sandbox.xxx として直接呼べる）。
const g = expr => vm.runInContext(expr, sandbox);
const set = code => vm.runInContext(code, sandbox);

sandbox.initRaw(config, regions, transfer, recipes, machines);

// ---------------------------------------------------------------
// 2. 武陵: miningPower / FIXED_POWER / genPerUnit
// ---------------------------------------------------------------
check('武陵: miningPower・FIXED_POWER・genPerUnit の導出値一致', () => {
  sandbox.applyRegion('buryo');
  const byName = Object.fromEntries(g('RESOURCES').map(r => [r.name, r.miningPower]));
  assert.ok(Math.abs(byName['源石鉱物'] - 135) < 0.01, `源石鉱物=${byName['源石鉱物']}`);
  assert.ok(Math.abs(byName['青鉄鉱物'] - 45) < 0.01, `青鉄鉱物=${byName['青鉄鉱物']}`);
  assert.ok(Math.abs(byName['赤銅鉱物'] - 90) < 0.01, `赤銅鉱物=${byName['赤銅鉱物']}`);
  const fixedPower = g('FIXED_POWER');
  assert.ok(Math.abs(fixedPower - 570) < 0.01, `FIXED_POWER=${fixedPower}`);
  const bgm = g('BATTERY_GEN_MAP');
  assert.ok(Math.abs(bgm['小容量武陵バッテリー'] - 1066.6666666666667) < 0.01);
  assert.ok(Math.abs(bgm['中容量武陵バッテリー'] - 2133.3333333333335) < 0.01);
});

// ---------------------------------------------------------------
// 3. 谷地: miningPower / FIXED_POWER / genPerUnit
// ---------------------------------------------------------------
check('谷地: miningPower・FIXED_POWER・genPerUnit の導出値一致', () => {
  sandbox.applyRegion('yachi');
  const byName = Object.fromEntries(g('RESOURCES').map(r => [r.name, r.miningPower]));
  assert.ok(Math.abs(byName['源石鉱物'] - 140) < 0.01, `源石鉱物=${byName['源石鉱物']}`);
  assert.ok(Math.abs(byName['青鉄鉱物'] - 540) < 0.01, `青鉄鉱物=${byName['青鉄鉱物']}`);
  assert.ok(Math.abs(byName['紫晶鉱物'] - 60) < 0.01, `紫晶鉱物=${byName['紫晶鉱物']}`);
  const fixedPower = g('FIXED_POWER');
  assert.ok(Math.abs(fixedPower - 1040) < 0.01, `FIXED_POWER=${fixedPower}`);
  const bgm = g('BATTERY_GEN_MAP');
  assert.ok(Math.abs(bgm['小容量谷地バッテリー'] - 146.66666666666666) < 0.01);
  assert.ok(Math.abs(bgm['中容量谷地バッテリー'] - 280) < 0.01);
  assert.ok(Math.abs(bgm['大容量谷地バッテリー'] - 733.3333333333334) < 0.01);
});

// ---------------------------------------------------------------
// 4. 武陵ベースライン: verifyModel が true、solveScenario の ptPerMin > 0
// ---------------------------------------------------------------
check('武陵ベースライン: verifyModel=true かつ ptPerMin>0', () => {
  sandbox.applyRegion('buryo');
  set('EXTERNAL_MAP = {};');
  const items = sandbox.activeItems();
  const models = items.map(it => sandbox.buildItemModel(it));
  const limits = g('cfg').resourceLimits;
  const lims = g('RESOURCES').map(r => limits[r.name] ?? r.defaultMax);
  const ranges = models.map(m => sandbox.itemAloneMax(m, lims));
  const fastEv = sandbox.makeEvaluator(models, limits);
  const ok = sandbox.verifyModel(models, fastEv, limits, ranges);
  assert.strictEqual(ok, true, 'verifyModel should be true for 武陵 baseline');
  const r = sandbox.solveScenario(models, limits);
  assert.ok(r && r.ptPerMin > 0, `ptPerMin=${r && r.ptPerMin}`);
  console.log(`  [info] 武陵ベースライン ptPerMin = ${r.ptPerMin.toFixed(3)}`);
});

// ---------------------------------------------------------------
// 5. 谷地: activeItems相当が['鉄製部品']のみ。obtainable('水')/obtainable('芽針エキス')が false
// ---------------------------------------------------------------
check('谷地: activeItemsが鉄製部品のみ・水/芽針エキスは obtainable=false', () => {
  sandbox.applyRegion('yachi');
  const names = sandbox.activeItems().map(it => it.name);
  assert.deepStrictEqual(names, ['鉄製部品'], `activeItems=${JSON.stringify(names)}`);
  assert.strictEqual(sandbox.obtainable('水'), false);
  assert.strictEqual(sandbox.obtainable('芽針エキス'), false);
});

// ---------------------------------------------------------------
// 6. 武陵: EXTERNAL_MAP={青鉄製ボトル:12.5} の computeFlow が lineAcc['青鉄製ボトル製造'] を減らす
//    (電力は外部電池供給で賄い、天有洪炉等の機械上限に依存しない固定シナリオにする)
// ---------------------------------------------------------------
check('武陵: EXTERNAL_MAP(青鉄製ボトル)供給でcomputeFlowのlineAccが減る', () => {
  sandbox.applyRegion('buryo');
  // 採掘上限は本チェックの主題ではないため、チェーン量に対して十分大きく取る
  const limits = { ...g('cfg').resourceLimits, '青鉄鉱物': 1000, '源石鉱物': 5000 };
  const scales = { '芽針注射剤I': 1 };

  set("EXTERNAL_MAP = {'大容量谷地バッテリー':5};");
  const r0 = sandbox.computeFlow(scales, limits);
  assert.ok(r0, '外部電池のみ供給時の computeFlow は成立するはず');
  const before = r0.lineAcc['青鉄製ボトル製造'] || 0;
  assert.ok(before > 0, `before=${before}`);

  set("EXTERNAL_MAP = {'大容量谷地バッテリー':5, '青鉄製ボトル':12.5};");
  const r1 = sandbox.computeFlow(scales, limits);
  assert.ok(r1, '青鉄製ボトル外部供給時の computeFlow も成立するはず');
  const after = r1.lineAcc['青鉄製ボトル製造'] || 0;
  assert.ok(after < before - 1e-9, `before=${before} after=${after}`);
  set('EXTERNAL_MAP = {};');
});

// ---------------------------------------------------------------
// 7. 到達可能プルーニング: reachableInputs の出力に基づき、到達不能な素材名は union 外
// ---------------------------------------------------------------
check('プルーニング: 到達可能入力名の和集合が谷地で正しく絞られる', () => {
  sandbox.applyRegion('yachi');
  const items = sandbox.activeItems(); // ['鉄製部品']
  const union = new Set();
  for (const it of items) for (const n of sandbox.reachableInputs(it.recipe)) union.add(n);
  assert.ok(union.has('青鉄塊'), `union=${[...union]}`);
  assert.strictEqual(union.has('紫晶粉末'), false, '紫晶粉末は到達不能のはず');
  assert.strictEqual(union.has('喬花'), false, '喬花は到達不能のはず');
});

// ---------------------------------------------------------------
// 8. 武陵: EXTERNAL_MAP={大容量谷地バッテリー:1.25} の solveScenario ptPerMin がベースラインより増える
// ---------------------------------------------------------------
check('武陵: 外部電池供給でptPerMinがベースラインより増える(発電在庫合算)', () => {
  sandbox.applyRegion('buryo');
  const limits = g('cfg').resourceLimits;
  set('EXTERNAL_MAP = {};');
  const items = sandbox.activeItems();
  const baseModels = items.map(it => sandbox.buildItemModel(it));
  const base = sandbox.solveScenario(baseModels, limits);
  assert.ok(base, 'ベースライン solveScenario は成立するはず');

  // 電池はレシピ入力に現れないため baseModels をそのまま再利用できる(§推論部の最適化 2)
  set("EXTERNAL_MAP = {'大容量谷地バッテリー':1.25};");
  const withExt = sandbox.solveScenario(baseModels, limits);
  assert.ok(withExt, '外部電池供給時の solveScenario も成立するはず');
  assert.ok(withExt.ptPerMin > base.ptPerMin + 1e-6,
    `base=${base.ptPerMin} withExt=${withExt.ptPerMin}`);
  set('EXTERNAL_MAP = {};');
});

// ---------------------------------------------------------------
// 9. 外部電池供給状態での fastEv と computeFlow の一致（verifyModel 経由）
// ---------------------------------------------------------------
check('外部電池供給下でfastEvとcomputeFlowが一致する(verifyModel)', () => {
  sandbox.applyRegion('buryo');
  const limits = g('cfg').resourceLimits;
  set("EXTERNAL_MAP = {'大容量谷地バッテリー':1.25};");
  const items = sandbox.activeItems();
  const models = items.map(it => sandbox.buildItemModel(it));
  const lims = g('RESOURCES').map(r => limits[r.name] ?? r.defaultMax);
  const ranges = models.map(m => sandbox.itemAloneMax(m, lims));
  const fastEv = sandbox.makeEvaluator(models, limits);
  const ok = sandbox.verifyModel(models, fastEv, limits, ranges);
  assert.strictEqual(ok, true, '外部電池供給下でも fastEv と computeFlow は一致するはず');
  set('EXTERNAL_MAP = {};');
});

check('recipeForItem: 壌晶廃液は本流(化学反応炉)が選ばれ還元レシピに奪われない', () => {
  sandbox.applyRegion('buryo');
  const r = sandbox.recipeForItem('壌晶廃液');
  assert.ok(r, '壌晶廃液のレシピが見つかるはず');
  assert.notStrictEqual(r.name, '不活性壌晶還元',
    'タイブレークは前方一致の本流を優先するはず');
  assert.strictEqual(r.machine, '化学反応炉');

  // タイトル命名移行後(壌晶廃液→壌晶廃液生産)も本流が選ばれることを、
  // 実 RECIPES の名前を書き換えて実関数経由でピンする。配列順で偶然
  // cands[0] が本流になる偽greenを避けるため、逆順でも確認する
  set("RECIPES.find(r=>r.name==='壌晶廃液').name='壌晶廃液生産'");
  set('RECIPES.reverse()');
  try {
    const r2 = sandbox.recipeForItem('壌晶廃液');
    assert.strictEqual(r2.name, '壌晶廃液生産',
      'タイトル命名後も(配列順に依らず)前方一致で本流が選ばれるはず');
  } finally {
    // RECIPES の要素は RAW.recipes と同一参照 — 後続チェックのため必ず戻す
    set('RECIPES.reverse()');
    set("RECIPES.find(r=>r.name==='壌晶廃液生産').name='壌晶廃液'");
  }
});

// ---------------------------------------------------------------
// レポート
// ---------------------------------------------------------------
let failCount = 0;
for (const r of results) {
  if (r.ok) {
    console.log(`PASS: ${r.name}`);
  } else {
    failCount++;
    console.log(`FAIL: ${r.name}`);
    console.log(`      ${r.error}`);
  }
}
console.log(`\n${results.length - failCount}/${results.length} passed`);
process.exit(failCount > 0 ? 1 : 0);
