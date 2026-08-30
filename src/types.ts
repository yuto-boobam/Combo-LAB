// src/types.ts
// Combo-LAB のデータモデル。
//
// 木構造について: 1キャラクターは複数の独立したコンボ木（森）を持つ。
// 「小P始動」「中K始動」のように始動技ごとに別の木があり、ComboTree がその1本を表す。
// MoveNode は src/lib/tree の TreeNodeLike（{id, children}）を満たす。

/** 5段階評価 */
export type Rating5 = 1 | 2 | 3 | 4 | 5;

// ── 技マスタ ─────────────────────────────────────────────────────────────

/**
 * 技のカテゴリ。
 * normal(通常技) / air(空中技) / system(共通システム) は全キャラ共通の固定リストで、
 * Character.moveList には保存しない（src/data/commonMoves.ts を参照）。
 * unique(特殊技) / special(必殺技) / superArt(SA) はキャラ固有のため、
 * ユーザーが手入力で登録したものを Character.moveList に保存し、以後ボタンとして再利用する。
 */
export type MoveCategory = 'normal' | 'air' | 'unique' | 'special' | 'superArt' | 'system';

/** 必殺技の強度4種 */
export type MoveStrength = '弱' | '中' | '強' | 'OD';

/** 必殺技の強度モード（MoveDefinition.strengthMode参照）。未設定なら弱/中/強/ODの4強度 */
export type SpecialMoveStrengthMode = 'none' | 'normalOd' | 'level';

/** キャラごとの技候補（サイドドロワーの「技」選択欄に並ぶ）。unique/special/superArtのみで使用 */
export type MoveDefinition = {
  id: string;
  name: string; // 技名（例: "波動拳"、SAの場合はキャラ固有のSA名）
  category: MoveCategory;
  // 必殺技(special)のみで使う、木のノード上に表示する短い呼び名。未設定なら name をそのまま使う
  shortName?: string;
  /**
   * 必殺技(special)・SA(superArt)で使う。ストック・同時押し・ホールドLvなど、強度（必殺技）や
   * 名前選択（SA）だけでは技の状態を表現しきれない技かどうか。falsyな技は従来通り確定する
   * （デフォルトの見た目・手数は変わらない）
   */
  hasSpecialVariant?: boolean;
  /**
   * SA(superArt)のみで使う。技名選択時にさらに選ばせる特殊性能の選択肢一覧
   * （例: SAのホールドLvで["Lv2","Lv3"]）。必殺技(special)は強度ごとに選択肢が異なりうる
   * ため、代わりに specialVariantsByStrength を使う
   */
  specialVariantOptions?: string[];
  /**
   * 必殺技(special)のみで使う。強度ごとに使える特殊性能の選択肢一覧
   * （例: イングリッドのサンフレアで { 弱: ["チャージ"], 中: ["Lv.0"], 強: ["Lv.1","Lv.2"],
   * OD: ["Lv.1","Lv.2"] }）。キーが存在しない・空配列の強度は特殊性能なしの
   * プレーンな `${強度}${技名}` のまま確定する
   */
  specialVariantsByStrength?: Partial<Record<MoveStrength, string[]>>;
  /**
   * SA(superArt)・特殊性能ありの技のみで使う。trueなら「この技は常にコンボの締め（末端）で
   * 使う」という前提とし、特殊性能を選んだ時にノード名へ焼き込まず（技名は素のまま、
   * 例:「SA1」）、代わりに末端ノードの`ComboBranchStats.finishingSpecialVariant`へ直接
   * セットする（MoveNamePicker/SideDrawerPanel参照）。falseまたは未設定なら従来通り
   * `${技名}(${特殊性能})`をノード名に焼き込む（この後さらに技を繋げる可能性がある技向け）
   */
  finishesComboOnSelect?: boolean;
  /**
   * 必殺技(special)のみで使う。未設定なら従来通り弱/中/強/ODの4強度から選ばせる
   * （`specialVariantsByStrength`を使う強度ベースの選択のまま）。
   * - 'none': 強度そのものが存在しない技（例: 電刃錬気のような単発の構え技）。
   *   技名は強度を挟まず`${技名}`のまま即確定する
   * - 'normalOd': 強度が「無印」と「OD」の2つしかない技。`${技名}`と`OD${技名}`の
   *   2択だけを出す（弱/中/強の3段階は無い）
   * - 'level': 強度ではなく`specialVariantOptions`のフラットな一覧から直接選ばせる
   *   （SA(superArt)と同じ選び方）。技名も`${技名}(${特殊性能})`のように強度を含めずに
   *   確定する（例:「サンフレア(ビーム|Lv. 1)」。イングリッドのビーム系
   *   (チャージ→Lv.0〜3)のように、強度ボタンとLv.が実質無関係で「強度選択」という
   *   手順自体が不要な技向け。旧`hasFlatVariants: true`に相当）
   */
  strengthMode?: SpecialMoveStrengthMode;
};

