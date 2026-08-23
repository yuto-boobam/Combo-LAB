// src/store.ts

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@supabase/supabase-js';
import type {
  Character,
  ComboBranchStats,
  ComboTree,
  MoveCategory,
  MoveDefinition,
  MoveHitStats,
  MoveNode,
  MoveStats,
  MoveStatsDatabase,
  MoveStrength,
  NamedComboGroup,
  NodeAttribute,
} from './types';
import { supabase } from './utils/supabaseClient';
import {
  createInitialCharacterRoster,
  createDefaultSuperArtMoves,
  createDefaultCriticalArtMove,
} from './data/characterRoster';
import { MOVE_STATS_SEED } from './data/moveStatsSeed';
import { canEditMoveStatsLocally } from './utils/localEditAccess';
import { SHOWCASE_CHARACTERS } from './data/comboShowcase';
import { findNode, buildParentMap, collectGroupChain } from './lib/tree';
import { findNodeInComboTrees } from './utils/comboTreeSearch';
import { collectChain, findMatchingChains } from './utils/chainMatch';

/**
 * 保存済みキャラデータを現行スキーマに合わせて補完する（読み込み時の移行措置）。
 * - SA1〜3の初期枠: この機能の実装前に保存されたキャラには入っていない
 * - namedComboGroups: グループ化機能の実装前に保存されたキャラには存在しない
 */
function migrateLegacyCharacter(character: Character): Character {
  const hasSuperArtMove = character.moveList.some((move) => move.category === 'superArt');
  // CAは既存キャラのSA1〜3が揃った後に追加された枠なので、SA自体は揃っていても
  // CAだけ欠けているケースを別途補完する
  const hasCriticalArtMove = character.moveList.some(
    (move) => move.category === 'superArt' && move.name === 'CA',
  );

  let moveList = character.moveList;
  if (!hasSuperArtMove) {
    moveList = [...moveList, ...createDefaultSuperArtMoves()];
  } else if (!hasCriticalArtMove) {
    moveList = [...moveList, createDefaultCriticalArtMove()];
  }

  return {
    ...character,
    moveList,
    namedComboGroups: Array.isArray(character.namedComboGroups) ? character.namedComboGroups : [],
  };
}

// ── ヘルパー関数 ────────────────────────────────────────────────────────────

const VALID_MOVE_CATEGORIES: MoveCategory[] = [
  'normal',
  'air',
  'unique',
  'special',
  'superArt',
  'system',
];

const VALID_MOVE_STRENGTHS: MoveStrength[] = ['弱', '中', '強', 'OD'];

/** インポートしたJSONの1ノード分を、現行スキーマに合わせて正規化する（壊れたファイルでも落ちないようにする） */
function normalizeMoveNode(node: Partial<MoveNode>): MoveNode {
  return {
    id: typeof node.id === 'string' && node.id ? node.id : makeId(),
    moveName: typeof node.moveName === 'string' ? node.moveName : '（技名未設定）',
    displayName: typeof node.displayName === 'string' ? node.displayName : undefined,
    attributes: Array.isArray(node.attributes) ? (node.attributes as NodeAttribute[]) : [],
    specialNote: typeof node.specialNote === 'string' ? node.specialNote : '',
    branchStats: node.branchStats ?? null,
    createdBy: typeof node.createdBy === 'string' ? node.createdBy : '',
    createdAt: typeof node.createdAt === 'string' ? node.createdAt : new Date().toISOString(),
    children: Array.isArray(node.children)
      ? node.children.map((child) => normalizeMoveNode(child as Partial<MoveNode>))
      : [],
    groupId: typeof node.groupId === 'string' && node.groupId ? node.groupId : undefined,
    usesOD: node.usesOD === true ? true : undefined,
    recordsBranchStats: node.recordsBranchStats === true ? true : undefined,
  };
}

function normalizeComboTree(tree: Partial<ComboTree>): ComboTree | null {
  if (!tree.root) return null;

  return {
    id: typeof tree.id === 'string' && tree.id ? tree.id : makeId(),
    label: typeof tree.label === 'string' ? tree.label : '無題の木',
    root: normalizeMoveNode(tree.root as Partial<MoveNode>),
  };
}

function normalizeMoveDefinition(move: Partial<MoveDefinition>): MoveDefinition | null {
  if (typeof move.name !== 'string' || !move.name) return null;

  const category = VALID_MOVE_CATEGORIES.includes(move.category as MoveCategory)
    ? (move.category as MoveCategory)
    : 'unique';

  const specialVariantOptions = Array.isArray(move.specialVariantOptions)
    ? move.specialVariantOptions.filter((option): option is string => typeof option === 'string')
    : [];

  const specialVariantsByStrength: Partial<Record<MoveStrength, string[]>> = {};
  if (move.specialVariantsByStrength && typeof move.specialVariantsByStrength === 'object') {
    for (const strength of VALID_MOVE_STRENGTHS) {
      const options = (move.specialVariantsByStrength as Record<string, unknown>)[strength];
      if (!Array.isArray(options)) continue;
      const filtered = options.filter((option): option is string => typeof option === 'string');
      if (filtered.length > 0) specialVariantsByStrength[strength] = filtered;
    }
  }

  return {
    id: typeof move.id === 'string' && move.id ? move.id : makeId(),
    name: move.name,
    category,
    shortName: typeof move.shortName === 'string' && move.shortName ? move.shortName : undefined,
    hasSpecialVariant: move.hasSpecialVariant === true ? true : undefined,
    specialVariantOptions: specialVariantOptions.length > 0 ? specialVariantOptions : undefined,
    specialVariantsByStrength:
      Object.keys(specialVariantsByStrength).length > 0 ? specialVariantsByStrength : undefined,
    finishesComboOnSelect: move.finishesComboOnSelect === true ? true : undefined,
    hasFlatVariants: move.hasFlatVariants === true ? true : undefined,
  };
}

function normalizeNamedComboGroup(group: Partial<NamedComboGroup>): NamedComboGroup | null {
  if (typeof group.name !== 'string' || !group.name) return null;

  return {
    id: typeof group.id === 'string' && group.id ? group.id : makeId(),
    name: group.name,
  };
}

const toNullableNumber = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null);

function normalizeMoveHitStats(value: unknown): MoveHitStats {
  const s = (value && typeof value === 'object' ? value : {}) as Partial<MoveHitStats>;
  return {
    damage: toNullableNumber(s.damage),
    modifier: typeof s.modifier === 'string' ? s.modifier : '',
    dGaugeGain: toNullableNumber(s.dGaugeGain),
    saGaugeGain: toNullableNumber(s.saGaugeGain),
    dGaugeChip: toNullableNumber(s.dGaugeChip),
    dGaugeChipPunishCounter: toNullableNumber(s.dGaugeChipPunishCounter),
    minDamageGuaranteePercent: toNullableNumber(s.minDamageGuaranteePercent),
    dGaugeGainDuringRush: toNullableNumber(s.dGaugeGainDuringRush),
    groundPlusFrame: typeof s.groundPlusFrame === 'string' ? s.groundPlusFrame : '',
    airPlusFrame: typeof s.airPlusFrame === 'string' ? s.airPlusFrame : '',
  };
}

