// src/components/combo/SideDrawerPanel.tsx
// 常時開いた状態を想定するサイドドロワー（企画書9ページ）。
// 現時点では「属性付与/新規ノード追加」機能のみ実装する。
// 「枝の閲覧（条件での絞り込み）」は別フェーズで追加する。

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { useAppStore } from '../../store';
import { findNode } from '../../lib/tree';
import type { MoveNode, NodeAttribute } from '../../types';
import { AttributeEditor } from './AttributeEditor';
import { BranchStatsEditor } from './BranchStatsEditor';
import { MoveNamePicker } from './MoveNamePicker';
import AccordionSection from '../AccordionSection';

type Props = {
  characterId: string;
  treeId: string;
  root: MoveNode;
};

export function SideDrawerPanel({ characterId, treeId, root }: Props) {
  const selectedNodeId = useAppStore((state) => state.selectedNodeId);

  const selectedNode = selectedNodeId ? findNode(root, selectedNodeId) : null;

  return (
    <aside style={styles.drawer}>
      <div className="drawer-scroll" style={styles.body}>
        {selectedNode ? (
          // selectedNode.id をkeyにすることで、ノードを切り替えるたびに
          // NodeEditor をマウントし直し、新規追加フォームの入力状態を自然にリセットする
          <NodeEditor
            key={selectedNode.id}
            characterId={characterId}
            treeId={treeId}
            root={root}
            selectedNode={selectedNode}
          />
        ) : (
          <p style={styles.hint}>
            ツリー上のノードをクリックすると、ここで技の編集や新しい技の追加ができます。
          </p>
        )}

        <NewTreeSection characterId={characterId} />
      </div>
    </aside>
  );
}

function NewTreeSection({ characterId }: { characterId: string }) {
  const createComboTree = useAppStore((state) => state.createComboTree);
  const selectComboTree = useAppStore((state) => state.selectComboTree);

  const [newRootMoveName, setNewRootMoveName] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  const handleCreate = () => {
    if (!newRootMoveName.trim()) return;

    const newTreeId = createComboTree(characterId, newRootMoveName);
    setNewRootMoveName('');
    setIsOpen(false);
    selectComboTree(newTreeId);
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
        <MoveNamePicker characterId={characterId} value={newRootMoveName} onChange={setNewRootMoveName} />
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

  const [newMoveName, setNewMoveName] = useState('');
  const [newAttributes, setNewAttributes] = useState<NodeAttribute[]>([]);

  // 技名ピッカーはクリックした瞬間に選ばれてしまうため、選択中ノードの改名は
  // 「追加」フォームと同じくステージ（一時保存）してから明示的なボタンで確定する。
  // こうしないと、閲覧のつもりでボタンを押しただけでノードが改名されてしまう。
  const [editedMoveName, setEditedMoveName] = useState(selectedNode.moveName);

  // 「選択中のノード」「新規ノード追加」はそれぞれ個別に開閉できる。
  // ノードを切り替えるたびに（keyでの再マウントにより）両方とも開いた状態に戻る
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const [isAddFormOpen, setIsAddFormOpen] = useState(true);

  // 統計入力欄は「コンボ締め」「ガード」「空振り」のいずれかを選んだノードにのみ表示する
  const showStatsEditor = selectedNode.attributes.some((attribute) =>
    attribute.type === 'comboEnder' || attribute.type === 'guard' || attribute.type === 'whiff',
  );

  const handleAddChild = () => {
    if (!newMoveName.trim()) return;

    const newId = addChildNode(characterId, treeId, selectedNode.id, newMoveName, newAttributes);
    setNewMoveName('');
    setNewAttributes([]);
    selectNode(newId);
  };

  return (
    <>
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
            onChange={setEditedMoveName}
          />
          <button
            type="button"
            className="btn-primary justify-center"
            style={{ width: '100%' }}
            disabled={!editedMoveName.trim() || editedMoveName === selectedNode.moveName}
            onClick={() => updateNodeMoveName(characterId, treeId, selectedNode.id, editedMoveName)}
          >
            この技名に変更する
          </button>

          <label style={styles.fieldLabel}>
            特殊記入（「ディレイ〜F」など。基本は空欄でOK）
            <input
              type="text"
              className="input-field"
              style={styles.textInput}
              value={selectedNode.specialNote}
              onChange={(event) =>
                updateNodeSpecialNote(characterId, treeId, selectedNode.id, event.target.value)
              }
            />
          </label>

          <AttributeEditor
            value={selectedNode.attributes}
            onChange={(next) => setNodeAttributes(characterId, treeId, selectedNode.id, next)}
          />

          {showStatsEditor && (
            <div style={{ marginTop: 4 }}>
              <div style={styles.sectionTitle}>この枝の統計</div>
              <BranchStatsEditor
                value={selectedNode.branchStats}
                onChange={(next) => setNodeBranchStats(characterId, treeId, selectedNode.id, next)}
              />
            </div>
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
          <MoveNamePicker characterId={characterId} value={newMoveName} onChange={setNewMoveName} />

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
  sectionTitle: {
    fontSize: 12,
    fontWeight: 900,
    color: 'var(--text-primary)',
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
};
