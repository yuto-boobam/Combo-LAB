// src/components/combo/SideDrawerPanel.tsx
// 常時開いた状態を想定するサイドドロワー（企画書9ページ）。
// 現時点では「属性付与/新規ノード追加」機能のみ実装する。
// 「枝の閲覧（条件での絞り込み）」は別フェーズで追加する。

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore } from '../../store';
import { findNodeInComboTrees } from '../../utils/comboTreeSearch';
import { buildParentMap, findNode } from '../../lib/tree';
import type {
  ComboBranchStats,
  ComboTree,
  MoveDefinition,
  MoveNode,
  MoveStats,
  MoveStatsDatabase,
  MoveStrength,
  NodeAttribute,
} from '../../types';
import { TUTORIAL_CHARACTER_ID } from '../../data/tutorialCharacter';
import { DRAWER_WIDTH } from '../../pages/ComboTreePage.config';
import { AttributeEditor } from './AttributeEditor';
import { BranchStatsEditor } from './BranchStatsEditor';
import { OdLevelToggle } from './OdLevelToggle';
import { HitSelectionToggle } from './HitSelectionToggle';
import { DEFAULT_BRANCH_STATS } from '../../utils/branchStatsDefaults';
import { parseStarterMoveOptionsText, parseStarterMoveToken } from '../../utils/starterMoveOptions';
import {
  calculateAllComboDamageSegments,
  calculateBranchDamage,
  calculateBranchDamageBreakdown,
  calculateBranchDGaugeBreakdown,
  calculateBranchDGaugeChange,
  calculateBranchDGaugeMinimumRequired,
  calculateBranchOpponentDGaugeChip,
  calculateBranchSaGaugeBreakdown,
  calculateBranchSaGaugeChange,
  calculateOdLevelConstraint,
  calculateRequiredStartHitCondition,
  findOdRelevantNodesOnPath,
  lookupMoveName,
  resolveHitIndices,
  type DamageBreakdown,
} from '../../utils/comboGaugeCalc';
import { IMPACT_MOVE_NAME } from '../../utils/nodeVisualStyle';
import { MoveNamePicker } from './MoveNamePicker';
import { ClipboardPreview } from './ClipboardPreview';
import { ChainPreviewRow } from './ChainPreviewRow';
import AccordionSection from '../AccordionSection';

type Props = {
  characterId: string;
  // キャラが持つすべての木（森）。選択中ノードがどの木に属するかはここから探す
  // （画面には全ての木が同時に表示されるため、木を1本に決め打ちできない）
  comboTrees: ComboTree[];
  // falseの間、ドロワーを右へフェードアウトさせながら幅を畳む（閉じている間もアンマウントはしない。
  // 選択状態やスクロール位置を保つため）。省略時は常時表示（従来通り）。
  isOpen?: boolean;
  // 誘導ガイド（チュートリアル用）: このノードIDが選択されている間だけ「コンボの情報」欄を
  // 光らせる。ComboTreePage側がどの段階かを判断し、対象ノードIDだけをここへ渡す
  // （このコンポーネント自身はチュートリアルの手順そのものは知らない）
  highlightComboInfoNodeId?: string | null;
  onComboInfoOpened?: () => void;
  // 誘導ガイドの次の段階: このノードIDが選択されている間だけ「ダメージ・計算式」欄を
  // 光らせ、「計算式」を開くよう誘導する。考え方はhighlightComboInfoNodeIdと同じ
  highlightFormulaNodeId?: string | null;
  onFormulaOpened?: () => void;
};

export function SideDrawerPanel({
  characterId,
  comboTrees,
  isOpen = true,
  highlightComboInfoNodeId = null,
  onComboInfoOpened,
  highlightFormulaNodeId = null,
  onFormulaOpened,
}: Props) {
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const isGuest = useAppStore((state) => state.isGuest);
  const copyModeAnchorId = useAppStore((state) => state.copyModeAnchorId);
  const groupModeActive = useAppStore((state) => state.groupModeActive);
  const matchModeAnchorId = useAppStore((state) => state.matchModeAnchorId);
  const matchedAnchorIds = useAppStore((state) => state.matchedAnchorIds);
  const replaceModeAnchorId = useAppStore((state) => state.replaceModeAnchorId);
  const clipboard = useAppStore((state) => state.clipboard);

  // チュートリアル用キャラクターだけ、ゲストモードでも編集できるようにする例外
  // （ComboTreePage.tsxのisReadOnlyと同じ考え方）
  const isReadOnly = isGuest && characterId !== TUTORIAL_CHARACTER_ID;

  const selectedInfo = findNodeInComboTrees(comboTrees, selectedNodeId);

  return (
    <div style={{ ...styles.drawerWrapper, width: isOpen ? DRAWER_WIDTH : 0 }}>
      <aside
        style={{
          ...styles.drawer,
          transform: isOpen ? 'translateX(0)' : 'translateX(24px)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? undefined : 'none',
        }}
      >
      <div className="drawer-scroll" style={styles.body}>
        {!isReadOnly && matchedAnchorIds && (
          <MatchResultsPanel characterId={characterId} comboTrees={comboTrees} />
        )}

        {isReadOnly ? (
          <ReadOnlyNodeView
            characterId={characterId}
            root={selectedInfo?.tree.root ?? null}
            selectedNode={selectedInfo?.node ?? null}
          />
        ) : copyModeAnchorId ? (
          <CopyModePanel characterId={characterId} comboTrees={comboTrees} anchorId={copyModeAnchorId} />
        ) : groupModeActive ? (
          <GroupModePanel characterId={characterId} comboTrees={comboTrees} />
        ) : matchModeAnchorId ? (
          <MatchModePanel characterId={characterId} comboTrees={comboTrees} />
        ) : replaceModeAnchorId ? (
          <ReplaceSelectionPanel comboTrees={comboTrees} />
        ) : selectedInfo ? (
          // selectedNode.id をkeyにすることで、ノードを切り替えるたびに
          // NodeEditor をマウントし直し、新規追加フォームの入力状態を自然にリセットする
          <NodeEditor
            key={selectedInfo.node.id}
            characterId={characterId}
            treeId={selectedInfo.tree.id}
            root={selectedInfo.tree.root}
            selectedNode={selectedInfo.node}
            highlightComboInfo={highlightComboInfoNodeId === selectedInfo.node.id}
            onComboInfoOpened={onComboInfoOpened}
            highlightFormula={highlightFormulaNodeId === selectedInfo.node.id}
            onFormulaOpened={onFormulaOpened}
          />
        ) : (
          <p style={styles.hint}>
            ツリー上のノードをクリックすると、ここで技の編集や新しい技の追加ができます。
          </p>
        )}

        {!isReadOnly && (
          <NewTreeSection characterId={characterId} startOpen={comboTrees.length === 0} />
        )}
        {!isReadOnly && clipboard && <ClipboardPreview characterId={characterId} />}
      </div>
      </aside>
    </div>
  );
}

