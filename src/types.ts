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

/** キャラごとの技候補（サイドドロワーの「技」選択欄に並ぶ）。unique/special/superArtのみで使用 */
export type MoveDefinition = {
  id: string;
  name: string; // 技名（例: "波動拳"、SAの場合はキャラ固有のSA名）
  category: MoveCategory;
  // 必殺技(special)のみで使う、木のノード上に表示する短い呼び名。未設定なら name をそのまま使う
  shortName?: string;
  /**
   * 必殺技(special)のみで使う。ストック・同時押しなど、強度だけでは技の状態を表現しきれない
   * 技かどうか。falsyな技は強度選択だけで従来通り確定する（デフォルトの見た目・手数は変わらない）
   */
  hasSpecialVariant?: boolean;
  /**
   * hasSpecialVariantがtrueの技のみで使う。強度を選んだ後にさらに選ばせる特殊性能の選択肢一覧
   * （例: イングリッドの「ビーム」で["ビームレベル2","ビームレベル3","ビームレベル4"]、
   * 同時押し系の技で["AB同時押し","BC同時押し","AC同時押し"]）
   */
  specialVariantOptions?: string[];
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
export type ComboBranchStats = {
  damage: number | null;
  dGaugeChange: number | null; // 回収+ / 消費-
  saGaugeGain: number | null;

  damageRating: Rating5 | null;
  dGaugeRating: Rating5 | null;
  saGaugeRating: Rating5 | null;
  overallRating: Rating5 | null;

  plusFrame: number | null; // 具体的なフレーム数（例: +3）
  isThrowRange: boolean;
  canOkizeme: boolean;
};

// ── ノード（技） ──────────────────────────────────────────────────────────

export type MoveNode = {
  id: string;
  moveName: string; // 技名（技マスタから選んだ時点のスナップショット）。ドロワー・見出し・エクスポート等で使う正式名称
  // 木のノード上の表示用（必殺技の呼び名選択時のスナップショット）。未設定なら moveName を使う
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
};

// ── 技ごとの基礎数値 ──────────────────────────────────────────────────────

/** 技1ヒットぶんの基礎数値 */
export type MoveHitStats = {
  damage: number | null;
  dGaugeGain: number | null;  // ヒット時のDゲージ回収量
  saGaugeGain: number | null; // SAゲージ回収量
  dGaugeChip: number | null;  // ガードされた時に相手のDゲージを削る量
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