function normalizeMoveStatsEntry(value: unknown): MoveStats {
  const s = (value && typeof value === 'object' ? value : {}) as Partial<MoveStats>;
  const hits = Array.isArray(s.hits) ? s.hits.map(normalizeMoveHitStats) : [];
  return {
    isMultiHit: s.isMultiHit === true,
    hits: hits.length > 0 ? hits : [normalizeMoveHitStats(undefined)],
    cancelableSuperArtNames: Array.isArray(s.cancelableSuperArtNames)
      ? s.cancelableSuperArtNames.filter((name): name is string => typeof name === 'string')
      : [],
    sharesModifierAcrossHits: s.sharesModifierAcrossHits === true,
  };
}

/** インポートしたJSONの技データベース全体（キャラID→技名→技データ）を正規化する */
function normalizeMoveStatsDatabase(value: unknown): MoveStatsDatabase {
  if (!value || typeof value !== 'object') return {};

  const result: MoveStatsDatabase = {};
  for (const [characterId, moves] of Object.entries(value as Record<string, unknown>)) {
    if (!moves || typeof moves !== 'object') continue;

    const moveEntries: Record<string, MoveStats> = {};
    for (const [moveName, stats] of Object.entries(moves as Record<string, unknown>)) {
      moveEntries[moveName] = normalizeMoveStatsEntry(stats);
    }
    result[characterId] = moveEntries;
  }
  return result;
}

/** インポートしたキャラ1人分を正規化する。壊れている項目は現在の値（fallback）を維持する */
function normalizeImportedCharacter(imported: Partial<Character>, fallback: Character): Character {
  return {
    id: fallback.id,
    name: typeof imported.name === 'string' && imported.name ? imported.name : fallback.name,
    imageUrl: typeof imported.imageUrl === 'string' ? imported.imageUrl : fallback.imageUrl,
    moveList: Array.isArray(imported.moveList)
      ? imported.moveList
          .map((move) => normalizeMoveDefinition(move as Partial<MoveDefinition>))
          .filter((move): move is MoveDefinition => move !== null)
      : fallback.moveList,
    comboTrees: Array.isArray(imported.comboTrees)
      ? imported.comboTrees
          .map((tree) => normalizeComboTree(tree as Partial<ComboTree>))
          .filter((tree): tree is ComboTree => tree !== null)
      : fallback.comboTrees,
    namedComboGroups: Array.isArray(imported.namedComboGroups)
      ? imported.namedComboGroups
          .map((group) => normalizeNamedComboGroup(group as Partial<NamedComboGroup>))
          .filter((group): group is NamedComboGroup => group !== null)
      : fallback.namedComboGroups,
    createdBy: typeof imported.createdBy === 'string' ? imported.createdBy : fallback.createdBy,
    createdAt: typeof imported.createdAt === 'string' ? imported.createdAt : fallback.createdAt,
    updatedAt: new Date().toISOString(),
  };
}

const makeId = (): string =>
  Date.now().toString(36) + Math.random().toString(36).slice(2);

function makeMoveNode(
  moveName: string,
  attributes: NodeAttribute[],
  createdBy: string,
  displayName?: string,
): MoveNode {
  return {
    id: makeId(),
    moveName: moveName.trim() || '（技名未設定）',
    displayName: displayName?.trim() || undefined,
    attributes,
    specialNote: '',
    branchStats: null,
    createdBy,
    createdAt: new Date().toISOString(),
    children: [],
  };
}

// ── 木構造操作ヘルパー（MoveNode版。Rootedのstore.tsと同じ考え方） ────────────

function mapMoveNode(
  node: MoveNode,
  targetId: string,
  fn: (n: MoveNode) => MoveNode,
): MoveNode {
  if (node.id === targetId) return fn(node);

  return {
    ...node,
    children: node.children.map((child) => mapMoveNode(child, targetId, fn)),
  };
}

function findMoveNodeParent(
  node: MoveNode,
  targetId: string,
): { parent: MoveNode; index: number } | null {
  const index = node.children.findIndex((child) => child.id === targetId);
  if (index !== -1) return { parent: node, index };

  for (const child of node.children) {
    const result = findMoveNodeParent(child, targetId);
    if (result) return result;
  }

  return null;
}

function removeMoveNode(root: MoveNode, targetId: string): MoveNode {
  return {
    ...root,
    children: root.children
      .filter((child) => child.id !== targetId)
      .map((child) => removeMoveNode(child, targetId)),
  };
}

/** characterId・treeId を辿って、その木の root だけを updater で差し替える */
function updateComboTreeRoot(
  characters: Character[],
  characterId: string,
  treeId: string,
  updater: (root: MoveNode) => MoveNode,
): Character[] {
  return characters.map((character) => {
    if (character.id !== characterId) return character;

    return {
      ...character,
      updatedAt: new Date().toISOString(),
      comboTrees: character.comboTrees.map((tree) =>
        tree.id === treeId ? { ...tree, root: updater(tree.root) } : tree,
      ),
    };
  });
}

// ── Zustand ストア型 ───────────────────────────────────────────────────────