// ── ノードの属性 ──────────────────────────────────────────────────────────

export type NodeAttributeType =
  | 'hit'              // ヒット
  | 'guard'            // ガード
  | 'whiff'            // 空振り
  | 'situational'      // 状況限（本体色グループのクイック切替用。キャラ限定/位置限定でも同じ本体色になる）
  | 'characterLimited' // キャラ限定
  | 'positionLimited'  // 位置限定
  | 'counter'          // カウンター(CH)
  | 'punishCounter'    // パニッシュカウンター(PC)
  | 'rush'             // ラッシュ
  | 'airHit'           // 空中ヒット
  | 'delay'            // ディレイ
  | 'okizeme'          // 起き攻め
  | 'other';           // その他

/**
 * characterLimited / positionLimited / other は自由記述メモを伴う。
 * それ以外は type だけで意味が完結する。
 */
export type NodeAttribute =
  | { type: 'characterLimited'; note: string }
  | { type: 'positionLimited'; note: string }
  | { type: 'other'; note: string }
  | { type: Exclude<NodeAttributeType, 'characterLimited' | 'positionLimited' | 'other'> };

// ── 枝（コンボ）の統計情報 ──────────────────────────────────────────────────

/**
 * root→leaf の1パス（=1つの枝）に紐づく統計。
 *
 * 入力欄は「葉ノード（子を持たない）」または「ガード」「空振り」のいずれかの属性を持つ
 * ノードにのみ表示する（表示条件は src/components/combo/SideDrawerPanel.tsx の
 * showStatsEditor を参照）。
 */
/** 枝の始動条件（通常/カウンター/パニッシュカウンターは排他）。「SAは基本除外」等、
 * どのカテゴリの技に効くかは技によって異なるため、ここでは条件の記録のみ行う */
export type BranchStartHitCondition = '通常' | 'カウンター' | 'パニカン';

export type ComboBranchStats = {
  damage: number | null;
  dGaugeChange: number | null; // 回収+ / 消費-
  /**
   * この枝で相手のDゲージを削った量。SAのヒットが相手のDゲージを削る仕様
   * （`MoveHitStats.dGaugeChipPunishCounter`、SAに限り「ヒット時」の削り量として扱う）
   * に基づく。ジャストパリィ始動（常にパニッシュカウンター扱い）の場合は自動計算側で
   * 半分にする（実機確認済み。攻撃側自身のDゲージ増減=dGaugeChangeとは独立）
   */
  opponentDGaugeChip: number | null;
  saGaugeGain: number | null;

  damageRating: Rating5 | null;
  dGaugeRating: Rating5 | null;
  saGaugeRating: Rating5 | null;
  /** 相手を画面端まで運べるか・運びやすさの評価（コーナーキャリー） */
  carryRating: Rating5 | null;
  overallRating: Rating5 | null;

  plusFrame: number | null; // 具体的なフレーム数（例: +3）
  /** プラスフレームが地上ヒット/空中ヒットのどちらの当たり方に基づくものかの選択。
   * 技データ側のgroundPlusFrame/airPlusFrameのどちらを参照・表示するかの切り替えに使う。
   * null = 未選択（従来通りplusFrameを自由入力するだけ） */
  plusFrameHitType: 'ground' | 'air' | null;
  isThrowRange: boolean;
  canOkizeme: boolean;

  /**
   * この枝（コンボ、またはグループ化された連携の締め）をお気に入り登録したか。
   * branchStats自体が「葉ノード、またはガード/空振り属性を持つノード」＝コンボや
   * グループの中で一番後ろに来るノードにしか表示されないため、この項目も自然と
   * そこにしか出てこない（ユーザー要望）
   */
  isFavorite: boolean;

  /**
   * この枝が前提とする始動条件のチェック項目。同じコンボでもカウンター始動だと
   * 始動補正が変わりダメージ・ゲージが変わるため、枝を作り直さずに条件だけ記録できるようにする。
   * 現状は記録のみで、この条件によるダメージ・ゲージの自動再計算はまだ実装していない
   * （将来のノード自動計算機能の足掛かり）。
   */
  startHitCondition: BranchStartHitCondition | null;
  isJustParryStart: boolean; // ジャストパリィ始動か
  isRushStart: boolean; // (ドライブ)ラッシュ始動か
  usesCA: boolean; // CA（クリティカルアーツ）を使うコンボか

  /**
   * この枝がSA(superArt、特殊性能あり)で終わる場合に、実際に使った特殊性能（例:「Lv. 1」）。
   * ノード自体は特殊性能を選ばず技名だけ（例:「SA1」）で置いたまま、この枝の終端でどのLv.を
   * 使ったかだけを記録したいケース用（ノード側で既に`SA1(Lv. 1)`のように特殊性能込みで確定
   * している場合や、SAで終わらない枝ではnullのまま）。技データの参照キーは
   * `${末端ノードのmoveName}(${finishingSpecialVariant})`になる
   */
  finishingSpecialVariant: string | null;

  /**
   * この末端ノードの直後にSA(superArt)へ繋いで締める場合、その技名（例:「SA3」）。
   * null = SAに繋がない（このノード自身で終わる）。末端ノード自身はSAではないが、
   * 実際にはSAの直前の技でコンボを終えることも多いため、木にSAのノードを追加しなくても
   * ダメージ・SAゲージ・Dゲージの自動計算にそのSAぶんを合成して反映できるようにする
   * （ユーザー要望。詳細はcomboGaugeCalc.tsのwithFinishingSuperArt参照）。対象は
   * 特殊性能なし(hasSpecialVariantが立っていない)の単純なSAのみ。特殊性能ありのSAで
   * 終わる場合はfinishesComboOnSelect/finishingSpecialVariantの仕組みを使う
   */
  finishingSuperArtName: string | null;

  /**
   * root（始動技）がstartingMoveOptionsを持つ「汎用コンボ」の場合に、この枝で実際に
   * 使った始動技（候補一覧の中の1つ＝1つ以上のmoveNameの並び。ジャンプ攻撃始動のように
   * 2技以上を経由する候補もあるため配列）。null＝未選択（この枝のダメージ・ゲージ
   * 自動計算は行われない。src/utils/comboGaugeCalc.tsのresolvePath参照）。
   * 通常の木（rootが実技）では常にnullのままでよい
   */
  startingMoveNames: string[] | null;
};