function CopyModePanel({
  characterId,
  comboTrees,
  anchorId,
}: {
  characterId: string;
  comboTrees: ComboTree[];
  anchorId: string;
}) {
  const copySelectedIds = useAppStore((state) => state.copySelectedIds);
  const cancelCopyMode = useAppStore((state) => state.cancelCopyMode);
  const confirmCopy = useAppStore((state) => state.confirmCopy);
  const [isOpen, setIsOpen] = useState(true);

  const anchorNode = findNodeInComboTrees(comboTrees, anchorId)?.node ?? null;
  // 起点が末端ノード（続く枝が無い）の場合、選ぶべき候補が1つも無く操作不能になってしまうため、
  // 何も選択しなくても「起点自身をコピーする」ものとして確定できるようにする
  const isAnchorLeaf = anchorNode !== null && anchorNode.children.length === 0;

  return (
    <AccordionSection
      title={`コピーモード：${anchorNode?.moveName ?? ''}`}
      icon="📋"
      count={copySelectedIds.length}
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <p style={styles.hint}>
          {isAnchorLeaf
            ? `「${anchorNode?.moveName}」には続く枝が無いため、このまま「コピーを確定」を押すとこの技だけがコピーされます。`
            : `「${anchorNode?.moveName}」から続く枝をクリックして選択してください。選んだ枝は子孫ごとコピーされます。`}
        </p>

        <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
          {copySelectedIds.length}個の枝を選択中
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-primary justify-center"
            style={{ flex: 1 }}
            disabled={copySelectedIds.length === 0 && !isAnchorLeaf}
            onClick={() => confirmCopy(characterId)}
          >
            コピーを確定
          </button>
          <button type="button" style={styles.dangerButton} onClick={cancelCopyMode}>
            キャンセル
          </button>
        </div>
      </div>
    </AccordionSection>
  );
}