export type AppState = {
  user: User | null;
  setUser: (user: User | null) => void;

  // ゲストモード（Supabase認証を経由しないお試しログイン）
  isGuest: boolean;
  enterGuestMode: () => void;
  logout: () => Promise<void>;

  nickname: string;
  setNickname: (nickname: string) => Promise<void>;

  // 配色テーマ（ライト/ダーク）
  theme: 'dark' | 'light';
  toggleTheme: () => void;

  // パッチノートモーダル
  isPatchNotesModalOpen: boolean;
  selectedPatchNoteDate: string | null;
  openPatchNotesModal: (date?: string) => void;
  closePatchNotesModal: () => void;
  setSelectedPatchNoteDate: (date: string | null) => void;

  // キャラクター選択（31枠の固定ロースター。comboTrees等は永続化されユーザーが育てていく）
  characters: Character[];
  selectedCharacterId: string | null;
  selectCharacter: (characterId: string) => void;
  goToCharacterSelect: () => void;

  /** バックアップJSONからのインポート。id一致するキャラのみ上書きし、固定31枠の構造は保つ */
  restoreCharacters: (imported: Partial<Character>[]) => void;

  // 技データ編集画面（技ごとのダメージ・ゲージ数値。頻繁に変える想定がないため、
  // メインのコンボ編集画面とは別に、キャラ選択カードの小さなボタンからのみ入る）。
  // Characterとは独立した技データベース（moveStatsDatabase）として持ち、コンボの
  // 保存とは別に「全キャラぶんまとめて1ファイル」でエクスポート・インポートできるようにする
  moveStatsCharacterId: string | null;
  openMoveStatsEditor: (characterId: string) => void;
  closeMoveStatsEditor: () => void;

  moveStatsDatabase: MoveStatsDatabase;
  setMoveStats: (characterId: string, moveName: string, stats: MoveStats) => void;
  /** 技データベース全体をJSONから読み込み、丸ごと置き換える */
  restoreMoveStatsDatabase: (imported: unknown) => void;

  // 技マスタ（特殊技・必殺技・SAはキャラ固有。ユーザーが登録したものを再利用できる）
  addMoveDefinition: (
    characterId: string,
    category: MoveCategory,
    name: string,
    // 必殺技のみで使う、木のノード上に表示する短い呼び名
    shortName?: string,
  ) => string;
  deleteMoveDefinition: (characterId: string, moveId: string) => void;
  renameMoveDefinition: (characterId: string, moveId: string, name: string) => void;
  /** 必殺技の呼び名（ノード表示用の短い名前）を編集する */
  setMoveDefinitionShortName: (characterId: string, moveId: string, shortName: string) => void;
  /** 必殺技が「特殊性能」（ストック・同時押しなど）を持つかどうかを編集する */
  setMoveDefinitionHasSpecialVariant: (
    characterId: string,
    moveId: string,
    hasSpecialVariant: boolean,
  ) => void;
  /** SAの特殊性能の選択肢一覧を編集する（空なら特殊性能の選択肢なしに戻す） */
  setMoveDefinitionSpecialVariantOptions: (
    characterId: string,
    moveId: string,
    options: string[],
  ) => void;
  /** 必殺技の、指定した強度で使える特殊性能の選択肢一覧を編集する（空ならその強度は特殊性能なしに戻す） */
  setMoveDefinitionSpecialVariantsForStrength: (
    characterId: string,
    moveId: string,
    strength: MoveStrength,
    options: string[],
  ) => void;
  /**
   * SAが「常にコンボの締めで使う技」かどうかを編集する。trueなら特殊性能選択時に
   * ノード名へ焼き込まず、末端ノードのbranchStats側で選ばせる方式になる
   */
  setMoveDefinitionFinishesComboOnSelect: (
    characterId: string,
    moveId: string,
    finishesComboOnSelect: boolean,
  ) => void;
  /**
   * 必殺技が「強度に依存しないフラットな選択肢」かどうかを編集する。trueなら
   * specialVariantOptionsから直接選ばせ、技名にも強度を含めない
   */
  setMoveDefinitionHasFlatVariants: (
    characterId: string,
    moveId: string,
    hasFlatVariants: boolean,
  ) => void;

  // コンボ木（1キャラにつき複数持てる。始動技ごとに1本）
  createComboTree: (characterId: string, label: string, displayName?: string) => string;
  deleteComboTree: (characterId: string, treeId: string) => void;
  /** 木の並び順を1つ前/後ろに入れ替える（現在は追加順のみのため、手動で並び替えられるようにする） */
  moveComboTree: (characterId: string, treeId: string, direction: 'up' | 'down') => void;

  // ノード（技）操作
  selectedNodeId: string | null;
  selectNode: (nodeId: string | null) => void;

  collapsedNodeIds: string[];
  toggleNodeExpanded: (nodeId: string) => void;

  addChildNode: (
    characterId: string,
    treeId: string,
    parentId: string,
    moveName: string,
    attributes?: NodeAttribute[],
    displayName?: string,
  ) => string;

  deleteNode: (characterId: string, treeId: string, nodeId: string) => void;

  moveNode: (
    characterId: string,
    treeId: string,
    nodeId: string,
    targetParentId: string,
    toIndex?: number,
  ) => void;

  updateNodeMoveName: (
    characterId: string,
    treeId: string,
    nodeId: string,
    moveName: string,
    displayName?: string,
  ) => void;

  updateNodeSpecialNote: (
    characterId: string,
    treeId: string,
    nodeId: string,
    specialNote: string,
  ) => void;

  setNodeAttributes: (
    characterId: string,
    treeId: string,
    nodeId: string,
    attributes: NodeAttribute[],
  ) => void;

  setNodeBranchStats: (
    characterId: string,
    treeId: string,
    nodeId: string,
    branchStats: ComboBranchStats | null,
  ) => void;

  /** 「OD版はレベル+1相当の性能になる」技（イングリッドのビーム等）で、OD版を使ったかどうか */
  setNodeUsesOD: (characterId: string, treeId: string, nodeId: string, usesOD: boolean) => void;

  /** 葉ノードでなくても「コンボの情報」欄を表示・記録できるようにするフラグ（あえて途中で止めるケース用） */
  setNodeRecordsBranchStats: (
    characterId: string,
    treeId: string,
    nodeId: string,
    recordsBranchStats: boolean,
  ) => void;

  // ──「枝を選んでまとめてコピー」機能 ─────────────────────────────────
  // コピーモード: あるノード（起点）を選び、そこから続く枝（子孫ごと）を
  // 好きな数だけクリックして選び、まとめてクリップボードにコピーする。
  // 起点の外側のノードは選択対象にしない（UI側で候補を起点の子孫に絞る）。
  copyModeAnchorId: string | null;
  copySelectedIds: string[];
  startCopyMode: (nodeId: string) => void;
  toggleCopySelection: (nodeId: string) => void;
  cancelCopyMode: () => void;
  /** 選択中の枝をクリップボードに複製して確定し、コピーモードを終了する */
  confirmCopy: (characterId: string) => void;

  /** コピー確定済みの枝（複数可）。貼り付けのたびに新しいIDで複製するので、
   * 何度でも別の場所へ貼り付けられる */
  clipboard: MoveNode[] | null;
  clearClipboard: () => void;
  pasteClipboard: (characterId: string, treeId: string, targetNodeId: string) => void;

  // ──「共通区間を名前付きグループとして折りたたむ」機能 ────────────────────
  // グループ化モード: 1つ以上の「枝」（あるノードを起点に、そこから続く一本道＝分岐なしの
  // 区間）をまとめて選び、まとめて同じ名前を付ける。名前を付けた区間は木の表示上、
  // 枝ごとに1個のノードへ折りたためる（表示側の変換は src/lib/tree/groupView.ts）。
  // 起点自身は常に区間に含まれる。
  //
  // groupModeActive: グループ化モード中かどうか（次の枝の起点待ちの間もtrueのまま）
  // groupModeAnchorId/groupSelectedIds: 「今まさに範囲を選んでいる枝」の起点と選択範囲。
  //   起点がnullなのはactive中は「次の枝の起点待ち」を意味する
  // groupModeRuns: 「＋この枝を追加」で確定済みの枝のリスト（起点＋選択範囲のペア）
  groupModeActive: boolean;
  groupModeAnchorId: string | null;
  groupSelectedIds: string[];
  groupModeRuns: { anchorId: string; selectedIds: string[] }[];
  startGroupMode: (nodeId: string) => void;
  /** 次の枝の起点を選ぶ（groupModeRunsはそのまま、今の枝の選択だけリセットする） */
  setGroupModeAnchor: (nodeId: string) => void;
  /** 選択区間（起点は含まない、起点直下からの連続ノード列）を丸ごと置き換える。
   * 一本道のどこまでを含めるかの妥当性はUI側（起点からの一本道）で判断する */
  setGroupSelectedIds: (nodeIds: string[]) => void;
  /** 今編集中の枝をgroupModeRunsへ積み、次の枝の起点待ちに戻す */
  addGroupModeRun: () => void;
  /** 確定済みの枝を1つ取り除く（誤操作の訂正用） */
  removeGroupModeRun: (index: number) => void;
  cancelGroupMode: () => void;
  /** 確定済みの枝＋今編集中の枝、すべてに名前を付けて確定する。同名の既存グループがあれば使い回す */
  confirmGroupSelection: (characterId: string, name: string) => void;
  /** 指定ノードを含む「同じgroupIdが連続する区間」全体のグループ化を解除する */
  ungroupNode: (characterId: string, treeId: string, nodeId: string) => void;

  /** 折りたたまれた区間のうち、展開表示中のものの先頭ノードIDの一覧（出現箇所ごとに独立） */
  expandedGroupIds: string[];
  toggleGroupExpanded: (pillId: string) => void;

  // ──「一致箇所への一括反映」機能 ────────────────────────────────
  // パターン選択モード: グループ化モードと同じ操作感で、起点から続く分岐のない一本道を
  // 選んで確定する。確定すると、キャラの全ての木から技名・呼び名が完全一致する一本道を
  // 検索し、一覧（matchedAnchorIds）を表示する。一致箇所の1つを選んで普通に編集した後、
  // 「他にも反映」を押すと、編集前後の差分（境界内の内容変更＋末尾への追加）が
  // 他の一致箇所にも複製される（マッチ判定・境界の考え方は src/utils/chainMatch.ts 参照）。
  matchModeAnchorId: string | null;
  matchSelectedIds: string[];
  startMatchMode: (nodeId: string) => void;
  setMatchSelectedIds: (nodeIds: string[]) => void;
  cancelMatchMode: () => void;

  /** 一致箇所の起点ノードID一覧（元の選択自身も含む）。nullなら検索前 */
  matchedAnchorIds: string[] | null;
  /** 検索時のパターンの長さ（一本道のノード数）。反映時の境界判定に使う */
  matchChainLength: number;
  /** 選択範囲で一致検索を実行し、matchedAnchorIdsを確定してパターン選択モードを終了する。
   * includeAttributesをtrueにすると、属性（カウンター/ガード/空振り等）も完全一致条件に加える */
  confirmMatchSearch: (characterId: string, includeAttributes: boolean) => void;
  /** 一致箇所の一覧を破棄して機能全体を終了する */
  clearMatchResults: () => void;

  /** 一致箇所の一覧から選んで編集を始めた瞬間のディープコピー（変更前プレビュー・差分計算用） */
  matchEditBeforeSnapshot: MoveNode | null;
  /** 一致箇所の一覧からノードを選ぶ（選択状態にし、編集前スナップショットを取る） */
  startEditingMatch: (nodeId: string) => void;
  /** 選択中ノードの編集前後の差分を、他の一致箇所すべてに反映する。完了後は一覧ごと終了する */
  propagateMatchChanges: (characterId: string) => void;

  // ── 一致箇所を丸ごと置換 ──────────────────────────────────────────────
  // matchedAnchorIdsが確定している間、置換後にしたい内容の起点ノードを選んで
  // startReplaceSelectionを呼ぶと、一本道クリック選択モードになる（matchModeAnchorIdと同じ操作感）。
  // confirmReplaceSelectionで確定した内容(replacementChainIds)を、propagateReplaceChangesで
  // 置換元以外の一致箇所すべてに複製する。各箇所が元々持っていた「置換範囲より下の続き」は保持する。
  replaceModeAnchorId: string | null;
  replaceSelectedIds: string[];
  startReplaceSelection: (nodeId: string) => void;
  setReplaceSelectedIds: (nodeIds: string[]) => void;
  cancelReplaceSelection: () => void;

  /** 選択範囲を置換内容として確定する（検索はせず、選択モードを終了するだけ） */
  confirmReplaceSelection: () => void;
  /** 確定済みの置換内容の起点ノードID一覧。nullなら未確定 */
  replacementChainIds: string[] | null;
  /** replacementChainIdsの内容を、matchedAnchorIdsのうち置換元以外の全箇所に複製する。
   * 完了後は一致箇所の一覧ごと終了する */
  propagateReplaceChanges: (characterId: string) => void;
};

