// src/components/combo/SideDrawerPanel.tsx
// 常時開いた状態を想定するサイドドロワー（企画書9ページ）。
// 現時点では「属性付与/新規ノード追加」機能のみ実装する。
// 「枝の閲覧（条件での絞り込み）」は別フェーズで追加する。

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore } from '../../store';
import { findNodeInComboTrees } from '../../utils/comboTreeSearch';
import type {
  ComboBranchStats,
  ComboTree,
  MoveDefinition,
  MoveNode,
  MoveStats,
  NodeAttribute,
} from '../../types';
import { AttributeEditor } from './AttributeEditor';
import { BranchStatsEditor } from './BranchStatsEditor';
import { OdLevelToggle } from './OdLevelToggle';
import { DEFAULT_BRANCH_STATS } from '../../utils/branchStatsDefaults';
import {
  calculateBranchDamage,
  calculateBranchDamageBreakdown,
  calculateBranchDGaugeChange,
  calculateBranchSaGaugeChange,
  calculateOdLevelConstraint,
  calculateRequiredStartHitCondition,
  findOdRelevantNodesOnPath,
} from '../../utils/comboGaugeCalc';
import { MoveNamePicker } from './MoveNamePicker';
import { ClipboardPreview } from './ClipboardPreview';
import { ChainPreviewRow } from './ChainPreviewRow';
import AccordionSection from '../AccordionSection';

type Props = {
  characterId: string;
  // キャラが持つすべての木（森）。選択中ノードがどの木に属するかはここから探す
  // （画面には全ての木が同時に表示されるため、木を1本に決め打ちできない）
  comboTrees: ComboTree[];
};

export function SideDrawerPanel({ characterId, comboTrees }: Props) {
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);
  const isGuest = useAppStore((state) => state.isGuest);
  const copyModeAnchorId = useAppStore((state) => state.copyModeAnchorId);
  const groupModeActive = useAppStore((state) => state.groupModeActive);
  const matchModeAnchorId = useAppStore((state) => state.matchModeAnchorId);
  const matchedAnchorIds = useAppStore((state) => state.matchedAnchorIds);
  const replaceModeAnchorId = useAppStore((state) => state.replaceModeAnchorId);
  const clipboard = useAppStore((state) => state.clipboard);

  const selectedInfo = findNodeInComboTrees(comboTrees, selectedNodeId);

  return (
    <aside style={styles.drawer}>
      <div className="drawer-scroll" style={styles.body}>
        {!isGuest && matchedAnchorIds && (
          <MatchResultsPanel characterId={characterId} comboTrees={comboTrees} />
        )}

        {isGuest ? (
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
          />
        ) : (
          <p style={styles.hint}>
            ツリー上のノードをクリックすると、ここで技の編集や新しい技の追加ができます。
          </p>
        )}

        {!isGuest && <NewTreeSection characterId={characterId} />}
        {!isGuest && clipboard && <ClipboardPreview />}
      </div>
    </aside>
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
          「{anchorNode?.moveName}」から続く枝をクリックして選択してください。選んだ枝は子孫ごとコピーされます。
        </p>

        <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
          {copySelectedIds.length}個の枝を選択中
        </p>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn-primary justify-center"
            style={{ flex: 1 }}
            disabled={copySelectedIds.length === 0}
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
    stats.saGaugeGain !== null,
    stats.damageRating !== null,
    stats.dGaugeRating !== null,
    stats.saGaugeRating !== null,
    stats.overallRating !== null,
    stats.plusFrame !== null,
    stats.isThrowRange,
    stats.canOkizeme,
    stats.startHitCondition !== null,
    stats.isJustParryStart,
    stats.isRushStart,
    stats.usesCA,
    stats.finishingSpecialVariant !== null,
    stats.includesEarlyDGaugeRecovery === false, // デフォルトはtrueなので、外した時だけ数える
    stats.finishingSuperArtName !== null,
  ].filter(Boolean).length;
}