// ── ノード（技） ──────────────────────────────────────────────────────────

export type MoveNode = {
  id: string;
  moveName: string; // 技名（技マスタから選んだ時点のスナップショット）。ドロワー・見出し・エクスポート等で使う正式名称
  // 木のノード上の表示用（必殺技の呼び名選択時・SAの特殊性能選択時のスナップショット）。
  // 未設定なら moveName を使う
  displayName?: string;
  attributes: NodeAttribute[];
  specialNote: string; // 「ディレイ~F」のような特殊記入。基本は空文字

  // 葉ノード、またはガード/空振り属性を持つノードにのみ意味を持つ（上記コメント参照）
  branchStats: ComboBranchStats | null;

  createdBy: string;
  createdAt: string;

  children: MoveNode[];

  /**
   * このノードが属する名前付きグループ（Character.namedComboGroups の id）。
   * 同じ groupId が分岐なしで連続するノード列は、木の表示上1個の折りたたみノード
   * （例:「コンボA」）にまとめられる。始動技違いで途中から同じ連携になるコンボを
   * 表現するための機能。詳細は src/lib/tree/groupView.ts を参照
   */
  groupId?: string;

  /**
   * 「OD版はレベル+1相当の性能になる」技（イングリッドのビーム等）で、実際にOD版を使ったか
   * どうか。技データの参照キーは、このノードのmoveNameに含まれるLv.番号+1の登録済みデータを
   * 参照するようになる（登録済みの最大Lv.の場合はそれ以上シフトしない。詳細は
   * src/utils/comboGaugeCalc.ts の calculateOdLevelConstraint / 経路計算参照）。
   * 木構造上のどのノードにも付けられる（末端に限らない。技データベース上、最小Lv.の技は
   * 通常版でしか存在せず、最大Lv.の技はOD版でしか存在しないため、UI側でLv.に応じて選択を
   * 制限する）
   */
  usesOD?: boolean;

  /**
   * 葉ノードでもガード/空振り属性でもないノードにも、任意で「コンボの情報」欄
   * （branchStats・自動計算ダメージ等）を表示・記録できるようにするフラグ。
   * 例: A→B→C→Dの経路で、あえてCで止めて別の行動をするケースを記録したい場合に使う
   * （trueにすると、Cが葉でなくてもコンボの情報欄が出るようになる。SideDrawerPanel参照）。
   * 未設定(false相当)なら従来通り葉ノード/ガード/空振りの時だけ表示する
   */
  recordsBranchStats?: boolean;

  /**
   * このノードの技が複数ヒット技（技データのMoveStats.isMultiHit）の場合に、実際に
   * 何段目が当たったか（1始まりの段番号の一覧）。例: 2段技のうち2段目しか
   * 当たらなかった場合は[2]、4段技のうち2〜3段目だけ当たった場合は[2, 3]を指定する。
   * 未設定または空配列なら全段当たったものとして扱う（従来通り）。ダメージ・Dゲージ・
   * SAゲージの自動計算（src/utils/comboGaugeCalc.ts）はこの段だけを合計に使う
   * （2026-08-28ユーザー指定：1〜最終段を並べて当たった段だけクリックする、
   * というシンプルな選び方にする）
   */
  hitIndices?: number[] | null;

  /**
   * 木のroot（始動技）ノードのみで意味を持つ。「汎用コンボ」＝複数の始動技から同じ続きに
   * つながるコンボをまとめて1本の木で表現するための機能。設定されている場合、このrootは
   * 実技ではなく「中攻撃」のようなラベルのプレースホルダとして扱われ、末端ごとの
   * `branchStats.startingMoveNames`で実際に使った始動技を選ぶまでダメージ・ゲージの
   * 自動計算は行わない（未入力のまま。src/utils/comboGaugeCalc.tsのresolvePath参照）。
   * ここに入るのは候補一覧（UIの選択肢）で、それ自体は計算に使わない。
   *
   * 各候補は「1つ以上のmoveNameから成る連続入力」（例:[['中P'], ['2中P'], ['J強K','強P']]）。
   * ジャンプ攻撃始動のように、汎用コンボの続きに入る前に必ず経由する技が2つ以上ある場合
   * （「J強K→強P→(汎用の続き)」）を表現するため、単一技だけでなく複数技の並びも
   * 1つの候補として登録できる（2026-08-30ユーザー指摘）。
   * 未設定・空配列なら従来通りrootを実技として扱う（後方互換）
   */
  startingMoveOptions?: string[][];
};

