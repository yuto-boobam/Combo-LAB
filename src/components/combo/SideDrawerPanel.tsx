// src/components/combo/SideDrawerPanel.tsx
// 常時開いた状態を想定するサイドドロワー（企画書9ページ）。
// 現時点では「属性付与/新規ノード追加」機能のみ実装する。
// 「枝の閲覧（条件での絞り込み）」は別フェーズで追加する。

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore } from '../../store';
import { findNodeInComboTrees } from '../../utils/comboTreeSearch';
import type { ComboBranchStats, ComboTree, MoveNode, NodeAttribute } from '../../types';
import { AttributeEditor } from './AttributeEditor';
import { BranchStatsEditor } from './BranchStatsEditor';
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
  const clipboard = useAppStore((state) => state.clipboard);

  const selectedInfo = findNodeInComboTrees(comboTrees, selectedNodeId);

  return (
    <aside style={styles.drawer}>
      <div className="drawer-scroll" style={styles.body}>
        {!isGuest && matchedAnchorIds && (
          <MatchResultsPanel characterId={characterId} comboTrees={comboTrees} />
        )}

        {isGuest ? (
          <ReadOnlyNodeView selectedNode={selectedInfo?.node ?? null} />
        ) : copyModeAnchorId ? (
          <CopyModePanel characterId={characterId} comboTrees={comboTrees} anchorId={copyModeAnchorId} />
        ) : groupModeActive ? (
          <GroupModePanel characterId={characterId} comboTrees={comboTrees} />
        ) : matchModeAnchorId ? (
          <MatchModePanel characterId={characterId} comboTrees={comboTrees} />
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
            : '一覧から1つ選んで普通に編集してください。編集後、他の一致箇所へも反映できます。'}
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
  ].filter(Boolean).length;
}

function ReadOnlyNodeView({ selectedNode }: { selectedNode: MoveNode | null }) {
  const [isOpen, setIsOpen] = useState(true);
  const [isStatsOpen, setIsStatsOpen] = useState(true);

  if (!selectedNode) {
    return (
      <p style={styles.hint}>
        閲覧専用モードです。ツリー上のノードをクリックすると詳細が見られます。
      </p>
    );
  }

  const showStats =
    selectedNode.children.length === 0 ||
    selectedNode.attributes.some((attribute) => attribute.type === 'guard' || attribute.type === 'whiff');

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
          <BranchStatsEditor value={selectedNode.branchStats} onChange={() => {}} readOnly />
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
  const startCopyMode = useAppStore((state) => state.startCopyMode);
  const startGroupMode = useAppStore((state) => state.startGroupMode);
  const startMatchMode = useAppStore((state) => state.startMatchMode);
  const ungroupNode = useAppStore((state) => state.ungroupNode);
  const groupName = useAppStore((state) => {
    if (!selectedNode.groupId) return null;
    const character = state.characters.find((item) => item.id === characterId);
    return character?.namedComboGroups.find((group) => group.id === selectedNode.groupId)?.name ?? null;
  });

  const [newMoveName, setNewMoveName] = useState('');
  const [newDisplayName, setNewDisplayName] = useState<string | undefined>(undefined);
  const [newAttributes, setNewAttributes] = useState<NodeAttribute[]>([]);

  // 技名ピッカーはクリックした瞬間に選ばれてしまうため、選択中ノードの改名は
  // 「追加」フォームと同じくステージ（一時保存）してから明示的なボタンで確定する。
  // こうしないと、閲覧のつもりでボタンを押しただけでノードが改名されてしまう。
  const [editedMoveName, setEditedMoveName] = useState(selectedNode.moveName);
  const [editedDisplayName, setEditedDisplayName] = useState(selectedNode.displayName);

  // 「コンボの情報」「選択中のノード」「新規ノード追加」はそれぞれ個別に開閉できる。
  // ノードを切り替えるたびに（keyでの再マウントにより）すべて開いた状態に戻る
  const [isStatsOpen, setIsStatsOpen] = useState(true);
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const [isAddFormOpen, setIsAddFormOpen] = useState(true);

  // 統計入力欄は「葉ノード（子を持たない）」または「ガード」「空振り」を選んだノードに表示する
  const showStatsEditor =
    selectedNode.children.length === 0 ||
    selectedNode.attributes.some((attribute) => attribute.type === 'guard' || attribute.type === 'whiff');

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
    setNewMoveName('');
    setNewDisplayName(undefined);
    setNewAttributes([]);
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
            onChange={(name, displayName) => {
              setEditedMoveName(name);
              setEditedDisplayName(displayName);
            }}
          />
          <button
            type="button"
            className="btn-primary justify-center"
            style={{ width: '100%' }}
            disabled={
              !editedMoveName.trim() ||
              (editedMoveName === selectedNode.moveName && editedDisplayName === selectedNode.displayName)
            }
            onClick={() =>
              updateNodeMoveName(characterId, treeId, selectedNode.id, editedMoveName, editedDisplayName)
            }
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
            onChange={(name, displayName) => {
              setNewMoveName(name);
              setNewDisplayName(displayName);
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