function GroupModePanel({
  characterId,
  comboTrees,
}: {
  characterId: string;
  comboTrees: ComboTree[];
}) {
  const groupModeAnchorId = useAppStore((state) => state.groupModeAnchorId);
  const groupSelectedIds = useAppStore((state) => state.groupSelectedIds);
  const groupModeRuns = useAppStore((state) => state.groupModeRuns);
  const addGroupModeRun = useAppStore((state) => state.addGroupModeRun);
  const removeGroupModeRun = useAppStore((state) => state.removeGroupModeRun);
  const cancelGroupMode = useAppStore((state) => state.cancelGroupMode);
  const confirmGroupSelection = useAppStore((state) => state.confirmGroupSelection);
  const namedComboGroups = useAppStore(
    (state) => state.characters.find((item) => item.id === characterId)?.namedComboGroups ?? [],
  );
  const [isOpen, setIsOpen] = useState(true);
  const [name, setName] = useState('');

  const moveNameOf = (nodeId: string) => findNodeInComboTrees(comboTrees, nodeId)?.node.moveName ?? '?';

  const anchorNode = groupModeAnchorId ? findNodeInComboTrees(comboTrees, groupModeAnchorId)?.node ?? null : null;
  const currentRunCount = groupModeAnchorId ? groupSelectedIds.length + 1 : 0;
  const totalCount =
    groupModeRuns.reduce((sum, run) => sum + run.selectedIds.length + 1, 0) + currentRunCount;

  const handleConfirm = () => {
    if (!name.trim()) return;
    confirmGroupSelection(characterId, name);
    setName('');
  };

  return (
    <AccordionSection
      title="グループ化モード"
      icon="🔗"
      count={totalCount}
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
    >
      <div style={{ display: 'grid', gap: 10 }}>
        {groupModeRuns.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)' }}>登録済みの枝</p>
            {groupModeRuns.map((run, index) => {
              const endId = run.selectedIds[run.selectedIds.length - 1] ?? run.anchorId;
              const count = run.selectedIds.length + 1;
              return (
                <div key={`${run.anchorId}-${index}`} style={styles.runRow}>
                  <span style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                    {moveNameOf(run.anchorId)}
                    {endId !== run.anchorId ? ` → ${moveNameOf(endId)}` : ''}（{count}個）
                  </span>
                  <button
                    type="button"
                    title="この枝を取り消す"
                    style={styles.removeButton}
                    onClick={() => removeGroupModeRun(index)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {groupModeAnchorId ? (
          <>
            <p style={styles.hint}>
              「{anchorNode?.moveName}」から続く一本道の技をクリックして、まとめる範囲を選んでください
              （分岐がある技より先は選べません）。
            </p>

            <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
              現在の枝：{currentRunCount}個の技を選択中
            </p>

            <button type="button" className="btn-ghost justify-center" onClick={addGroupModeRun}>
              ＋ この枝を追加して次へ
            </button>
          </>
        ) : (
          <p style={styles.hint}>
            木の中で、次にまとめたい枝の始点になる技をクリックしてください
            （もう枝を追加しない場合は、そのまま下で名前を付けて確定できます）。
          </p>
        )}

        {namedComboGroups.length > 0 && (
          <label style={styles.fieldLabel}>
            既存のグループ名から選ぶ
            <select
              className="input-field"
              style={styles.textInput}
              value=""
              onChange={(event) => {
                if (event.target.value) setName(event.target.value);
              }}
            >
              <option value="">（選択してください）</option>
              {namedComboGroups.map((group) => (
                <option key={group.id} value={group.name}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label style={styles.fieldLabel}>
          グループ名（新規作成、または上で選んだ名前を使う）
          <input
            type="text"
            className="input-field"
            style={styles.textInput}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="例: コンボA"
          />
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-primary justify-center"
            style={{ flex: 1 }}
            disabled={!name.trim() || totalCount === 0}
            onClick={handleConfirm}
          >
            グループ化を確定
          </button>
          <button type="button" style={styles.dangerButton} onClick={cancelGroupMode}>
            キャンセル
          </button>
        </div>
      </div>
    </AccordionSection>
  );
}

function MatchModePanel({
  characterId,
  comboTrees,
}: {
  characterId: string;
  comboTrees: ComboTree[];
}) {
  const matchModeAnchorId = useAppStore((state) => state.matchModeAnchorId);
  const matchSelectedIds = useAppStore((state) => state.matchSelectedIds);
  const cancelMatchMode = useAppStore((state) => state.cancelMatchMode);
  const confirmMatchSearch = useAppStore((state) => state.confirmMatchSearch);
  const [isOpen, setIsOpen] = useState(true);
  const [includeAttributes, setIncludeAttributes] = useState(false);

  const anchorNode = matchModeAnchorId
    ? findNodeInComboTrees(comboTrees, matchModeAnchorId)?.node ?? null
    : null;
  const count = matchSelectedIds.length + 1;

  return (
    <AccordionSection
      title="一致箇所を探す"
      icon="🔍"
      count={count}
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <p style={styles.hint}>
          「{anchorNode?.moveName}」から続く一本道の技をクリックして、探したい並びを選んでください
          （分岐がある技より先は選べません）。
        </p>

        <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
          {count}個の技を選択中
        </p>

        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={includeAttributes}
            onChange={(event) => setIncludeAttributes(event.target.checked)}
          />
          属性も一致条件に含める（当たり方の違いで実際には繋がらない組み合わせを除外したい場合）
        </label>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-primary justify-center"
            style={{ flex: 1 }}
            onClick={() => confirmMatchSearch(characterId, includeAttributes)}
          >
            この内容で検索する
          </button>
          <button type="button" style={styles.dangerButton} onClick={cancelMatchMode}>
            キャンセル
          </button>
        </div>
      </div>
    </AccordionSection>
  );
}

function ReplaceSelectionPanel({ comboTrees }: { comboTrees: ComboTree[] }) {
  const replaceModeAnchorId = useAppStore((state) => state.replaceModeAnchorId);
  const replaceSelectedIds = useAppStore((state) => state.replaceSelectedIds);
  const cancelReplaceSelection = useAppStore((state) => state.cancelReplaceSelection);
  const confirmReplaceSelection = useAppStore((state) => state.confirmReplaceSelection);
  const [isOpen, setIsOpen] = useState(true);

  const anchorNode = replaceModeAnchorId
    ? findNodeInComboTrees(comboTrees, replaceModeAnchorId)?.node ?? null
    : null;
  const count = replaceSelectedIds.length + 1;

  return (
    <AccordionSection
      title="置換内容を選ぶ"
      icon="🔁"
      count={count}
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <p style={styles.hint}>
          「{anchorNode?.moveName}」から続く一本道の技をクリックして、置換後の内容として使う範囲を選んでください
          （分岐がある技より先は選べません。ここで選んだ内容が、一致箇所すべての置換範囲と丸ごと入れ替わります）。
        </p>

        <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
          {count}個の技を選択中
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-primary justify-center"
            style={{ flex: 1 }}
            onClick={confirmReplaceSelection}
          >
            この内容に決定する
          </button>
          <button type="button" style={styles.dangerButton} onClick={cancelReplaceSelection}>
            キャンセル
          </button>
        </div>
      </div>
    </AccordionSection>
  );
}

/** 置換内容プレビュー用に、選択されたチェーンだけをたどる仮のノードを組み立てる
 * （ChainPreviewRowが渡されたノードの実際の子をそのまま辿ってしまうため、
 * 選択範囲より先の実データを誤って表示しないようにする） */
function buildChainPreviewNode(chain: MoveNode[]): MoveNode {
  const [head, ...rest] = chain;
  return { ...head, children: rest.length > 0 ? [buildChainPreviewNode(rest)] : [] };
}

function MatchResultsPanel({
  characterId,
  comboTrees,
}: {
  characterId: string;
  comboTrees: ComboTree[];
}) {
  const matchedAnchorIds = useAppStore((state) => state.matchedAnchorIds);
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const matchEditBeforeSnapshot = useAppStore((state) => state.matchEditBeforeSnapshot);
  const startEditingMatch = useAppStore((state) => state.startEditingMatch);
  const clearMatchResults = useAppStore((state) => state.clearMatchResults);
  const propagateMatchChanges = useAppStore((state) => state.propagateMatchChanges);
  const replacementChainIds = useAppStore((state) => state.replacementChainIds);
  const cancelReplaceSelection = useAppStore((state) => state.cancelReplaceSelection);
  const propagateReplaceChanges = useAppStore((state) => state.propagateReplaceChanges);
  const [isOpen, setIsOpen] = useState(true);

  if (!matchedAnchorIds) return null;

  const matchNodes = matchedAnchorIds
    .map((id) => findNodeInComboTrees(comboTrees, id)?.node)
    .filter((node): node is MoveNode => node !== undefined);

  const isEditingAMatch =
    selectedNodeId !== null && matchedAnchorIds.includes(selectedNodeId) && matchEditBeforeSnapshot !== null;
  const currentSourceNode = isEditingAMatch
    ? findNodeInComboTrees(comboTrees, selectedNodeId as string)?.node ?? null
    : null;
  const targetCount = matchedAnchorIds.length - 1; // 自分以外の一致箇所

  const replacementChain = replacementChainIds
    ?.map((id) => findNodeInComboTrees(comboTrees, id)?.node)
    .filter((node): node is MoveNode => node !== undefined);
  const isReplacementReady =
    replacementChain !== undefined && replacementChain.length === replacementChainIds?.length;
  const replaceTargetCount = isReplacementReady
    ? matchedAnchorIds.filter((id) => id !== replacementChainIds?.[0]).length
    : 0;

  return (
    <AccordionSection
      title="一致箇所への一括反映"
      icon="🔍"
      count={matchedAnchorIds.length}
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <p style={styles.hint}>
          {matchedAnchorIds.length <= 1
            ? '他に一致する枝は見つかりませんでした。'
            : '一覧から1つ選んで普通に編集してください。編集後、他の一致箇所へも反映できます。ノードを選んで「🔁 ここまでを置換内容にする」を押すと、一致箇所を丸ごと別の内容に置き換えることもできます。'}
        </p>

        <div style={{ display: 'grid', gap: 6 }}>
          {matchNodes.map((node) => (
            <button
              key={node.id}
              type="button"
              onClick={() => startEditingMatch(node.id)}
              style={{
                ...styles.matchRow,
                borderColor: node.id === selectedNodeId ? 'var(--accent)' : 'var(--border)',
              }}
            >
              <ChainPreviewRow root={node} />
            </button>
          ))}
        </div>

        {isEditingAMatch && currentSourceNode && matchEditBeforeSnapshot && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <p style={styles.previewLabel}>変更前</p>
              <ChainPreviewRow root={matchEditBeforeSnapshot} />
            </div>
            <div style={{ display: 'grid', gap: 4 }}>
              <p style={styles.previewLabel}>変更後</p>
              <ChainPreviewRow root={currentSourceNode} />
            </div>

            <button
              type="button"
              className="btn-primary justify-center"
              disabled={targetCount === 0}
              onClick={() => propagateMatchChanges(characterId)}
            >
              他の一致箇所に反映（対象{targetCount}件）
            </button>
          </div>
        )}

        {isReplacementReady && replacementChain && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <p style={styles.previewLabel}>置換後の内容（各箇所の個別の続きはそのまま保持されます）</p>
              <ChainPreviewRow root={buildChainPreviewNode(replacementChain)} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-primary justify-center"
                style={{ flex: 1 }}
                disabled={replaceTargetCount === 0}
                onClick={() => propagateReplaceChanges(characterId)}
              >
                この内容に一斉置換する（対象{replaceTargetCount}件）
              </button>
              <button type="button" style={styles.dangerButton} onClick={cancelReplaceSelection}>
                キャンセル
              </button>
            </div>
          </div>
        )}

        <button type="button" style={styles.dangerButton} onClick={clearMatchResults}>
          一覧を閉じる
        </button>
      </div>
    </AccordionSection>
  );
}

// 「コンボの情報」バッジに表示する件数。記入済みの項目がひと目で分かるよう、
// 未入力(null/false/初期値)を除いた項目数を数える
function countFilledBranchStats(stats: ComboBranchStats | null): number {
  if (!stats) return 0;
  return [
    stats.damage !== null,
    stats.dGaugeChange !== null,
    stats.opponentDGaugeChip !== null,
    stats.saGaugeGain !== null,
    stats.damageRating !== null,
    stats.dGaugeRating !== null,
    stats.saGaugeRating !== null,
    stats.carryRating !== null,
    stats.okizemeRating !== null,
    stats.difficultyRating !== null,
    stats.overallRating !== null,
    stats.plusFrame !== null,
    stats.isThrowRange,
    stats.canOkizeme,
    stats.isFavorite,
    stats.startHitCondition !== null,
    stats.isJustParryStart,
    stats.isRushStart,
    stats.usesCA,
    stats.finishingSpecialVariant !== null,
    stats.finishingSuperArtName !== null,
  ].filter(Boolean).length;
}

// 必殺技(special)の技名は`${強度接頭辞}${素の技名}`の形でノードに確定する
// （MoveNamePicker.tsxのSPECIAL_MOVE_STRENGTHSと同じ並び。'none'/'normalOd'強度モードの
// 技も含め、空文字接頭辞も一応候補に含めておく）
const SPECIAL_MOVE_STRENGTH_PREFIXES: (MoveStrength | '')[] = ['弱', '中', '強', 'OD', ''];

// ノードがSA(superArt)、または「常にコンボの締めで使う」（finishesComboOnSelect）設定の
// 必殺技(special)で、特殊性能あり(hasSpecialVariant)なのにノード自体はまだ特殊性能を
// 選ばず技名だけ（例:「SA1」「弱ランヴェルセ」）で置かれている場合だけ、「使用した特殊性能」
// 選択UIの対象にする（既に`SA1(Lv. 1)`のように特殊性能込みで確定しているノードは対象外。
// finishesComboOnSelectでない必殺技はノード名に焼き込み済みのため、後述のいずれの一致判定
// にもかからず自然に対象外になる）。マネージュ・ドレのメダルLvのように、必殺技側でも
// 同じ仕組みを使えるようにする（2026-09-30ユーザー要望：この選択UIがSAにしか出ていなかった
// 不具合の修正）。必殺技は強度ごとに選択肢（specialVariantsByStrength）が異なりうるため、
// SAのフラットなspecialVariantOptionsとは別に、一致した強度の選択肢を引く
function findFinishingSuperArtMove(
  moveList: MoveDefinition[],
  moveName: string,
): { name: string; specialVariantOptions: string[] } | null {
  for (const move of moveList) {
    if (!move.hasSpecialVariant) continue;

    if (move.category === 'superArt') {
      if (move.name === moveName) {
        return { name: move.name, specialVariantOptions: move.specialVariantOptions ?? [] };
      }
      continue;
    }

    if (move.category !== 'special') continue;
    for (const prefix of SPECIAL_MOVE_STRENGTH_PREFIXES) {
      if (`${prefix}${move.name}` !== moveName) continue;
      const options =
        (prefix ? move.specialVariantsByStrength?.[prefix] : undefined) ?? move.specialVariantOptions ?? [];
      return { name: moveName, specialVariantOptions: options };
    }
  }
  return null;
}

// 「SAで締める」の選択肢に出す、特殊性能なしの単純なSAの名前一覧。特殊性能ありのSAは
// findFinishingSuperArtMove側の仕組み（このノード自身がそのSAである場合）で扱うため対象外。
// さらに、このノードで実際に使っている技（moveStats、MoveStatsPage側で登録）が
// cancelableSuperArtNamesで許可しているSAだけに絞り込む（技によってキャンセル先は異なるため）
function findFinishingSuperArtOptions(
  moveList: MoveDefinition[],
  moveStats: MoveStats | undefined,
): string[] {
  const cancelable = new Set(moveStats?.cancelableSuperArtNames ?? []);
  // CA（クリティカルアーツ）はSA3と同じ技のキャンセル可否になるため、技データ登録画面では
  // SA3用のボタン1つだけで済ませている（cancelableSuperArtOptionsからCAを除外済み。
  // MoveStatsPage.tsx参照）。ここでSA3が対象ならCAも対象に加えて補う
  if (cancelable.has('SA3')) cancelable.add('CA');

  return moveList
    .filter((move) => move.category === 'superArt' && !move.hasSpecialVariant && cancelable.has(move.name))
    .map((move) => move.name);
}


// 汎用コンボの始動技（この枝で選択済みのbranchStats.startingMoveNamesチェーンの最後の技、
// ＝続きに直接つながる技）が複数ヒット技の場合に、「何段目でキャンセルしたか」を選ばせる
// UIを表示するための情報を返す。技マスタ側でキャンセル種類（MoveHitStats.cancelType）が
// 設定されている段だけを選択候補にする。単発技・未選択・キャンセル可能な段が無い場合はnull
// （欄自体を出さない）
function resolveStarterMoveCancelInfo(
  characterId: string,
  moveStatsDatabase: MoveStatsDatabase,
  selectedNode: MoveNode,
): { cancelableHitIndices: number[] } | null {
  const chain = selectedNode.branchStats?.startingMoveNames;
  if (!chain || chain.length === 0) return null;

  const { moveName } = parseStarterMoveToken(chain[chain.length - 1]);
  if (!moveName) return null;

  const stats = moveStatsDatabase[characterId]?.[moveName];
  if (!stats?.isMultiHit || stats.hits.length <= 1) return null;

  const cancelableHitIndices = stats.hits
    .map((hit, index) => (hit.cancelType && hit.cancelType !== '不可' ? index + 1 : null))
    .filter((value): value is number => value !== null);

  return cancelableHitIndices.length > 0 ? { cancelableHitIndices } : null;
}

function ReadOnlyNodeView({
  characterId,
  root,
  selectedNode,
}: {
  characterId: string;
  root: MoveNode | null;
  selectedNode: MoveNode | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const moveStatsDatabase = useAppStore((state) => state.moveStatsDatabase);
  const moveList = useAppStore(
    (state) => state.characters.find((item) => item.id === characterId)?.moveList ?? [],
  );

  if (!selectedNode) {
    return (
      <p style={styles.hint}>
        閲覧専用モードです。ツリー上のノードをクリックすると詳細が見られます。
      </p>
    );
  }

  const showStats =
    selectedNode.children.length === 0 ||
    selectedNode.attributes.some(
      (attribute) => attribute.type === 'guard' || attribute.type === 'whiff' || attribute.type === 'comboEnd',
    ) ||
    (selectedNode.recordsBranchStats ?? false);

  const requiredStartHitCondition = root
    ? calculateRequiredStartHitCondition(root, selectedNode.id)
    : null;
  const priorComboSegments =
    root && showStats
      ? (calculateAllComboDamageSegments(characterId, moveStatsDatabase, moveList, root, selectedNode.id) ?? [])
          .slice(0, -1)
          .filter((segment): segment is DamageBreakdown => segment !== null)
      : [];
  const finishingSuperArtMove = findFinishingSuperArtMove(moveList, selectedNode.moveName);
  const finishingSuperArtOptions = findFinishingSuperArtOptions(
    moveList,
    moveStatsDatabase[characterId]?.[selectedNode.moveName],
  );
  const odConstraint = calculateOdLevelConstraint(selectedNode, moveList);
  const effectiveUsesOD =
    odConstraint === 'odOnly' ? true : odConstraint === 'normalOnly' ? false : (selectedNode.usesOD ?? false);
  const odNodesOnPath = root ? findOdRelevantNodesOnPath(root, selectedNode.id, moveList) : [];
  const selectedNodeStats = moveStatsDatabase[characterId]?.[lookupMoveName(selectedNode, true)];
  const selectedNodeHitTotal = selectedNodeStats?.isMultiHit ? selectedNodeStats.hits.length : 0;
  const selectedNodeHitIndices = selectedNodeStats ? resolveHitIndices(selectedNodeStats, selectedNode) : [];
  const starterMoveCancelInfo = resolveStarterMoveCancelInfo(characterId, moveStatsDatabase, selectedNode);

  return (
    <>
      {showStats && (
        <AccordionSection
          title="コンボの情報（ダメージ・フレームなど）"
          icon="📊"
          count={countFilledBranchStats(selectedNode.branchStats)}
          isOpen={isStatsOpen}
          onToggle={() => setIsStatsOpen((open) => !open)}
        >
          <BranchStatsEditor
            value={selectedNode.branchStats}
            onChange={() => {}}
            readOnly
            requiredStartHitCondition={requiredStartHitCondition}
            priorComboSegments={priorComboSegments}
            finishingSuperArtMove={finishingSuperArtMove}
            finishingSuperArtOptions={finishingSuperArtOptions}
            odUsagesOnPath={odNodesOnPath.map(({ node, constraint }) => ({
              nodeId: node.id,
              label: node.displayName ?? node.moveName,
              constraint,
              usesOD: node.usesOD ?? false,
            }))}
            onChangeOdUsage={() => {}}
            starterMoveOptions={root?.startingMoveOptions ?? []}
            starterMoveCancelInfo={starterMoveCancelInfo}
          />
        </AccordionSection>
      )}

      <AccordionSection
        title={
          <>
            <span style={{ whiteSpace: 'nowrap' }}>選択中のノードについて：</span>
            <span style={{ whiteSpace: 'nowrap' }}>{selectedNode.displayName || selectedNode.moveName}</span>
          </>
        }
        icon="👁️"
        count={selectedNode.attributes.length}
        isOpen={isOpen}
        onToggle={() => setIsOpen((open) => !open)}
        sticky
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <AttributeEditor
            value={selectedNode.attributes}
            onChange={() => {}}
            readOnly
            specialNote={selectedNode.specialNote}
            onSpecialNoteChange={() => {}}
            isImpactMove={selectedNode.moveName === IMPACT_MOVE_NAME}
          />

          {odConstraint && (
            <OdLevelToggle constraint={odConstraint} usesOD={effectiveUsesOD} onChange={() => {}} readOnly />
          )}

          {selectedNodeHitTotal > 1 && (
            <HitSelectionToggle
              hitTotal={selectedNodeHitTotal}
              selectedHits={selectedNodeHitIndices}
              onChange={() => {}}
              readOnly
            />
          )}
        </div>
      </AccordionSection>
    </>
  );
}

function NewTreeSection({
  characterId,
  startOpen = false,
}: {
  characterId: string;
  // まだコンボの木が1つもない時は、必ずここから始動技を入力することになるため
  // 最初から開いた状態にする（2026-09-15ユーザー指摘）
  startOpen?: boolean;
}) {
  const createComboTree = useAppStore((state) => state.createComboTree);
  const selectNode = useAppStore((state) => state.selectNode);

  const [newRootMoveName, setNewRootMoveName] = useState('');
  const [newRootDisplayName, setNewRootDisplayName] = useState<string | undefined>(undefined);
  const [newRootAttributes, setNewRootAttributes] = useState<NodeAttribute[]>([]);
  const [isOpen, setIsOpen] = useState(startOpen);

  // 「汎用コンボ」: 複数の始動技(弱P/弱K等)から同じ続きに繋がるコンボを1本の木にまとめたい場合。
  // ONにすると始動技の技名選択(MoveNamePicker)の代わりに自由記入のラベル(例:「中攻撃」)と、
  // 対象の始動技一覧(改行区切り)を入力する。実際にどの技で始動したかは末端ノードごとに選ぶ
  // （types.tsのMoveNode.startingMoveOptions参照。ダメージ・ゲージ自動計算はそれを選ぶまで空欄になる）
  const [isGeneric, setIsGeneric] = useState(false);
  const [genericLabel, setGenericLabel] = useState('');
  const [genericStarterMovesText, setGenericStarterMovesText] = useState('');

  const canCreate = isGeneric ? genericLabel.trim().length > 0 : newRootMoveName.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate) return;

    if (isGeneric) {
      const starterMoveOptions = parseStarterMoveOptionsText(genericStarterMovesText);
      createComboTree(characterId, genericLabel, newRootAttributes, undefined, starterMoveOptions);
      setGenericLabel('');
      setGenericStarterMovesText('');
    } else {
      createComboTree(characterId, newRootMoveName, newRootAttributes, newRootDisplayName);
      setNewRootMoveName('');
      setNewRootDisplayName(undefined);
    }
    setNewRootAttributes([]);
    setIsOpen(false);
    selectNode(null);
  };

  return (
    <AccordionSection
      title="新たな木を生成"
      icon="🌱"
      count={0}
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
    >
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={isGeneric}
            onChange={(event) => setIsGeneric(event.target.checked)}
          />
          汎用コンボ（複数の始動技から同じ続きに繋がる）
        </label>

        {isGeneric ? (
          <>
            <label style={styles.fieldLabel}>
              ラベル（例:「中攻撃」。実際の技名ではなく見出しとして使う）
              <input
                type="text"
                className="input-field"
                value={genericLabel}
                onChange={(event) => setGenericLabel(event.target.value)}
              />
            </label>
            <label style={styles.fieldLabel}>
              この続きに繋げられる始動技（改行/カンマ区切りで複数入力。ジャンプ攻撃始動のように
              2技以上を経由してから続きに入る場合は「→」で繋ぐ。ある段に複数パターンが
              ある場合は「強P/4強P/2強P」のように「/」で並べると自動展開される。技名の後ろに
              「（C）」「（持続/C/PC/R/R持続）」のように条件を添えると「その条件で当たった時だけ
              繋がる」を表現できる（持続=持続ヒット・通常補正、C=カウンター・ダメージ増、
              PC=パニッシュカウンター・ダメージ増とDゲージ削り、R/R持続=ラッシュ攻撃・通常補正。
              1つの括弧にまとめて書いても、選択時にはそれぞれ独立した候補に分かれる。
              技名を書かず「PC」だけでも登録可）
              <textarea
                className="input-field"
                style={{ resize: 'vertical', fontFamily: 'inherit' }}
                rows={3}
                placeholder={'弱P\n弱K\nJ強K→強P/4強P/2強P\n2中P（持続/C/PC/R/R持続）'}
                value={genericStarterMovesText}
                onChange={(event) => setGenericStarterMovesText(event.target.value)}
              />
            </label>
            <p style={styles.hint}>
              実際にどの技で始動したかは、末端ノードの「コンボの情報」欄から枝ごとに選びます。
              選ぶまではその枝のダメージ・ゲージ自動計算は空欄のままになります。
            </p>
          </>
        ) : (
          <MoveNamePicker
            characterId={characterId}
            value={newRootMoveName}
            onChange={(name, displayName) => {
              setNewRootMoveName(name);
              setNewRootDisplayName(displayName);
            }}
          />
        )}

        <AttributeEditor
          value={newRootAttributes}
          onChange={setNewRootAttributes}
          isImpactMove={newRootMoveName === IMPACT_MOVE_NAME}
        />

        <button
          type="button"
          className="btn-primary justify-center"
          style={{ width: '100%' }}
          disabled={!canCreate}
          onClick={handleCreate}
        >
          {isGeneric ? 'この内容で汎用コンボの木を作る' : 'この技を始動技として新しい木を作る'}
        </button>
      </div>
    </AccordionSection>
  );
}

function NodeEditor({
  characterId,
  treeId,
  root,
  selectedNode,
  highlightComboInfo = false,
  onComboInfoOpened,
  highlightFormula = false,
  onFormulaOpened,
}: {
  characterId: string;
  treeId: string;
  root: MoveNode;
  selectedNode: MoveNode;
  highlightComboInfo?: boolean;
  onComboInfoOpened?: () => void;
  highlightFormula?: boolean;
  onFormulaOpened?: () => void;
}) {
  const selectNode = useAppStore((state) => state.selectNode);
  const addChildNode = useAppStore((state) => state.addChildNode);
  const deleteNode = useAppStore((state) => state.deleteNode);
  const updateNodeMoveName = useAppStore((state) => state.updateNodeMoveName);
  const updateNodeSpecialNote = useAppStore((state) => state.updateNodeSpecialNote);
  const setNodeAttributes = useAppStore((state) => state.setNodeAttributes);
  const setNodeBranchStats = useAppStore((state) => state.setNodeBranchStats);
  const setNodeUsesOD = useAppStore((state) => state.setNodeUsesOD);
  const setNodeHitIndices = useAppStore((state) => state.setNodeHitIndices);
  const moveNode = useAppStore((state) => state.moveNode);
  const setNodeRecordsBranchStats = useAppStore((state) => state.setNodeRecordsBranchStats);
  const moveStatsDatabase = useAppStore((state) => state.moveStatsDatabase);
  const moveList = useAppStore(
    (state) => state.characters.find((item) => item.id === characterId)?.moveList ?? [],
  );
  const startCopyMode = useAppStore((state) => state.startCopyMode);
  const startGroupMode = useAppStore((state) => state.startGroupMode);
  const startMatchMode = useAppStore((state) => state.startMatchMode);
  const matchedAnchorIds = useAppStore((state) => state.matchedAnchorIds);
  const startReplaceSelection = useAppStore((state) => state.startReplaceSelection);
  const ungroupNode = useAppStore((state) => state.ungroupNode);
  const detachNodeFromGroup = useAppStore((state) => state.detachNodeFromGroup);
  const groupName = useAppStore((state) => {
    if (!selectedNode.groupId) return null;
    const character = state.characters.find((item) => item.id === characterId);
    return character?.namedComboGroups.find((group) => group.id === selectedNode.groupId)?.name ?? null;
  });

  const [newMoveName, setNewMoveName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState<string | undefined>(undefined);
  const [newAttributes, setNewAttributes] = useState<NodeAttribute[]>([]);
  // 「常にコンボの締めで使う」SAの特殊性能を選んだ時だけ渡ってくる。追加確定時に
  // 新規ノードのbranchStats.finishingSpecialVariantへ反映する
  const [newFinishingSpecialVariant, setNewFinishingSpecialVariant] = useState<string | undefined>(
    undefined,
  );

  // 技名ピッカーはクリックした瞬間に選ばれてしまうため、選択中ノードの改名は
  // 「追加」フォームと同じくステージ（一時保存）してから明示的なボタンで確定する。
  // こうしないと、閲覧のつもりでボタンを押しただけでノードが改名されてしまう。
  const [editedMoveName, setEditedMoveName] = useState(selectedNode.moveName);
  const [editedDisplayName, setEditedDisplayName] = useState(selectedNode.displayName);
  // 「技名に焼き込まず、末端ノードで切り替える」設定の技の特殊性能を選んだ時だけ渡ってくる。
  // 技名変更確定時にこのノードのbranchStats.finishingSpecialVariantへ反映する。
  // 既にこのノードへ設定済みの値があれば初期値として復元する（再度開いた時に今どれを
  // 選んでいるか分かるように。2026-09-30ユーザー指摘：メダルLvを枝ごとに選び直したい）
  const [editedFinishingSpecialVariant, setEditedFinishingSpecialVariant] = useState<
    string | undefined
  >(selectedNode.branchStats?.finishingSpecialVariant ?? undefined);

  // 「コンボの情報」「選択中のノード」「新規ノード追加」はそれぞれ個別に開閉できる。
  // 「ノードを選ぶ→開きたいものだけ開く→操作する」という順序にするため、
  // デフォルトはすべて閉じた状態にする（閉じていてもAccordionSectionの件数バッジで
  // 記入状況は分かる）。ノードを切り替えるたびに（keyでの再マウントにより）この初期状態に戻る
  const [isStatsOpen, setIsStatsOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);

  // 統計入力欄は「葉ノード（子を持たない）」または「ガード」「空振り」を選んだノードに表示する。
  // recordsBranchStatsがtrueなら、それ以外のノードでも任意で表示できる（あえて途中で
  // 止めるケースを記録するための機能。詳細はtypes.tsのMoveNode.recordsBranchStats参照）
  const isNaturalStatsEndpoint =
    selectedNode.children.length === 0 ||
    selectedNode.attributes.some(
      (attribute) => attribute.type === 'guard' || attribute.type === 'whiff' || attribute.type === 'comboEnd',
    );
  const showStatsEditor = isNaturalStatsEndpoint || (selectedNode.recordsBranchStats ?? false);

  const autoSaGaugeChange = calculateBranchSaGaugeChange(
    characterId,
    moveStatsDatabase,
    root,
    selectedNode.id,
  );
  // SAゲージ増加欄の「合計⇄内訳」表示切替（BranchStatsEditor側）用
  const saGaugeBreakdown = calculateBranchSaGaugeBreakdown(
    characterId,
    moveStatsDatabase,
    root,
    selectedNode.id,
  );
  const autoDGaugeChange = calculateBranchDGaugeChange(
    characterId,
    moveStatsDatabase,
    moveList,
    root,
    selectedNode.id,
  );
  // Dゲージ増減欄の「合計⇄内訳」表示切替（BranchStatsEditor側）用。1ノードずつの
  // 増減（例:「+200→+200→-20000」）
  const dGaugeBreakdown = calculateBranchDGaugeBreakdown(
    characterId,
    moveStatsDatabase,
    moveList,
    root,
    selectedNode.id,
  );
  // このコンボを最後まで遂行するために最低限必要な開始時Dゲージ量（Dゲージ増減欄の下に表示）
  const dGaugeMinimumRequired = calculateBranchDGaugeMinimumRequired(
    characterId,
    moveStatsDatabase,
    moveList,
    root,
    selectedNode.id,
  );
  const autoOpponentDGaugeChip = calculateBranchOpponentDGaugeChip(
    characterId,
    moveStatsDatabase,
    moveList,
    root,
    selectedNode.id,
  );
  const autoDamage = calculateBranchDamage(
    characterId,
    moveStatsDatabase,
    moveList,
    root,
    selectedNode.id,
  );
  // ダメージ計算式の内訳（BranchStatsEditor側で「計算式」ボタンの開閉式にして見せる）
  const damageBreakdown = calculateBranchDamageBreakdown(
    characterId,
    moveStatsDatabase,
    moveList,
    root,
    selectedNode.id,
  );
  // 「コンボ終了」で区切られた、このノードより前の区間（1本目・2本目…のコンボ）の
  // ダメージ内訳。最後の区間（=damageBreakdown・autoDamageが表す「現在のコンボ」）は
  // 含めない（BranchStatsEditor側で二重表示にならないよう除く）
  const priorComboSegments = (
    calculateAllComboDamageSegments(characterId, moveStatsDatabase, moveList, root, selectedNode.id) ?? []
  )
    .slice(0, -1)
    .filter((segment): segment is DamageBreakdown => segment !== null);
  const requiredStartHitCondition = calculateRequiredStartHitCondition(root, selectedNode.id);
  const finishingSuperArtMove = findFinishingSuperArtMove(moveList, selectedNode.moveName);
  const finishingSuperArtOptions = findFinishingSuperArtOptions(
    moveList,
    moveStatsDatabase[characterId]?.[selectedNode.moveName],
  );
  const odConstraint = calculateOdLevelConstraint(selectedNode, moveList);
  const usesOD = selectedNode.usesOD ?? false;
  // root〜選択中ノードの経路上にあるOD関連ノード（このノード自身が末端でなくても、経路の
  // 途中にビーム等があれば含まれる）。「コンボの情報」欄からまとめて確認・変更できるようにする
  const odNodesOnPath = findOdRelevantNodesOnPath(root, selectedNode.id, moveList);
  // 複数ヒット技（技データ側でisMultiHit）なら、実際に何段目が当たったかを選べるようにする
  const selectedNodeStats = moveStatsDatabase[characterId]?.[lookupMoveName(selectedNode, true)];
  const selectedNodeHitTotal = selectedNodeStats?.isMultiHit ? selectedNodeStats.hits.length : 0;
  const selectedNodeHitIndices = selectedNodeStats ? resolveHitIndices(selectedNodeStats, selectedNode) : [];
  const starterMoveCancelInfo = resolveStarterMoveCancelInfo(characterId, moveStatsDatabase, selectedNode);

  // 兄弟ノード（同じ親を持つ枝）内での自分の位置。分岐している時だけ「上/下の枝と入れ替え」
  // 操作を出す（2026-08-28ユーザー要望：枝同士の順序を入れ替えられるようにする）
  const parentNode = (() => {
    const parentId = buildParentMap(root).get(selectedNode.id);
    return parentId ? findNode(root, parentId) : null;
  })();
  const siblingIndex = parentNode ? parentNode.children.findIndex((child) => child.id === selectedNode.id) : -1;
  const siblingCount = parentNode?.children.length ?? 0;

  // Lv.によって通常/OD版の選択が一方に固定される場合、手動入力がまだそれを満たしていなければ
  // 自動で引き上げる（始動条件のカウンター制約と同じ考え方。ユーザー確認済み）。経路上の
  // ノードすべてを対象にすることで、選択中のノード自身が末端（葉）でなくても機能する
  useEffect(() => {
    odNodesOnPath.forEach(({ node, constraint }) => {
      if (constraint === 'either') return;
      const forced = constraint === 'odOnly';
      if ((node.usesOD ?? false) !== forced) {
        setNodeUsesOD(characterId, treeId, node.id, forced);
      }
    });
  }, [odNodesOnPath, characterId, treeId, setNodeUsesOD]);

  // ダメージ/Dゲージ削り量/Dゲージ増減/SAゲージ増加は、対応するisXAutoSynced（既定true）が
  // trueの間、自動計算値に常に追従させる（技データを後から修正して計算結果が変わった時も
  // 反映されるようにする。2026-09-29ユーザー指摘：以前は「未入力の間だけ埋める」仕様だった
  // ため、一度埋まった値が技データの修正後も古いまま反映されなかった）。ユーザーが
  // BranchStatsEditor.tsxの入力欄で直接値を書き換えると、その時点でisXAutoSyncedがfalseに
  // なり以降は上書きされなくなる（「自動計算に戻す」ボタンでtrueに戻せる）。始動条件・SA締め
  // のように「この枝の前提そのもの」が変わった時は、BranchStatsEditor.tsx側の各ボタンが
  // 該当4フィールドをnull・isXAutoSyncedをtrueへ明示的に戻してから変更するため、ここへ
  // 戻ってきて新しい自動計算値で再度埋まる
  useEffect(() => {
    if (!showStatsEditor) return;
    const current = selectedNode.branchStats;
    const patch: Partial<ComboBranchStats> = {};
    if ((current?.isDamageAutoSynced ?? true) && (current?.damage ?? null) !== autoDamage) {
      patch.damage = autoDamage;
    }
    if (
      (current?.isOpponentDGaugeChipAutoSynced ?? true) &&
      (current?.opponentDGaugeChip ?? null) !== autoOpponentDGaugeChip
    ) {
      patch.opponentDGaugeChip = autoOpponentDGaugeChip;
    }
    if (
      (current?.isDGaugeChangeAutoSynced ?? true) &&
      (current?.dGaugeChange ?? null) !== autoDGaugeChange
    ) {
      patch.dGaugeChange = autoDGaugeChange;
    }
    if (
      (current?.isSaGaugeGainAutoSynced ?? true) &&
      (current?.saGaugeGain ?? null) !== autoSaGaugeChange
    ) {
      patch.saGaugeGain = autoSaGaugeChange;
    }
    if (Object.keys(patch).length === 0) return;
    setNodeBranchStats(characterId, treeId, selectedNode.id, {
      ...(current ?? DEFAULT_BRANCH_STATS),
      ...patch,
    });
  }, [
    showStatsEditor,
    selectedNode,
    autoDamage,
    autoOpponentDGaugeChip,
    autoDGaugeChange,
    autoSaGaugeChange,
    characterId,
    treeId,
    setNodeBranchStats,
  ]);

  const handleAddChild = () => {
    if (!newMoveName.trim()) return;

    const newId = addChildNode(
      characterId,
      treeId,
      selectedNode.id,
      newMoveName,
      newAttributes,
      newDisplayName,
    );
    if (newFinishingSpecialVariant) {
      setNodeBranchStats(characterId, treeId, newId, {
        ...DEFAULT_BRANCH_STATS,
        finishingSpecialVariant: newFinishingSpecialVariant,
      });
    }
    setNewMoveName('');
    setNewDisplayName(undefined);
    setNewAttributes([]);
    setNewFinishingSpecialVariant(undefined);
    selectNode(newId);
  };

  return (
    <>
      {showStatsEditor && (
        <AccordionSection
          title="コンボの情報（ダメージ・フレームなど）"
          icon="📊"
          count={countFilledBranchStats(selectedNode.branchStats)}
          isOpen={isStatsOpen}
          onToggle={() => {
            setIsStatsOpen((open) => {
              const next = !open;
              if (next && highlightComboInfo) onComboInfoOpened?.();
              return next;
            });
          }}
          highlight={highlightComboInfo}
        >
          <BranchStatsEditor
            value={selectedNode.branchStats}
            onChange={(next) => setNodeBranchStats(characterId, treeId, selectedNode.id, next)}
            requiredStartHitCondition={requiredStartHitCondition}
            damageBreakdown={damageBreakdown}
            priorComboSegments={priorComboSegments}
            dGaugeBreakdown={dGaugeBreakdown}
            dGaugeMinimumRequired={dGaugeMinimumRequired}
            saGaugeBreakdown={saGaugeBreakdown}
            // チュートリアルキャラクターだけ、未入力の項目を畳んで初見の情報量を減らす
            // （実キャラの編集画面では従来通り全項目を表示する。2026-08-27ユーザー指定）
            hideEmptyFields={characterId === TUTORIAL_CHARACTER_ID}
            highlightDamageFormula={highlightFormula}
            onFormulaOpened={onFormulaOpened}
            // 計算式を開いた時、チュートリアルキャラクターだけ計算の意味を一言添える
            // （2026-08-27ユーザー指定）
            showFormulaExplanation={characterId === TUTORIAL_CHARACTER_ID}
            finishingSuperArtMove={finishingSuperArtMove}
            finishingSuperArtOptions={finishingSuperArtOptions}
            odUsagesOnPath={odNodesOnPath.map(({ node, constraint }) => ({
              nodeId: node.id,
              label: node.displayName ?? node.moveName,
              constraint,
              usesOD: node.usesOD ?? false,
            }))}
            onChangeOdUsage={(nodeId, next) => setNodeUsesOD(characterId, treeId, nodeId, next)}
            starterMoveOptions={root.startingMoveOptions ?? []}
            starterMoveCancelInfo={starterMoveCancelInfo}
          />
        </AccordionSection>
      )}

      <AccordionSection
        title={
          <>
            <span style={{ whiteSpace: 'nowrap' }}>選択中のノードについて：</span>
            <span style={{ whiteSpace: 'nowrap' }}>{selectedNode.displayName || selectedNode.moveName}</span>
          </>
        }
        icon="✏️"
        count={selectedNode.attributes.length}
        isOpen={isEditorOpen}
        onToggle={() => setIsEditorOpen((open) => !open)}
        sticky
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={styles.fieldLabel}>技名（選んでから「変更する」で確定します）</div>
          <MoveNamePicker
            characterId={characterId}
            value={editedMoveName}
            onChange={(name, displayName, finishingSpecialVariant) => {
              setEditedMoveName(name);
              setEditedDisplayName(displayName);
              setEditedFinishingSpecialVariant(finishingSpecialVariant);
            }}
            precedingMoveName={parentNode?.moveName}
            activeFinishingSpecialVariant={editedFinishingSpecialVariant}
          />
          <button
            type="button"
            className="btn-primary justify-center"
            style={{ width: '100%' }}
            disabled={
              !editedMoveName.trim() ||
              (editedMoveName === selectedNode.moveName &&
                editedDisplayName === selectedNode.displayName &&
                !editedFinishingSpecialVariant)
            }
            onClick={() => {
              updateNodeMoveName(characterId, treeId, selectedNode.id, editedMoveName, editedDisplayName);
              if (editedFinishingSpecialVariant) {
                setNodeBranchStats(characterId, treeId, selectedNode.id, {
                  ...(selectedNode.branchStats ?? DEFAULT_BRANCH_STATS),
                  finishingSpecialVariant: editedFinishingSpecialVariant,
                });
              }
            }}
          >
            この技名に変更する
          </button>

          <div style={styles.sectionDivider} />
          <div style={styles.fieldLabel}>属性</div>

          <AttributeEditor
            value={selectedNode.attributes}
            onChange={(next) => setNodeAttributes(characterId, treeId, selectedNode.id, next)}
            specialNote={selectedNode.specialNote}
            onSpecialNoteChange={(note) =>
              updateNodeSpecialNote(characterId, treeId, selectedNode.id, note)
            }
            recordsBranchStats={!isNaturalStatsEndpoint ? (selectedNode.recordsBranchStats ?? false) : undefined}
            onRecordsBranchStatsChange={
              !isNaturalStatsEndpoint
                ? (checked) => setNodeRecordsBranchStats(characterId, treeId, selectedNode.id, checked)
                : undefined
            }
            isImpactMove={selectedNode.moveName === IMPACT_MOVE_NAME}
          />

          {odConstraint && (
            <OdLevelToggle
              constraint={odConstraint}
              usesOD={usesOD}
              onChange={(next) => setNodeUsesOD(characterId, treeId, selectedNode.id, next)}
              readOnly={false}
            />
          )}

          {selectedNodeHitTotal > 1 && (
            <HitSelectionToggle
              hitTotal={selectedNodeHitTotal}
              selectedHits={selectedNodeHitIndices}
              onChange={(next) => setNodeHitIndices(characterId, treeId, selectedNode.id, next)}
              readOnly={false}
            />
          )}

          <div style={styles.sectionDivider} />
          <div style={styles.fieldLabel}>その他</div>

          {siblingCount > 1 && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className="btn-ghost justify-center"
                style={{ flex: 1 }}
                disabled={siblingIndex <= 0}
                onClick={() => moveNode(characterId, treeId, selectedNode.id, parentNode!.id, siblingIndex - 1)}
              >
                ▲ 上の枝と入れ替え
              </button>
              <button
                type="button"
                className="btn-ghost justify-center"
                style={{ flex: 1 }}
                disabled={siblingIndex < 0 || siblingIndex >= siblingCount - 1}
                onClick={() => moveNode(characterId, treeId, selectedNode.id, parentNode!.id, siblingIndex + 2)}
              >
                ▼ 下の枝と入れ替え
              </button>
            </div>
          )}

          <button
            type="button"
            className="btn-ghost justify-center"
            style={{ width: '100%' }}
            onClick={() => startCopyMode(selectedNode.id)}
          >
            📋 ここからコピー開始
          </button>

          <button
            type="button"
            className="btn-ghost justify-center"
            style={{ width: '100%' }}
            onClick={() => startMatchMode(selectedNode.id)}
          >
            🔍 ここから一致箇所を探す
          </button>

          {matchedAnchorIds && (
            <button
              type="button"
              className="btn-ghost justify-center"
              style={{ width: '100%' }}
              onClick={() => startReplaceSelection(selectedNode.id)}
            >
              🔁 ここまでを置換内容にする
            </button>
          )}

          {groupName ? (
            <div style={{ display: 'grid', gap: 6 }}>
              <p style={styles.hint}>
                このノードは名前付きグループ「{groupName}」の一部です。木の表示ではまとめて折りたたまれることがあります。
              </p>
              <button
                type="button"
                className="btn-ghost justify-center"
                style={{ width: '100%' }}
                onClick={() => ungroupNode(characterId, treeId, selectedNode.id)}
              >
                🔗 グループ化を解除（このまとまり全体）
              </button>
              <button
                type="button"
                className="btn-ghost justify-center"
                style={{ width: '100%' }}
                title="このノードと、その先(同じグループが続く子孫)だけをグループから切り離す。手前の技はグループのまま残る"
                onClick={() => detachNodeFromGroup(characterId, treeId, selectedNode.id)}
              >
                ✂️ この技をグループから切り離す
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-ghost justify-center"
              style={{ width: '100%' }}
              onClick={() => startGroupMode(selectedNode.id)}
            >
              🔗 ここからグループ化開始
            </button>
          )}

          {selectedNode.id !== root.id && (
            <button
              type="button"
              style={styles.dangerButton}
              onClick={() => {
                const ok = window.confirm(
                  `「${selectedNode.moveName}」を削除しますか？\n子ノードもすべて削除されます。`,
                );
                if (ok) {
                  deleteNode(characterId, treeId, selectedNode.id);
                }
              }}
            >
              このノードを削除
            </button>
          )}
        </div>
      </AccordionSection>

      <AccordionSection
        title={
          <>
            <span style={{ whiteSpace: 'nowrap' }}>
              {`「${selectedNode.displayName || selectedNode.moveName}」に繋ぐ`}
            </span>
            {newMoveName && (
              <span style={{ whiteSpace: 'nowrap' }}>{`： ${newDisplayName || newMoveName}`}</span>
            )}
          </>
        }
        icon="➕"
        count={newAttributes.length}
        isOpen={isAddFormOpen}
        onToggle={() => setIsAddFormOpen((open) => !open)}
        sticky
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <MoveNamePicker
            characterId={characterId}
            value={newMoveName}
            onChange={(name, displayName, finishingSpecialVariant) => {
              setNewMoveName(name);
              setNewDisplayName(displayName);
              setNewFinishingSpecialVariant(finishingSpecialVariant);
            }}
            precedingMoveName={selectedNode.moveName}
            activeFinishingSpecialVariant={newFinishingSpecialVariant}
          />

          <AttributeEditor
            value={newAttributes}
            onChange={setNewAttributes}
            isImpactMove={newMoveName === IMPACT_MOVE_NAME}
          />

          <button
            type="button"
            className="btn-primary justify-center"
            style={{ width: '100%', marginTop: 10 }}
            disabled={!newMoveName.trim()}
            onClick={handleAddChild}
          >
            この技をノードとして追加
          </button>
        </div>
      </AccordionSection>
    </>
  );
}

const styles: Record<string, CSSProperties> = {
  // 開閉アニメーション用の外枠。widthをここで畳むことで、閉じている間はキャンバス側が
  // 全幅に広がる。中のasideは常にDRAWER_WIDTH固定のままtranslateX+opacityで
  // 「右へフェードアウト／右からフェードイン」させる（幅と位置、2つのtransitionを分離）。
  drawerWrapper: {
    flex: '0 0 auto',
    overflow: 'hidden',
    transition: 'width 0.24s ease',
    minHeight: 0,
    display: 'flex',
  },
  drawer: {
    flex: '0 0 auto',
    width: 400,
    borderLeft: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    transition: 'transform 0.24s ease, opacity 0.18s ease',
  },
  body: {
    flex: '1 1 auto',
    minHeight: 0,
    overflowY: 'auto',
    padding: 14,
    display: 'grid',
    gap: 16,
    alignContent: 'start',
  },
  hint: {
    fontSize: 12,
    lineHeight: 1.7,
    color: 'var(--text-muted)',
  },
  sectionDivider: {
    borderTop: '1px solid var(--border)',
    margin: '4px 0',
  },
  fieldLabel: {
    display: 'grid',
    gap: 4,
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--text-secondary)',
  },
  textInput: {
    fontSize: 12,
    padding: '8px 10px',
  },
  dangerButton: {
    border: '1px solid var(--accent-rose-border)',
    background: 'var(--accent-rose-bg)',
    color: 'var(--accent-rose-text)',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 800,
    cursor: 'pointer',
  },
  runRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
  },
  removeButton: {
    flex: '0 0 auto',
    width: 18,
    height: 18,
    borderRadius: '50%',
    border: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    color: 'var(--text-muted)',
    fontSize: 11,
    lineHeight: 1,
    cursor: 'pointer',
  },
  matchRow: {
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    cursor: 'pointer',
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--text-muted)',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-secondary)',
    cursor: 'pointer',
  },
};