// ── 技ごとの基礎数値 ──────────────────────────────────────────────────────

/**
 * 技（の1段）がどこまでキャンセルできるかの分類。MoveStatsPage.tsxで段ごとに
 * ボタンで選ぶ（2026-08-25ユーザー指定の6種）。
 * - 全般: 必殺技・ラッシュ・SAなど何でもキャンセルできる
 * - SAすべて: SAならどれでもキャンセルできる
 * - SA2以上: SA2・SA3（・CA）へキャンセルできる
 * - SA3のみ: SA3（・CA）へのみキャンセルできる
 * - 一部の必殺: 一部の必殺技へのみキャンセルできる（SAは不可）
 * - 不可: キャンセルできない
 */
export type CancelType = '全般' | 'SAすべて' | 'SA2以上' | 'SA3のみ' | '一部の必殺' | '不可';

export const CANCEL_TYPES: CancelType[] = ['全般', 'SAすべて', 'SA2以上', 'SA3のみ', '一部の必殺', '不可'];

/** 1つでもこの段がこのキャンセル種類なら、技全体がSA3(・CA)へキャンセル可能とみなす */
export const SA3_CANCELABLE_TYPES: CancelType[] = ['全般', 'SAすべて', 'SA2以上', 'SA3のみ'];

/** 技1ヒットぶんの基礎数値 */
export type MoveHitStats = {
  damage: number | null;
  modifier: string; // 補正の自由記述（例:「始動補正20%＋コンボ補正20%」）。基本は空文字
  dGaugeGain: number | null;  // ヒット時のDゲージ回復量
  saGaugeGain: number | null; // SAゲージ回収量（SAだけ「消費量」として扱う。MoveStatsPage参照）
  dGaugeChip: number | null;  // ガードされた時に相手のDゲージを削る量
  dGaugeChipPunishCounter: number | null; // パニッシュカウンターでガードされた時に相手のDゲージを削る量（SAだけ「ヒット時」の削り量として扱う。MoveStatsPage参照）
  // コンボ補正で減っても、ダメージがこの割合(%)を下回らないという最低保証(SA3は50%等)。
  // 主にSA用だが型自体は全カテゴリ共通のMoveHitStatsに置く
  minDamageGuaranteePercent: number | null;
  // キャンセルラッシュ中にこの技をヒットさせた時のDゲージ回復量。SA以外は一律0として扱うため、
  // SA技だけ個別の値（SA1/2は0、SA3は通常時と異なる値、等）を登録する。null = 未入力
  dGaugeGainDuringRush: number | null;

  // 有利フレーム（地上ヒット時）の自由記述。単一の値（例:「+3」）だけでなく、技表通り幅を
  // 持たせた表記（例:「+2~+4」）もそのまま入力できるようにmodifierと同じ文字列型にしている。
  // 末端ノード側で締めの技に応じてこの範囲を表示する機能の元データになる想定。基本は空文字
  groundPlusFrame: string;
  // 有利フレーム（空中ヒット時）の自由記述。地上ヒットとは別に登録できるよう分けている
  airPlusFrame: string;

  /**
   * この段（複数ヒット技なら段ごと、単発技ならhits[0]）の時点でどんなキャンセルができるか。
   * 2段技で両方の段からキャンセルできる、といったケースがあるため、hits配列の各段が
   * 独立に持てるようにしている（MoveStatsPage.tsxで段ごとに編集する）。
   * null = 未設定（不可と同じ扱い）。
   *
   * 「全般」「SAすべて」「SA2以上」「SA3のみ」のいずれかが選ばれている段が1つでもあれば、
   * この技はSA3(・CA)へキャンセル可能とみなし、MoveStats.cancelableSuperArtNamesへ
   * 自動的に反映する（末端ノードの「SAで締める」機能はSA3のみを対象とする運用のため、
   * 個別にSA名を選ばせるUIは廃止し、この段階的なキャンセル種類から自動導出する。
   * 2026-08-26ユーザー指定）
   */
  cancelType: CancelType | null;
};

