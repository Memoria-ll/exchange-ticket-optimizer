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
- HTML は recipe の env（環境条件）を未評価 — env 違いの代替レシピが併存すると
  recipeForItem は前方一致タイブレークで両方一致し配列順で拾う。環境条件の最適化側
  モデル化は未対応（#3 の代替レシピ地域別選択と同族の課題）。
- 精製機には動作モード（液体/ガス）があり recipes.json はモードを区別しない。マシン台数を
  共有制約としてモデル化する際はモード排他を考慮すること。

### Invariants / identity keys
- 電池はどのレシピの入力にも現れない（全38レシピ確認済）。これが「EXTERNAL_MAP の電池
  = 無償の発電在庫」を需要相殺経路と二重計上せずに済ませている前提。電池を入力に持つ
  レシピを scanner が取り込んだら extBatGenFromMap の扱いを再設計すること。
- `recipeForItem` の曖昧性タイブレークは「アイテム名で始まる r.name（本流）を優先」。
  カード見出し由来の名前（壌晶廃液生産）と旧命名（=出力品名）の両時代で成立する。現データで
  複数レシピが同名 output を持つのは `壌晶廃液`（本流と不活性壌晶還元）のみ。
- buildLP の Pconst は転送電池の発電で負になり得るが clamp しない（regime 0 の制約対が
  余剰電力ケースを表す）。

### Invariants / identity keys (scanner)
- アイテム名の系譜は 採掘「◯◯鉱物」→ 精錬「◯◯塊」→ 粉砕「◯◯粉末」。scanner 登録時の
  名前は recipes.json の既存名に必ず合わせる（「赤銅鉱石」のような新名の即興命名が
  データ分裂の温床）。
- レシピ名はカード見出し(「◯◯生産」「◯◯(充填)」)のOCR結果を候補（既存タイトル型名 +
  主出力名+接尾辞）へファジースナップして決める。OCR生文字列をそのまま名前キーにしない
  （類似字誤読: 赤銅→赤間 等で名前が分裂する）。旧命名（レシピ名=主出力名）のエントリは
  同一出力のタイトル名レシピ保存時に自動置換され、各画面の再スキャンで順次移行する。
- スナップ候補は**主出力が同じレシピの名前に限定**する。出力違いの既存名を候補に入れると
  段位違いの近似タイトル（缶詰I生産/缶詰II生産、OCRはII→川と誤読）が誤吸着して
  別レシピを上書きする (#3 調査時に発見)。
- ゲーム内には同名タイトル・同一出力・入力違いの代替レシピが実在する（結晶外殻生産 ×2）。
  scanner は入力署名の違いを検出して「タイトル（主入力名）」で対称に一意化する。完全同名の
  重複エントリを recipes.json に入れてはいけない（obtainable の visited 等がレシピ名を
  同一性キーに使う）。代替レシピの地域別選択は #3。
- 環境条件（env）はレシピ同一性の一部。ガスモードには同名・同入力名で env と数量だけが
  違う対が実在（緋銅ガス精製 ×2）し、入力署名（名前ベース・数量不問）では分離できない —
  env 付きレシピは常に「タイトル（環境名）」+ env フィールドで一意化する。
- ガス散布機の環境構築コストは data/environments.json（name/machine/gas/minRate）。
  minRate は環境維持の最低供給レート[単位/分]で、レシピ qty（クラフト量×60/秒）と意味論が
  違うため recipes.json に入れない。取込は `cli.py envscan`。

### Environment quirks
- recipes.json は scanner 自動生成。手で編集しない。
- `scanner/` と `data/recipes/` は gitignore 済み — scanner のコード修正はリポジトリに
  乗らない。tracked なのはマージ出力の data/recipes.json のみ。
- 日本語OCRは `scanner/tessdata/jpn.traineddata`（tessdata_best をユーザ領域配置）。
  システムの tesseract には jpn が入っていない（sudo 不可のため apt 導入できない）。
- 谷地はバッテリー生産レシピ未登録のため電力がまかなえず、ベースライン「解なし」が
  正しい創発結果（scanner でレシピ取込後に自動で解ける）。
