# exchange-ticket-optimizer

単一HTML（`交換券最適化ツール.html`）＋ `data/*.json` のビルド不要ツール。
ロジックはすべて HTML 内の単一 `<script>`。検証ゲート: `node test/verify.mjs`
（DOM 非依存。script 本文を vm で評価し、applyRegion / solveScenario /
computeFlow / verifyModel を実データ経路で直接叩く）。

## Ledger

### Traps
- `水`・`沈殿酸` は inputs=[] のポンプレシピとして recipes.json に存在する。地域の
  liquidSupply から外すだけでは自給できてしまう — `filterRecipesForRegion` が
  無入力ポンプレシピを地域の実効レシピ集合から除外することでフィルタが成立する。
- `calcLines` は入手不能アイテムを**無言でスキップ**する（不成立にならず生産を過大報告）。
  computeFlow の unmet ガード＋`obtainable()` による事前フィルタが防波堤。モデル構築対象は
  必ず `activeItems()`（enabled かつ recipe解決済み かつ obtainable）経由にすること。
- fastEv（makeEvaluator）・buildLP・computeFlow Step7 は電力/電池の意味論を三者で一致させる
  必要がある（verifyModel が120点クロスチェックで検出）。電池順は `sortedBatteryIndices`
  （pt/genPerUnit 昇順）1か所に集約されており、個別にソートを書いてはいけない。
- 最適化対象の品目リストと z 配列の添字対応は `activeItems()` に一本化されている。
  独自に `EXCHANGE_ITEMS.filter(...)` を書くと添字がずれて黙って壊れる。
- scanner の confirm帯 [Y/n] は Yes で「提示された既存名の variant」として恒久登録される。
  別アイテムに Y すると以後 conf 1.00 で誤判定し続ける（青鉄粉末が赤銅粉末_01 として
  吸収された実例）。迷ったら n → unknown 登録へ。
- 粉末系アイテムは同一スプライトの色替え。形状照合(TM_CCOEFF_NORMED)だけでは色違い同士が
  0.85 を超える（実測 0.89〜0.93）— icon_matcher の HUE_GATE（色相ヒストグラム）が防波堤。

### Invariants / identity keys
- 電池はどのレシピの入力にも現れない（全38レシピ確認済）。これが「EXTERNAL_MAP の電池
  = 無償の発電在庫」を需要相殺経路と二重計上せずに済ませている前提。電池を入力に持つ
  レシピを scanner が取り込んだら extBatGenFromMap の扱いを再設計すること。
- `recipeForItem` の曖昧性タイブレークは「r.name === アイテム名 を優先」。現データで
  複数レシピが同名 output を持つのは `壌晶廃液`（本流と不活性壌晶還元）のみ。
- buildLP の Pconst は転送電池の発電で負になり得るが clamp しない（regime 0 の制約対が
  余剰電力ケースを表す）。

### Invariants / identity keys (scanner)
- アイテム名の系譜は 採掘「◯◯鉱物」→ 精錬「◯◯塊」→ 粉砕「◯◯粉末」。scanner 登録時の
  名前は recipes.json の既存名に必ず合わせる（「赤銅鉱石」のような新名の即興命名が
  データ分裂の温床）。

### Environment quirks
- recipes.json は scanner 自動生成。手で編集しない。
- `scanner/` と `data/recipes/` は gitignore 済み — scanner のコード修正はリポジトリに
  乗らない。tracked なのはマージ出力の data/recipes.json のみ。
- 谷地はバッテリー生産レシピ未登録のため電力がまかなえず、ベースライン「解なし」が
  正しい創発結果（scanner でレシピ取込後に自動で解ける）。