/**
 * 技1つぶんの基礎数値（キャラごとに異なる）。将来的な自動ダメージ・ゲージ計算の
 * 足掛かりとして、まずは技マスタとは別に手入力させる。
 *
 * hitsは常に「1段目から順」の配列。isMultiHitがfalseの技は必ず1要素（技全体の数値）。
 * trueの技はヒット数ぶんの要素を持ち、コンボのノード側で「何段目から何段目まで当たったか」
 * を選ぶことで、そのノードのダメージ・ゲージ回収量を hits の該当区間の合計から自動計算できる
 * （ノード側の選択UIは別途実装。技が同じでも当たった段数はコンボごとに変わるため）。
 */
export type MoveStats = {
  isMultiHit: boolean;
  hits: MoveHitStats[];
  /**
   * この技からキャンセル可能なSA(superArt)の名前一覧（例:["SA3"]）。末端ノードの
   * 「コンボの情報」欄にある「SAで締める」選択肢は、このノードで実際に使っている技が
   * 対象のSAへキャンセル可能な場合だけ選べるようにする（実機の技によって当然キャンセル
   * 先が異なるため。技表を見ながらここで技ごとに登録する）。対象は特殊性能なしの単純な
   * SAのみ（finishingSuperArtNameと同じ制約。詳細はcomboGaugeCalc.tsとMoveStatsPage.tsx参照）
   */
  cancelableSuperArtNames: string[];
  /**
   * trueの場合、複数ヒット(isMultiHit)の各段は「同じ技が複数回ヒットしているだけ」として
   * 扱い、ダメージ補正の標準テーブルの段を1段目以降は消費しない（1段目と同じ%をそのまま
   * 使う。例: 強Kの1段目・2段目）。ターゲットコンボ（「4中K->強P」のように別々の技を
   * 繋いだもの）は、そのつなぎの各技が本当に別々にテーブルを消費するのが実機通りのため、
   * この項目に関わらず対象外（この技はisMultiHitではなくノードの技名側で表現する）。
   * 未設定(false相当)なら従来通り段ごとに個別消費する
   */
  sharesModifierAcrossHits: boolean;
};

/**
 * 技データベース。Characterからは独立させ、全キャラぶんを1つのオブジェクトとして
 * 個別にエクスポート・インポートできるようにする（コンボの保存とは別ファイル運用）。
 * キーはキャラID→技名。技名は木のノード上で使われるのと同じ文字列
 * （必殺技は「弱波動拳」のように強度込みの文字列。src/components/combo/MoveNamePicker.tsx 参照）。
 */
export type MoveStatsDatabase = Record<string, Record<string, MoveStats>>;

// ── コンボ木・キャラクター ──────────────────────────────────────────────────

/** 1本のコンボ木（森の中の1本） */
export type ComboTree = {
  id: string;
  label: string; // 「小P始動」のような木の名前
  root: MoveNode;
};

/** キャラごとの「名前付きグループ」カタログ（MoveNode.groupId が参照する） */
export type NamedComboGroup = {
  id: string;
  name: string;
};

export type Character = {
  id: string;
  name: string;
  // 未設定の間はキャラ選択画面で name をそのままアイコン代わりに表示する
  imageUrl: string | null;
  moveList: MoveDefinition[];
  comboTrees: ComboTree[];
  namedComboGroups: NamedComboGroup[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};
