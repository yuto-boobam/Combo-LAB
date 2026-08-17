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
  MoveNode,
  NodeAttribute,
} from './types';
import { supabase } from './utils/supabaseClient';
import { createInitialCharacterRoster, createDefaultSuperArtMoves } from './data/characterRoster';
import { SHOWCASE_CHARACTERS } from './data/comboShowcase';
import { findNode, buildParentMap } from './lib/tree';
import { findNodeInComboTrees } from './utils/comboTreeSearch';

/** SA1〜SA3が未登録のキャラに補完する（この機能が実装される前に保存されたデータ向けの移行措置） */
function ensureDefaultSuperArtMoves(character: Character): Character {
  const hasSuperArtMove = character.moveList.some((move) => move.category === 'superArt');
  if (hasSuperArtMove) return character;

  return {
    ...character,
    moveList: [...character.moveList, ...createDefaultSuperArtMoves()],
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

  return {
    id: typeof move.id === 'string' && move.id ? move.id : makeId(),
    name: move.name,
    category,
    shortName: typeof move.shortName === 'string' && move.shortName ? move.shortName : undefined,
  };
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

      // ──「枝を選んでまとめてコピー」機能 ────────────────────────────────

      copyModeAnchorId: null,
      copySelectedIds: [],

      startCopyMode: (nodeId) => {
        set({ copyModeAnchorId: nodeId, copySelectedIds: [], selectedNodeId: null });
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
    }),
    {
      name: 'combo-lab-storage',

      partialize: (state) => ({
        theme: state.theme,
        isGuest: state.isGuest,
        characters: state.characters,
        selectedCharacterId: state.selectedCharacterId,
        collapsedNodeIds: state.collapsedNodeIds,
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
              ? persisted.characters.map(ensureDefaultSuperArtMoves)
              : currentState.characters,
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