// ノードがSA(superArt)で、特殊性能あり(hasSpecialVariant)なのにノード自体はまだ特殊性能を
// 選ばず技名だけ（例:「SA1」）で置かれている場合だけ、「使用した特殊性能」選択UIの対象にする
// （既に`SA1(Lv. 1)`のように特殊性能込みで確定しているノードは対象外）
function findFinishingSuperArtMove(
  moveList: MoveDefinition[],
  moveName: string,
): { name: string; specialVariantOptions: string[] } | null {
  const move = moveList.find(
    (item) => item.category === 'superArt' && item.hasSpecialVariant && item.name === moveName,
  );
  return move ? { name: move.name, specialVariantOptions: move.specialVariantOptions ?? [] } : null;
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

function ReadOnlyNodeView({
  characterId,
  root,
  selectedNode,
}: {
  characterId: string;
  root: MoveNode | null;
  selectedNode: MoveNode | null;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [isStatsOpen, setIsStatsOpen] = useState(true);
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
    selectedNode.attributes.some((attribute) => attribute.type === 'guard' || attribute.type === 'whiff') ||
    (selectedNode.recordsBranchStats ?? false);

  const autoSaGaugeChange = root
    ? calculateBranchSaGaugeChange(characterId, moveStatsDatabase, root, selectedNode.id)
    : null;
  const autoDGaugeChange = root
    ? calculateBranchDGaugeChange(characterId, moveStatsDatabase, moveList, root, selectedNode.id)
    : null;
  const autoDamage = root
    ? calculateBranchDamage(characterId, moveStatsDatabase, moveList, root, selectedNode.id)
    : null;
  const requiredStartHitCondition = root
    ? calculateRequiredStartHitCondition(root, selectedNode.id)
    : null;
  const finishingSuperArtMove = findFinishingSuperArtMove(moveList, selectedNode.moveName);
  const finishingSuperArtOptions = findFinishingSuperArtOptions(
    moveList,
    moveStatsDatabase[characterId]?.[selectedNode.moveName],
  );
  const odConstraint = calculateOdLevelConstraint(selectedNode, moveList);
  const effectiveUsesOD =
    odConstraint === 'odOnly' ? true : odConstraint === 'normalOnly' ? false : (selectedNode.usesOD ?? false);
  const odNodesOnPath = root ? findOdRelevantNodesOnPath(root, selectedNode.id, moveList) : [];

  return (
    <>
      {showStats && (
        <AccordionSection
          title="コンボの情報"
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
            autoSaGaugeChange={autoSaGaugeChange}
            autoDGaugeChange={autoDGaugeChange}
            autoDamage={autoDamage}
            finishingSuperArtMove={finishingSuperArtMove}
            finishingSuperArtOptions={finishingSuperArtOptions}
            odUsagesOnPath={odNodesOnPath.map(({ node, constraint }) => ({
              nodeId: node.id,
              label: node.displayName ?? node.moveName,
              constraint,
              usesOD: node.usesOD ?? false,
            }))}
            onChangeOdUsage={() => {}}
          />
        </AccordionSection>
      )}

      <AccordionSection
        title={`選択中のノード：${selectedNode.moveName}`}
        icon="👁️"
        count={selectedNode.attributes.length}
        isOpen={isOpen}
        onToggle={() => setIsOpen((open) => !open)}
      >
        <div style={{ display: 'grid', gap: 10 }}>
          <AttributeEditor
            value={selectedNode.attributes}
            onChange={() => {}}
            readOnly
            specialNote={selectedNode.specialNote}
            onSpecialNoteChange={() => {}}
          />

          {odConstraint && (
            <OdLevelToggle constraint={odConstraint} usesOD={effectiveUsesOD} onChange={() => {}} readOnly />
          )}
        </div>
      </AccordionSection>
    </>
  );
}

function NewTreeSection({ characterId }: { characterId: string }) {
  const createComboTree = useAppStore((state) => state.createComboTree);
  const selectNode = useAppStore((state) => state.selectNode);

  const [newRootMoveName, setNewRootMoveName] = useState('');
  const [newRootDisplayName, setNewRootDisplayName] = useState<string | undefined>(undefined);
  const [isOpen, setIsOpen] = useState(false);

  const handleCreate = () => {
    if (!newRootMoveName.trim()) return;

    createComboTree(characterId, newRootMoveName, newRootDisplayName);
    setNewRootMoveName('');
    setNewRootDisplayName(undefined);
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
        <MoveNamePicker
          characterId={characterId}
          value={newRootMoveName}
          onChange={(name, displayName) => {
            setNewRootMoveName(name);
            setNewRootDisplayName(displayName);
          }}
        />
        <button
          type="button"
          className="btn-primary justify-center"
          style={{ width: '100%' }}
          disabled={!newRootMoveName.trim()}
          onClick={handleCreate}
        >
          この技を始動技として新しい木を作る
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
}: {
  characterId: string;
  treeId: string;
  root: MoveNode;
  selectedNode: MoveNode;
}) {
  const selectNode = useAppStore((state) => state.selectNode);
  const addChildNode = useAppStore((state) => state.addChildNode);
  const deleteNode = useAppStore((state) => state.deleteNode);
  const updateNodeMoveName = useAppStore((state) => state.updateNodeMoveName);
  const updateNodeSpecialNote = useAppStore((state) => state.updateNodeSpecialNote);
  const setNodeAttributes = useAppStore((state) => state.setNodeAttributes);
  const setNodeBranchStats = useAppStore((state) => state.setNodeBranchStats);
  const setNodeUsesOD = useAppStore((state) => state.setNodeUsesOD);
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
  // 「常にコンボの締めで使う」SAの特殊性能を選んだ時だけ渡ってくる。技名変更確定時に
  // このノードのbranchStats.finishingSpecialVariantへ反映する
  const [editedFinishingSpecialVariant, setEditedFinishingSpecialVariant] = useState<
    string | undefined
  >(undefined);

  // 「コンボの情報」「選択中のノード」「新規ノード追加」はそれぞれ個別に開閉できる。
  // ノードを切り替えるたびに（keyでの再マウントにより）すべて開いた状態に戻る
  const [isStatsOpen, setIsStatsOpen] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const [isAddFormOpen, setIsAddFormOpen] = useState(true);

  // 統計入力欄は「葉ノード（子を持たない）」または「ガード」「空振り」を選んだノードに表示する。
  // recordsBranchStatsがtrueなら、それ以外のノードでも任意で表示できる（あえて途中で
  // 止めるケースを記録するための機能。詳細はtypes.tsのMoveNode.recordsBranchStats参照）
  const isNaturalStatsEndpoint =
    selectedNode.children.length === 0 ||
    selectedNode.attributes.some((attribute) => attribute.type === 'guard' || attribute.type === 'whiff');
  const showStatsEditor = isNaturalStatsEndpoint || (selectedNode.recordsBranchStats ?? false);

  const autoSaGaugeChange = calculateBranchSaGaugeChange(
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
  const autoDamage = calculateBranchDamage(
    characterId,
    moveStatsDatabase,
    moveList,
    root,
    selectedNode.id,
  );
  // 【一時的なデバッグ表示】ダメージ計算の食い違いを特定するための内訳。原因特定後に削除する
  const damageBreakdown = calculateBranchDamageBreakdown(
    characterId,
    moveStatsDatabase,
    moveList,
    root,
    selectedNode.id,
  );
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
          title="コンボの情報"
          icon="📊"
          count={countFilledBranchStats(selectedNode.branchStats)}
          isOpen={isStatsOpen}
          onToggle={() => setIsStatsOpen((open) => !open)}
        >
          <BranchStatsEditor
            value={selectedNode.branchStats}
            onChange={(next) => setNodeBranchStats(characterId, treeId, selectedNode.id, next)}
            requiredStartHitCondition={requiredStartHitCondition}
            autoSaGaugeChange={autoSaGaugeChange}
            autoDGaugeChange={autoDGaugeChange}
            autoDamage={autoDamage}
            damageBreakdown={damageBreakdown}
            finishingSuperArtMove={finishingSuperArtMove}
            finishingSuperArtOptions={finishingSuperArtOptions}
            odUsagesOnPath={odNodesOnPath.map(({ node, constraint }) => ({
              nodeId: node.id,
              label: node.displayName ?? node.moveName,
              constraint,
              usesOD: node.usesOD ?? false,
            }))}
            onChangeOdUsage={(nodeId, next) => setNodeUsesOD(characterId, treeId, nodeId, next)}
          />
        </AccordionSection>
      )}

      <AccordionSection
        title={`選択中のノード：${selectedNode.moveName}`}
        icon="✏️"
        count={selectedNode.attributes.length}
        isOpen={isEditorOpen}
        onToggle={() => setIsEditorOpen((open) => !open)}
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

          <AttributeEditor
            value={selectedNode.attributes}
            onChange={(next) => setNodeAttributes(characterId, treeId, selectedNode.id, next)}
            specialNote={selectedNode.specialNote}
            onSpecialNoteChange={(note) =>
              updateNodeSpecialNote(characterId, treeId, selectedNode.id, note)
            }
          />

          {!isNaturalStatsEndpoint && (
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={selectedNode.recordsBranchStats ?? false}
                onChange={(event) =>
                  setNodeRecordsBranchStats(characterId, treeId, selectedNode.id, event.target.checked)
                }
              />
              コンボ情報確認
            </label>
          )}

          {odConstraint && (
            <OdLevelToggle
              constraint={odConstraint}
              usesOD={usesOD}
              onChange={(next) => setNodeUsesOD(characterId, treeId, selectedNode.id, next)}
              readOnly={false}
            />
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
                🔗 グループ化を解除
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
        title={`「${selectedNode.moveName}」に技を繋げる${newMoveName ? `： ${newMoveName}` : ''}`}
        icon="➕"
        count={newAttributes.length}
        isOpen={isAddFormOpen}
        onToggle={() => setIsAddFormOpen((open) => !open)}
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
          />

          <AttributeEditor value={newAttributes} onChange={setNewAttributes} />

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
  drawer: {
    flex: '0 0 auto',
    width: 400,
    borderLeft: '1px solid var(--border)',
    background: 'var(--bg-surface)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
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