// ── ストア本体 ─────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      user: null,

      setUser: (user) => {
        const nickname = (user?.user_metadata?.nickname as string) ?? '';
        set({ user, nickname });
      },

      isGuest: false,

      enterGuestMode: () => {
        set({ isGuest: true, user: null, nickname: 'ゲスト' });
      },

      logout: async () => {
        if (get().isGuest) {
          set({ isGuest: false, user: null, nickname: '' });
          return;
        }
        await supabase.auth.signOut();
      },

      nickname: '',

      setNickname: async (nickname) => {
        if (get().isGuest) {
          set({ nickname });
          return;
        }

        const { error } = await supabase.auth.updateUser({
          data: { nickname },
        });

        if (error) {
          console.error('ニックネームの更新に失敗しました:', error.message);
          throw error;
        }

        set({ nickname });
      },

      theme: 'dark',

      toggleTheme: () => {
        set((state) => ({
          theme: state.theme === 'dark' ? 'light' : 'dark',
        }));
      },

      isPatchNotesModalOpen: false,
      selectedPatchNoteDate: null,

      openPatchNotesModal: (date) => {
        set({
          isPatchNotesModalOpen: true,
          selectedPatchNoteDate: date ?? null,
        });
      },

      closePatchNotesModal: () => {
        set({ isPatchNotesModalOpen: false });
      },

      setSelectedPatchNoteDate: (date) => {
        set({ selectedPatchNoteDate: date });
      },

      // ──── キャラクター選択 ────────────────────────────────────────────

      characters: createInitialCharacterRoster(),
      selectedCharacterId: null,

      selectCharacter: (characterId) => {
        set({ selectedCharacterId: characterId });
      },

      goToCharacterSelect: () => {
        set({ selectedCharacterId: null, selectedNodeId: null });
      },

      restoreCharacters: (imported) => {
        set((state) => ({
          characters: state.characters.map((current) => {
            const match = imported.find((item) => item.id === current.id);
            return match ? normalizeImportedCharacter(match, current) : current;
          }),
        }));
      },

      // ──── 技データ編集画面 ───────────────────────────────────────────

      moveStatsCharacterId: null,

      openMoveStatsEditor: (characterId) => {
        set({ moveStatsCharacterId: characterId });
      },

      closeMoveStatsEditor: () => {
        set({ moveStatsCharacterId: null });
      },

      moveStatsDatabase: MOVE_STATS_SEED,

      setMoveStats: (characterId, moveName, stats) => {
        set((state) => ({
          moveStatsDatabase: {
            ...state.moveStatsDatabase,
            [characterId]: {
              ...state.moveStatsDatabase[characterId],
              [moveName]: stats,
            },
          },
        }));
      },

      restoreMoveStatsDatabase: (imported) => {
        set({ moveStatsDatabase: normalizeMoveStatsDatabase(imported) });
      },

      // ──── 技マスタ ───────────────────────────────────────────────────

      addMoveDefinition: (characterId, category, name, shortName) => {
        const newMove: MoveDefinition = {
          id: makeId(),
          name: name.trim() || '（技名未設定）',
          category,
          shortName: shortName?.trim() || undefined,
        };

        set((state) => ({
          characters: state.characters.map((character) =>
            character.id === characterId
              ? {
                  ...character,
                  moveList: [...character.moveList, newMove],
                  updatedAt: new Date().toISOString(),
                }
              : character,
          ),
        }));

        return newMove.id;
      },

      deleteMoveDefinition: (characterId, moveId) => {
        set((state) => ({
          characters: state.characters.map((character) =>
            character.id === characterId
              ? {
                  ...character,
                  moveList: character.moveList.filter((move) => move.id !== moveId),
                  updatedAt: new Date().toISOString(),
                }
              : character,
          ),
        }));
      },

      renameMoveDefinition: (characterId, moveId, name) => {
        set((state) => ({
          characters: state.characters.map((character) =>
            character.id === characterId
              ? {
                  ...character,
                  moveList: character.moveList.map((move) =>
                    move.id === moveId ? { ...move, name } : move,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : character,
          ),
        }));
      },

      setMoveDefinitionShortName: (characterId, moveId, shortName) => {
        set((state) => ({
          characters: state.characters.map((character) =>
            character.id === characterId
              ? {
                  ...character,
                  moveList: character.moveList.map((move) =>
                    move.id === moveId
                      ? { ...move, shortName: shortName.trim() || undefined }
                      : move,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : character,
          ),
        }));
      },

      setMoveDefinitionHasSpecialVariant: (characterId, moveId, hasSpecialVariant) => {
        set((state) => ({
          characters: state.characters.map((character) =>
            character.id === characterId
              ? {
                  ...character,
                  moveList: character.moveList.map((move) =>
                    move.id === moveId ? { ...move, hasSpecialVariant } : move,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : character,
          ),
        }));
      },

      setMoveDefinitionFinishesComboOnSelect: (characterId, moveId, finishesComboOnSelect) => {
        set((state) => ({
          characters: state.characters.map((character) =>
            character.id === characterId
              ? {
                  ...character,
                  moveList: character.moveList.map((move) =>
                    move.id === moveId ? { ...move, finishesComboOnSelect } : move,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : character,
          ),
        }));
      },

      setMoveDefinitionHasFlatVariants: (characterId, moveId, hasFlatVariants) => {
        set((state) => ({
          characters: state.characters.map((character) =>
            character.id === characterId
              ? {
                  ...character,
                  moveList: character.moveList.map((move) =>
                    move.id === moveId ? { ...move, hasFlatVariants } : move,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : character,
          ),
        }));
      },

      setMoveDefinitionSpecialVariantOptions: (characterId, moveId, options) => {
        set((state) => ({
          characters: state.characters.map((character) =>
            character.id === characterId
              ? {
                  ...character,
                  moveList: character.moveList.map((move) =>
                    move.id === moveId
                      ? { ...move, specialVariantOptions: options.length > 0 ? options : undefined }
                      : move,
                  ),
                  updatedAt: new Date().toISOString(),
                }
              : character,
          ),
        }));
      },

      setMoveDefinitionSpecialVariantsForStrength: (characterId, moveId, strength, options) => {
        set((state) => ({
          characters: state.characters.map((character) =>
            character.id === characterId
              ? {
                  ...character,
                  moveList: character.moveList.map((move) => {
                    if (move.id !== moveId) return move;

                    const nextByStrength = { ...move.specialVariantsByStrength };
                    if (options.length > 0) {
                      nextByStrength[strength] = options;
                    } else {
                      delete nextByStrength[strength];
                    }

                    return {
                      ...move,
                      specialVariantsByStrength:
                        Object.keys(nextByStrength).length > 0 ? nextByStrength : undefined,
                    };
                  }),
                  updatedAt: new Date().toISOString(),
                }
              : character,
          ),
        }));
      },

      // ──── コンボ木 ───────────────────────────────────────────────────

      createComboTree: (characterId, label, displayName) => {
        const { nickname } = get();
        const trimmedLabel = label.trim() || '無題の木';

        const newTree: ComboTree = {
          id: makeId(),
          label: trimmedLabel,
          root: makeMoveNode(trimmedLabel, [], nickname, displayName),
        };

        set((state) => ({
          characters: state.characters.map((character) =>
            character.id === characterId
              ? {
                  ...character,
                  comboTrees: [...character.comboTrees, newTree],
                  updatedAt: new Date().toISOString(),
                }
              : character,
          ),
        }));

        return newTree.id;
      },

      deleteComboTree: (characterId, treeId) => {
        set((state) => {
          const character = state.characters.find((item) => item.id === characterId);
          const deletedTree = character?.comboTrees.find((tree) => tree.id === treeId) ?? null;
          const selectedNodeBelongsToDeletedTree =
            deletedTree !== null &&
            findNodeInComboTrees([deletedTree], state.selectedNodeId) !== null;

          return {
            characters: state.characters.map((character) =>
              character.id === characterId
                ? {
                    ...character,
                    comboTrees: character.comboTrees.filter((tree) => tree.id !== treeId),
                    updatedAt: new Date().toISOString(),
                  }
                : character,
            ),
            selectedNodeId: selectedNodeBelongsToDeletedTree ? null : state.selectedNodeId,
          };
        });
      },

      moveComboTree: (characterId, treeId, direction) => {
        set((state) => ({
          characters: state.characters.map((character) => {
            if (character.id !== characterId) return character;

            const index = character.comboTrees.findIndex((tree) => tree.id === treeId);
            const targetIndex = direction === 'up' ? index - 1 : index + 1;
            if (index === -1 || targetIndex < 0 || targetIndex >= character.comboTrees.length) {
              return character;
            }

            const comboTrees = [...character.comboTrees];
            [comboTrees[index], comboTrees[targetIndex]] = [comboTrees[targetIndex], comboTrees[index]];

            return { ...character, comboTrees, updatedAt: new Date().toISOString() };
          }),
        }));
      },

      // ──── ノード（技）操作 ────────────────────────────────────────────

      selectedNodeId: null,

      selectNode: (nodeId) => {
        set({ selectedNodeId: nodeId });
      },

      collapsedNodeIds: [],

      toggleNodeExpanded: (nodeId) => {
        set((state) => ({
          collapsedNodeIds: state.collapsedNodeIds.includes(nodeId)
            ? state.collapsedNodeIds.filter((id) => id !== nodeId)
            : [...state.collapsedNodeIds, nodeId],
        }));
      },

      addChildNode: (characterId, treeId, parentId, moveName, attributes = [], displayName) => {
        const { nickname } = get();
        const newNode = makeMoveNode(moveName, attributes, nickname, displayName);

        set((state) => ({
          characters: updateComboTreeRoot(state.characters, characterId, treeId, (root) =>
            mapMoveNode(root, parentId, (node) => ({
              ...node,
              children: [...node.children, newNode],
            })),
          ),
        }));

        return newNode.id;
      },

      deleteNode: (characterId, treeId, nodeId) => {
        set((state) => ({
          characters: updateComboTreeRoot(state.characters, characterId, treeId, (root) =>
            root.id === nodeId ? root : removeMoveNode(root, nodeId),
          ),
          selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
        }));
      },

      moveNode: (characterId, treeId, nodeId, targetParentId, toIndex) => {
        set((state) => {
          const character = state.characters.find((item) => item.id === characterId);
          const tree = character?.comboTrees.find((item) => item.id === treeId);
          if (!tree) return state;
          if (tree.root.id === nodeId) return state; // rootは動かせない

          const draggedNode = findNode(tree.root, nodeId);
          if (!draggedNode) return state;

          const isCyclic = (node: MoveNode): boolean => {
            if (node.id === targetParentId) return true;
            return node.children.some(isCyclic);
          };
          if (isCyclic(draggedNode)) return state;

          const targetParent = findNode(tree.root, targetParentId);
          if (!targetParent) return state;

          const draggedParentInfo = findMoveNodeParent(tree.root, nodeId);
          const isSameParent = draggedParentInfo?.parent.id === targetParentId;
          const oldIndex = draggedParentInfo?.index ?? -1;

          let nextRoot = removeMoveNode(tree.root, nodeId);

          nextRoot = mapMoveNode(nextRoot, targetParentId, (node) => {
            const children = [...node.children];

            if (toIndex !== undefined) {
              let insertIndex = toIndex;
              if (isSameParent && oldIndex !== -1 && oldIndex < insertIndex) {
                insertIndex -= 1;
              }
              children.splice(insertIndex, 0, draggedNode);
            } else {
              children.push(draggedNode);
            }

            return { ...node, children };
          });

          return {
            characters: updateComboTreeRoot(state.characters, characterId, treeId, () => nextRoot),
          };
        });
      },

      updateNodeMoveName: (characterId, treeId, nodeId, moveName, displayName) => {
        set((state) => ({
          characters: updateComboTreeRoot(state.characters, characterId, treeId, (root) =>
            mapMoveNode(root, nodeId, (node) => ({
              ...node,
              moveName,
              displayName: displayName?.trim() || undefined,
            })),
          ),
        }));
      },

      updateNodeSpecialNote: (characterId, treeId, nodeId, specialNote) => {
        set((state) => ({
          characters: updateComboTreeRoot(state.characters, characterId, treeId, (root) =>
            mapMoveNode(root, nodeId, (node) => ({ ...node, specialNote })),
          ),
        }));
      },

      setNodeAttributes: (characterId, treeId, nodeId, attributes) => {
        set((state) => ({
          characters: updateComboTreeRoot(state.characters, characterId, treeId, (root) =>
            mapMoveNode(root, nodeId, (node) => ({ ...node, attributes })),
          ),
        }));
      },

      setNodeBranchStats: (characterId, treeId, nodeId, branchStats) => {
        set((state) => ({
          characters: updateComboTreeRoot(state.characters, characterId, treeId, (root) =>
            mapMoveNode(root, nodeId, (node) => ({ ...node, branchStats })),
          ),
        }));
      },

      setNodeUsesOD: (characterId, treeId, nodeId, usesOD) => {
        set((state) => ({
          characters: updateComboTreeRoot(state.characters, characterId, treeId, (root) =>
            mapMoveNode(root, nodeId, (node) => ({ ...node, usesOD: usesOD ? true : undefined })),
          ),
        }));
      },

      setNodeRecordsBranchStats: (characterId, treeId, nodeId, recordsBranchStats) => {
        set((state) => ({
          characters: updateComboTreeRoot(state.characters, characterId, treeId, (root) =>
            mapMoveNode(root, nodeId, (node) => ({
              ...node,
              recordsBranchStats: recordsBranchStats ? true : undefined,
            })),
          ),
        }));
      },

      // ──「枝を選んでまとめてコピー」機能 ────────────────────────────────

      copyModeAnchorId: null,
      copySelectedIds: [],

      startCopyMode: (nodeId) => {
        set({
          copyModeAnchorId: nodeId,
          copySelectedIds: [],
          selectedNodeId: null,
          groupModeActive: false,
          groupModeAnchorId: null,
          groupSelectedIds: [],
          groupModeRuns: [],
          matchModeAnchorId: null,
          matchSelectedIds: [],
          matchedAnchorIds: null,
          matchEditBeforeSnapshot: null,
          replaceModeAnchorId: null,
          replaceSelectedIds: [],
          replacementChainIds: null,
        });
      },

      toggleCopySelection: (nodeId) => {
        set((state) => ({
          copySelectedIds: state.copySelectedIds.includes(nodeId)
            ? state.copySelectedIds.filter((id) => id !== nodeId)
            : [...state.copySelectedIds, nodeId],
        }));
      },

      cancelCopyMode: () => {
        set({ copyModeAnchorId: null, copySelectedIds: [] });
      },

      confirmCopy: (characterId) => {
        set((state) => {
          const { copyModeAnchorId, copySelectedIds } = state;
          if (!copyModeAnchorId || copySelectedIds.length === 0) {
            return { copyModeAnchorId: null, copySelectedIds: [] };
          }

          const character = state.characters.find((item) => item.id === characterId);
          const found = character ? findNodeInComboTrees(character.comboTrees, copyModeAnchorId) : null;
          if (!found) return { copyModeAnchorId: null, copySelectedIds: [] };

          const parentOf = buildParentMap(found.tree.root);
          const selectedSet = new Set(copySelectedIds);

          // 選択されたノードの祖先も選択されている場合、そのノードは祖先の複製に
          // まるごと含まれるため、独立した断片としては数えない（重複コピー防止）
          const hasSelectedAncestor = (id: string): boolean => {
            let cursor = parentOf.get(id);
            while (cursor) {
              if (selectedSet.has(cursor)) return true;
              cursor = parentOf.get(cursor);
            }
            return false;
          };

          const fragments = copySelectedIds
            .filter((id) => !hasSelectedAncestor(id))
            .map((id) => findNode(found.tree.root, id))
            .filter((node): node is MoveNode => node !== null);

          return {
            clipboard: fragments,
            copyModeAnchorId: null,
            copySelectedIds: [],
          };
        });
      },

      clipboard: null,

      clearClipboard: () => {
        set({ clipboard: null });
      },

      pasteClipboard: (characterId, treeId, targetNodeId) => {
        const { clipboard, nickname } = get();
        if (!clipboard || clipboard.length === 0) return;

        const cloneWithFreshIds = (node: MoveNode): MoveNode => ({
          ...node,
          id: makeId(),
          createdBy: nickname,
          createdAt: new Date().toISOString(),
          children: node.children.map(cloneWithFreshIds),
        });

        const pastedNodes = clipboard.map(cloneWithFreshIds);

        set((state) => ({
          characters: updateComboTreeRoot(state.characters, characterId, treeId, (root) =>
            mapMoveNode(root, targetNodeId, (node) => ({
              ...node,
              children: [...node.children, ...pastedNodes],
            })),
          ),
        }));
      },

      // ──「共通区間を名前付きグループとして折りたたむ」機能 ────────────────────

      groupModeActive: false,
      groupModeAnchorId: null,
      groupSelectedIds: [],
      groupModeRuns: [],

      startGroupMode: (nodeId) => {
        set({
          groupModeActive: true,
          groupModeAnchorId: nodeId,
          groupSelectedIds: [],
          groupModeRuns: [],
          selectedNodeId: null,
          copyModeAnchorId: null,
          copySelectedIds: [],
          matchModeAnchorId: null,
          matchSelectedIds: [],
          matchedAnchorIds: null,
          matchEditBeforeSnapshot: null,
          replaceModeAnchorId: null,
          replaceSelectedIds: [],
          replacementChainIds: null,
        });
      },

      setGroupModeAnchor: (nodeId) => {
        set({ groupModeAnchorId: nodeId, groupSelectedIds: [] });
      },

      setGroupSelectedIds: (nodeIds) => {
        set({ groupSelectedIds: nodeIds });
      },

      addGroupModeRun: () => {
        set((state) => {
          if (!state.groupModeAnchorId) return state;

          return {
            groupModeRuns: [
              ...state.groupModeRuns,
              { anchorId: state.groupModeAnchorId, selectedIds: state.groupSelectedIds },
            ],
            groupModeAnchorId: null,
            groupSelectedIds: [],
          };
        });
      },

      removeGroupModeRun: (index) => {
        set((state) => ({
          groupModeRuns: state.groupModeRuns.filter((_, i) => i !== index),
        }));
      },

      cancelGroupMode: () => {
        set({ groupModeActive: false, groupModeAnchorId: null, groupSelectedIds: [], groupModeRuns: [] });
      },

      confirmGroupSelection: (characterId, name) => {
        set((state) => {
          const { groupModeAnchorId, groupSelectedIds, groupModeRuns } = state;
          const trimmedName = name.trim();
          const resetState = {
            groupModeActive: false,
            groupModeAnchorId: null,
            groupSelectedIds: [],
            groupModeRuns: [],
            // グループ化の選択中に、途中にあった既存のピルを展開して通り抜けている
            // ことがあるため、確定時に一旦すべて畳んだ状態へ戻す
            expandedGroupIds: [],
          };

          // 今編集中の枝が残っていれば、確定済みの枝リストに含めてから一括で反映する
          const allRuns = groupModeAnchorId
            ? [...groupModeRuns, { anchorId: groupModeAnchorId, selectedIds: groupSelectedIds }]
            : groupModeRuns;

          if (allRuns.length === 0 || !trimmedName) return resetState;

          const character = state.characters.find((item) => item.id === characterId);
          if (!character) return resetState;

          const existingGroup = character.namedComboGroups.find((group) => group.name === trimmedName);
          const groupId = existingGroup?.id ?? makeId();

          // 枝ごとに別の木へ属していることもあるため、枝ごとに所属する木を探して反映する
          let nextCharacters = state.characters;
          for (const run of allRuns) {
            const found = findNodeInComboTrees(character.comboTrees, run.anchorId);
            if (!found) continue;

            const memberIds = [run.anchorId, ...run.selectedIds];
            nextCharacters = updateComboTreeRoot(nextCharacters, characterId, found.tree.id, (root) =>
              memberIds.reduce((r, id) => mapMoveNode(r, id, (node) => ({ ...node, groupId })), root),
            );
          }

          if (!existingGroup) {
            nextCharacters = nextCharacters.map((item) =>
              item.id === characterId
                ? { ...item, namedComboGroups: [...item.namedComboGroups, { id: groupId, name: trimmedName }] }
                : item,
            );
          }

          return { characters: nextCharacters, ...resetState };
        });
      },

      ungroupNode: (characterId, treeId, nodeId) => {
        set((state) => {
          const character = state.characters.find((item) => item.id === characterId);
          const tree = character?.comboTrees.find((item) => item.id === treeId);
          const node = tree ? findNode(tree.root, nodeId) : null;
          const groupId = node?.groupId;
          if (!tree || !groupId) return state;

          const parentOf = buildParentMap(tree.root);

          // nodeIdを含む「同じgroupIdが連続する区間」を上下に辿って特定する
          const memberIds = new Set<string>([nodeId]);

          let ancestorCursor = parentOf.get(nodeId);
          while (ancestorCursor) {
            const ancestorNode = findNode(tree.root, ancestorCursor);
            if (!ancestorNode || ancestorNode.groupId !== groupId) break;
            memberIds.add(ancestorNode.id);
            ancestorCursor = parentOf.get(ancestorCursor);
          }

          const collectDescendants = (current: MoveNode) => {
            current.children.forEach((child) => {
              if (child.groupId !== groupId) return;
              memberIds.add(child.id);
              collectDescendants(child);
            });
          };
          collectDescendants(node);

          const nextRoot = Array.from(memberIds).reduce(
            (root, id) => mapMoveNode(root, id, (n) => ({ ...n, groupId: undefined })),
            tree.root,
          );

          return {
            characters: updateComboTreeRoot(state.characters, characterId, treeId, () => nextRoot),
          };
        });
      },

      expandedGroupIds: [],

      toggleGroupExpanded: (pillId) => {
        set((state) => {
          const isExpanding = !state.expandedGroupIds.includes(pillId);
          const expandedGroupIds = isExpanding
            ? [...state.expandedGroupIds, pillId]
            : state.expandedGroupIds.filter((id) => id !== pillId);

          if (!isExpanding) return { expandedGroupIds };

          // 展開時は、区間内の実ノードが個別の折りたたみ状態のせいで一部隠れたまま
          // にならないよう、区間のメンバー全員を強制的に開いた状態にする
          let memberIds: string[] = [];
          for (const character of state.characters) {
            const found = findNodeInComboTrees(character.comboTrees, pillId);
            if (found?.node.groupId) {
              memberIds = collectGroupChain(found.node, found.node.groupId).memberIds;
              break;
            }
          }

          return {
            expandedGroupIds,
            collapsedNodeIds: state.collapsedNodeIds.filter((id) => !memberIds.includes(id)),
          };
        });
      },

      // ──「一致箇所への一括反映」機能 ────────────────────────────────

      matchModeAnchorId: null,
      matchSelectedIds: [],

      startMatchMode: (nodeId) => {
        set({
          matchModeAnchorId: nodeId,
          matchSelectedIds: [],
          matchedAnchorIds: null,
          matchEditBeforeSnapshot: null,
          matchChainLength: 0,
          selectedNodeId: null,
          copyModeAnchorId: null,
          copySelectedIds: [],
          groupModeActive: false,
          groupModeAnchorId: null,
          groupSelectedIds: [],
          groupModeRuns: [],
          replaceModeAnchorId: null,
          replaceSelectedIds: [],
          replacementChainIds: null,
        });
      },

      setMatchSelectedIds: (nodeIds) => {
        set({ matchSelectedIds: nodeIds });
      },

      cancelMatchMode: () => {
        set({
          matchModeAnchorId: null,
          matchSelectedIds: [],
          matchedAnchorIds: null,
          matchEditBeforeSnapshot: null,
          matchChainLength: 0,
          replaceModeAnchorId: null,
          replaceSelectedIds: [],
          replacementChainIds: null,
        });
      },

      matchedAnchorIds: null,
      matchChainLength: 0,

      confirmMatchSearch: (characterId, includeAttributes) => {
        set((state) => {
          const { matchModeAnchorId, matchSelectedIds } = state;
          if (!matchModeAnchorId) {
            return { matchModeAnchorId: null, matchSelectedIds: [] };
          }

          const character = state.characters.find((item) => item.id === characterId);
          if (!character) return { matchModeAnchorId: null, matchSelectedIds: [] };

          const patternIds = [matchModeAnchorId, ...matchSelectedIds];
          const patternChain = patternIds
            .map((id) => findNodeInComboTrees(character.comboTrees, id)?.node)
            .filter((node): node is MoveNode => node !== undefined);

          if (patternChain.length !== patternIds.length) {
            return { matchModeAnchorId: null, matchSelectedIds: [] };
          }

          const matches = findMatchingChains(character.comboTrees, patternChain, { includeAttributes });

          return {
            matchModeAnchorId: null,
            matchSelectedIds: [],
            matchedAnchorIds: matches,
            matchChainLength: patternChain.length,
          };
        });
      },

      clearMatchResults: () => {
        set({
          matchedAnchorIds: null,
          matchEditBeforeSnapshot: null,
          matchChainLength: 0,
          replaceModeAnchorId: null,
          replaceSelectedIds: [],
          replacementChainIds: null,
        });
      },

      matchEditBeforeSnapshot: null,

      startEditingMatch: (nodeId) => {
        set((state) => {
          let foundNode: MoveNode | null = null;
          for (const character of state.characters) {
            const found = findNodeInComboTrees(character.comboTrees, nodeId);
            if (found) {
              foundNode = found.node;
              break;
            }
          }

          return {
            selectedNodeId: nodeId,
            matchEditBeforeSnapshot: foundNode ? structuredClone(foundNode) : null,
          };
        });
      },

      propagateMatchChanges: (characterId) => {
        set((state) => {
          const { matchedAnchorIds, matchChainLength, matchEditBeforeSnapshot, selectedNodeId } = state;
          const resetState = {
            matchedAnchorIds: null,
            matchEditBeforeSnapshot: null,
            matchChainLength: 0,
          };

          if (!matchedAnchorIds || !matchEditBeforeSnapshot || !selectedNodeId) return resetState;

          const character = state.characters.find((item) => item.id === characterId);
          const sourceFound = character ? findNodeInComboTrees(character.comboTrees, selectedNodeId) : null;
          if (!sourceFound) return resetState;

          const beforeChain = collectChain(matchEditBeforeSnapshot, matchChainLength);
          const afterChain = collectChain(sourceFound.node, matchChainLength);
          if (!beforeChain || !afterChain) return resetState;

          // 境界内(0..N-1)で内容が変わった位置（branchStatsは常に対象外）
          const changedPositions = afterChain
            .map((node, index) => ({ index, node, before: beforeChain[index] }))
            .filter(
              ({ node, before }) =>
                node.moveName !== before.moveName ||
                (node.displayName ?? null) !== (before.displayName ?? null) ||
                JSON.stringify(node.attributes) !== JSON.stringify(before.attributes) ||
                node.specialNote !== before.specialNote,
            );

          // 末尾ノードに新しく増えた子（＝「直後に枝を追加」操作の追加分）
          const beforeTail = beforeChain[beforeChain.length - 1];
          const afterTail = afterChain[afterChain.length - 1];
          const newTailChildren = afterTail.children.slice(beforeTail.children.length);

          const cloneWithoutStats = (node: MoveNode): MoveNode => ({
            ...node,
            id: makeId(),
            branchStats: null,
            children: node.children.map(cloneWithoutStats),
          });

          let nextCharacters = state.characters;

          matchedAnchorIds
            .filter((anchorId) => anchorId !== selectedNodeId)
            .forEach((anchorId) => {
              const currentCharacter = nextCharacters.find((item) => item.id === characterId);
              const found = currentCharacter
                ? findNodeInComboTrees(currentCharacter.comboTrees, anchorId)
                : null;
              if (!found) return;

              const targetChain = collectChain(found.node, matchChainLength);
              if (!targetChain) return;

              const targetIds = targetChain.map((node) => node.id);
              const clonedNewChildren = newTailChildren.map(cloneWithoutStats);

              nextCharacters = updateComboTreeRoot(nextCharacters, characterId, found.tree.id, (root) => {
                let nextRoot = root;

                changedPositions.forEach(({ index, node }) => {
                  nextRoot = mapMoveNode(nextRoot, targetIds[index], (targetNode) => ({
                    ...targetNode,
                    moveName: node.moveName,
                    displayName: node.displayName,
                    attributes: node.attributes,
                    specialNote: node.specialNote,
                  }));
                });

                if (clonedNewChildren.length > 0) {
                  nextRoot = mapMoveNode(nextRoot, targetIds[targetIds.length - 1], (targetNode) => ({
                    ...targetNode,
                    children: [...targetNode.children, ...clonedNewChildren],
                  }));
                }

                return nextRoot;
              });
            });

          return { characters: nextCharacters, ...resetState };
        });
      },

      // ── 一致箇所を丸ごと置換 ──────────────────────────────────────────

      replaceModeAnchorId: null,
      replaceSelectedIds: [],
      replacementChainIds: null,

      startReplaceSelection: (nodeId) => {
        set({
          replaceModeAnchorId: nodeId,
          replaceSelectedIds: [],
          replacementChainIds: null,
          selectedNodeId: null,
        });
      },

      setReplaceSelectedIds: (nodeIds) => {
        set({ replaceSelectedIds: nodeIds });
      },

      cancelReplaceSelection: () => {
        set({ replaceModeAnchorId: null, replaceSelectedIds: [], replacementChainIds: null });
      },

      confirmReplaceSelection: () => {
        set((state) => {
          if (!state.replaceModeAnchorId) return { replaceModeAnchorId: null, replaceSelectedIds: [] };

          return {
            replaceModeAnchorId: null,
            replaceSelectedIds: [],
            replacementChainIds: [state.replaceModeAnchorId, ...state.replaceSelectedIds],
          };
        });
      },

      propagateReplaceChanges: (characterId) => {
        set((state) => {
          const { matchedAnchorIds, matchChainLength, replacementChainIds } = state;
          const resetState = {
            matchedAnchorIds: null,
            matchEditBeforeSnapshot: null,
            matchChainLength: 0,
            replacementChainIds: null,
          };

          if (!matchedAnchorIds || !replacementChainIds || replacementChainIds.length === 0) return resetState;

          const character = state.characters.find((item) => item.id === characterId);
          if (!character) return resetState;

          const replacementChain = replacementChainIds
            .map((id) => findNodeInComboTrees(character.comboTrees, id)?.node)
            .filter((node): node is MoveNode => node !== undefined);
          if (replacementChain.length !== replacementChainIds.length) return resetState;

          const replacementSourceAnchorId = replacementChainIds[0];

          const cloneAsSubtree = (chain: MoveNode[], tailChildren: MoveNode[]): MoveNode => {
            const [head, ...rest] = chain;
            return {
              ...head,
              id: makeId(),
              branchStats: null,
              children: rest.length > 0 ? [cloneAsSubtree(rest, tailChildren)] : tailChildren,
            };
          };

          let nextCharacters = state.characters;

          matchedAnchorIds
            .filter((anchorId) => anchorId !== replacementSourceAnchorId)
            .forEach((anchorId) => {
              const currentCharacter = nextCharacters.find((item) => item.id === characterId);
              const found = currentCharacter
                ? findNodeInComboTrees(currentCharacter.comboTrees, anchorId)
                : null;
              if (!found) return;

              const targetChain = collectChain(found.node, matchChainLength);
              if (!targetChain) return;

              // 置換範囲より下、各箇所が個別に持つ続き（枝分かれ後の内容）は保持する
              const preservedChildren = targetChain[targetChain.length - 1].children;
              const replacementSubtree = cloneAsSubtree(replacementChain, preservedChildren);

              nextCharacters = updateComboTreeRoot(nextCharacters, characterId, found.tree.id, (root) =>
                mapMoveNode(root, targetChain[0].id, () => replacementSubtree),
              );
            });

          return { characters: nextCharacters, ...resetState };
        });
      },
    }),
    {
      name: 'combo-lab-storage',

      partialize: (state) => ({
        theme: state.theme,
        isGuest: state.isGuest,
        characters: state.characters,
        selectedCharacterId: state.selectedCharacterId,
        collapsedNodeIds: state.collapsedNodeIds,
        expandedGroupIds: state.expandedGroupIds,
        moveStatsDatabase: state.moveStatsDatabase,
      }),

      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppState> | undefined;

        return {
          ...currentState,
          ...persisted,
          // 保存済みデータが壊れている/空の場合は初期ロースターにフォールバックする。
          // SA1〜3の初期枠はこの機能の実装後に追加されたため、それより前に保存された
          // キャラには入っていない。読み込み時に不足していれば補完する
          characters:
            Array.isArray(persisted?.characters) && persisted.characters.length > 0
              ? persisted.characters.map(migrateLegacyCharacter)
              : currentState.characters,
          // 技データは「ローカル環境でのみ編集できる」運用のため、それ以外では常に
          // ビルド同梱の正本（MOVE_STATS_SEED）を使う。ローカル編集中の下書きだけ
          // localStorageの内容を採用する
          moveStatsDatabase:
            canEditMoveStatsLocally() && persisted?.moveStatsDatabase
              ? normalizeMoveStatsDatabase(persisted.moveStatsDatabase)
              : MOVE_STATS_SEED,
          user: currentState.user,
          nickname: persisted?.isGuest ? 'ゲスト' : currentState.nickname,
          isPatchNotesModalOpen: false,
          selectedPatchNoteDate: null,
          selectedNodeId: null,
        };
      },
    },
  ),
);

// ゲストモード（＝ポートフォリオの閲覧専用モード）では、ローカルの本物のデータではなく
// 固定のショーケースデータを表示する。selectCharacter等のツリー編集画面は共通で使うため、
// characters を読む箇所はこのフックに統一する（store.characters を直接ゲスト用に
// 上書きしてしまうと、その後ログインし直した際に本物のローカルデータを消してしまう）。
export function useVisibleCharacters(): Character[] {
  const isGuest = useAppStore((state) => state.isGuest);
  const characters = useAppStore((state) => state.characters);
  return isGuest ? SHOWCASE_CHARACTERS : characters;
}
