// src/utils/nodeDragController.ts
// ノード（技）・グループピル・クリップボードプレビューのドラッグ&ドロップを自前実装する。
//
// 以前はHTML5標準のドラッグ&ドロップ（draggable属性・dragstart/dragover/dropイベント）を
// 使っていたが、このアプリのキャンバスには常時 transform: scale(zoom) が掛かっており、
// CSSのtransformが掛かった要素の内側だと標準ドラッグ&ドロップの座標判定が不安定になる
// （ブラウザ側のよく知られた制約）ため、兄弟ノードを下から上へドラッグした時だけドロップが
// 一切受け付けられない不具合が起きていた（2026-09-30ユーザー報告）。
// パン機能（画面のどこでもドラッグで移動する機能）と同じ、mousedown/mousemove/mouseupの
// 通常のマウスイベントで自前実装することで、transformの影響を受けずに確実に動くようにする。
//
// ヒットテスト（今どのノードの上にいるか）は、各ノードのルート要素に付いている
// `id="node-${nodeId}"` をdocument.elementFromPointで探す方式にしている。この方式なら
// 通常ノード・ルートノード・グループピルのどれであっても、個別にonDrop等を実装しなくても
// 自動的にドロップ先として認識される。

import { useSyncExternalStore } from 'react';
import { useAppStore } from '../store';
import { findNodeInComboTrees } from './comboTreeSearch';
import { buildParentMap, findNode } from '../lib/tree';

export type NodeDragSource =
  | { kind: 'node'; id: string; parentId: string | null }
  | { kind: 'clipboard-paste' };

const DRAG_THRESHOLD_PX = 4;
const NODE_ID_PREFIX = 'node-';

// HTML5標準D&Dの頃は、ブラウザがドラッグ中の元要素を自動で半透明にし、MoveNodeCircle.tsxは
// onDragOver/onDragLeaveで「今カーソルが重なっているノード」をisDragOver状態として自前で
// 追跡してハイライトしていた。mousedown/mousemove/mouseupへ置き換えた際、この見た目の
// フィードバックの再現先が無いままドラッグ処理だけを移植してしまい、実際は正しく並び替わって
// いてもカーソル移動中は画面が何も変化しないため「ドラッグが効かない」ように見える不具合が
// あった（2026-09-30ユーザー報告）。ここでドラッグ中の状態を保持し、MoveNodeCircle.tsx・
// GroupPillNode.tsxが自分がドラッグ元/ドロップ先候補かをuseSyncExternalStoreで購読できる
// ようにする（Reactのstateではなく素朴なpub-subにしているのは、mousemoveのたびにComboTreePage
// 全体を再レンダーさせないため。実際に値が変わったノードだけが再レンダーされる）
//
// ドロップ先ノードのどこにカーソルがあるかで、意図する操作を3種類に分ける
// （2026-09-30ユーザー要望：同じ場所へ重ねれば子ノードに、上/下へ寄せれば兄弟ノードとして
// 挿入・並び替えできるようにしたい）。
// - 'child'  : ノードの中央付近 → ドロップ先の子として追加
// - 'before' : ノードの上寄り   → ドロップ先の直前に、ドロップ先と同じ親の兄弟として挿入
// - 'after'  : ノードの下寄り   → ドロップ先の直後に、ドロップ先と同じ親の兄弟として挿入
// 「兄弟として挿入」は、ドラッグ元が元々ドロップ先と同じ親を持つ兄弟だった場合は
// 並び替えに、別の場所（別の親・別の木）から持ってきた場合は「その位置に新しい兄弟として
// 差し込む」動作になる（どちらもstore.moveNodeが同じ経路で処理する）
export type DropZone = 'before' | 'after' | 'child';

type DragUiState = { sourceId: string | null; overNodeId: string | null; overZone: DropZone | null };
const EMPTY_DRAG_STATE: DragUiState = { sourceId: null, overNodeId: null, overZone: null };
let dragState: DragUiState = EMPTY_DRAG_STATE;
const dragStateListeners = new Set<() => void>();

function setDragState(next: DragUiState): void {
  if (
    next.sourceId === dragState.sourceId &&
    next.overNodeId === dragState.overNodeId &&
    next.overZone === dragState.overZone
  ) {
    return;
  }
  dragState = next;
  dragStateListeners.forEach((listener) => listener());
}

function subscribeDragState(listener: () => void): () => void {
  dragStateListeners.add(listener);
  return () => dragStateListeners.delete(listener);
}

/** このノードが今まさにドラッグされている最中（＝ドラッグ元）かどうか */
export function useIsDragSource(nodeId: string): boolean {
  return useSyncExternalStore(subscribeDragState, () => dragState.sourceId === nodeId);
}

/** 今、このノードの上にカーソルがあるドラッグ中なら、どの位置（子/直前/直後）を指しているか */
export function useDragOverZone(nodeId: string): DropZone | null {
  return useSyncExternalStore(subscribeDragState, () =>
    dragState.overNodeId === nodeId && dragState.sourceId !== nodeId ? dragState.overZone : null,
  );
}

// 以前のHTML5標準D&Dでは、ブラウザが自動でドラッグ中の要素の複製（ゴースト画像）を
// カーソルに追従させて表示していた。mousedownベースの自前実装ではそれが無いため、
// カーソル位置に追従する簡易プレビュー（ドラッグ元の技名/グループ名を表示するだけの
// 小さなラベル）を自前で描画して代替する（2026-09-30ユーザー要望）。
// 実体はNodeDragGhost.tsx（ComboTreePage.tsxに1つだけマウントする）
export type DragGhostState = { label: string; x: number; y: number } | null;
let dragGhostState: DragGhostState = null;
const dragGhostListeners = new Set<() => void>();

function setDragGhostState(next: DragGhostState): void {
  dragGhostState = next;
  dragGhostListeners.forEach((listener) => listener());
}

function subscribeDragGhostState(listener: () => void): () => void {
  dragGhostListeners.add(listener);
  return () => dragGhostListeners.delete(listener);
}

export function useDragGhostState(): DragGhostState {
  return useSyncExternalStore(subscribeDragGhostState, () => dragGhostState);
}

function findDropTargetElementAt(clientX: number, clientY: number): HTMLElement | null {
  const el = document.elementFromPoint(clientX, clientY);
  return el?.closest<HTMLElement>(`[id^="${NODE_ID_PREFIX}"]`) ?? null;
}

// ノード自身の上下25%ずつを「兄弟として挿入」、残りの中央50%を「子として追加」の当たり判定にする
const SIBLING_ZONE_RATIO = 0.25;

function computeDropZone(target: HTMLElement, clientY: number): DropZone {
  const rect = target.getBoundingClientRect();
  const ratio = rect.height === 0 ? 0.5 : (clientY - rect.top) / rect.height;
  if (ratio < SIBLING_ZONE_RATIO) return 'before';
  if (ratio > 1 - SIBLING_ZONE_RATIO) return 'after';
  return 'child';
}

/**
 * 実際のドロップ処理。dropZoneが'before'/'after'ならドロップ先と同じ親を持つ兄弟として
 * その位置に挿入する（ドラッグ元が元々別の親・別の木にいた場合も、その位置に差し込む形になる）。
 * 'child'（またはドロップ先がルートで兄弟を持てない）ならドロップ先の子として追加する。
 * 同じ親内での位置調整（インデックスのずれ）自体はstate.moveNode側の既存ロジックに任せる。
 * startNodeDrag内部から使うが、DOMイベントを介さずロジック単体でテストできるよう
 * exportしている（nodeDragController.test.ts参照）
 */
export function resolveDrop(
  characterId: string,
  source: NodeDragSource,
  targetId: string,
  dropZone: DropZone,
): void {
  const state = useAppStore.getState();
  const character = state.characters.find((item) => item.id === characterId);
  if (!character) return;

  const targetInfo = findNodeInComboTrees(character.comboTrees, targetId);
  if (!targetInfo) return;
  const { tree: targetTree } = targetInfo;

  if (source.kind === 'clipboard-paste') {
    state.pasteClipboard(characterId, targetTree.id, targetId);
    return;
  }

  if (source.id === targetId) return;

  const isTargetRoot = targetTree.root.id === targetId;
  if (dropZone !== 'child' && !isTargetRoot) {
    const targetParentId = buildParentMap(targetTree.root).get(targetId) ?? null;
    if (targetParentId) {
      const targetParentNode = findNode(targetTree.root, targetParentId);
      const targetIndex = targetParentNode?.children.findIndex((child) => child.id === targetId) ?? -1;
      if (targetParentNode && targetIndex !== -1) {
        const insertBefore = dropZone === 'before';
        state.moveNode(characterId, targetTree.id, source.id, targetParentId, targetIndex + (insertBefore ? 0 : 1));
        return;
      }
    }
  }

  // 'child'ゾーン、またはルートへのドロップ（ルートは兄弟を持てないため常に子として追加）
  state.moveNode(characterId, targetTree.id, source.id, targetId);
}

/**
 * ノード・グループピル・クリップボードプレビューのonMouseDownから呼ぶ。呼び出し側で
 * readOnly・無効モード等のガードを済ませてから呼ぶこと。mousedown時点ではまだ
 * 「ドラッグかクリックか」分からないため、しきい値以上動いた時点で初めて実際の
 * ドラッグとして扱う（クリック操作を誤って奪わないようにするため）。
 * previewLabelは、カーソルに追従するドラッグ中プレビュー（useDragGhostState/
 * NodeDragGhost.tsx参照）に表示する技名/グループ名など
 */
export function startNodeDrag(
  characterId: string,
  source: NodeDragSource,
  event: React.MouseEvent,
  previewLabel: string,
): void {
  if (event.button !== 0) return;
  // 背景のパン機能（ComboTreePage.tsxのhandleCanvasMouseDown）を誤発火させない
  event.stopPropagation();

  const startX = event.clientX;
  const startY = event.clientY;
  let hasMoved = false;
  const previousCursor = document.body.style.cursor;
  const previousUserSelect = document.body.style.userSelect;

  const handleMouseMove = (moveEvent: MouseEvent) => {
    if (!hasMoved) {
      if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < DRAG_THRESHOLD_PX) return;
      hasMoved = true;
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    }

    // ドラッグ中、今カーソルが重なっているノードとどの位置（子/直前/直後）かをハイライトする
    // （MoveNodeCircle.tsx・GroupPillNode.tsxのuseDragOverZone参照）。しきい値を超えて
    // 実際に動き始めた瞬間から、以後の全mousemoveで最新のホバー先に更新し続ける
    const target = findDropTargetElementAt(moveEvent.clientX, moveEvent.clientY);
    setDragState({
      sourceId: source.kind === 'node' ? source.id : null,
      overNodeId: target ? target.id.slice(NODE_ID_PREFIX.length) : null,
      overZone: target ? computeDropZone(target, moveEvent.clientY) : null,
    });
    // カーソルに追従するドラッグ中プレビュー（NodeDragGhost.tsx）の位置も同時に更新する
    setDragGhostState({ label: previewLabel, x: moveEvent.clientX, y: moveEvent.clientY });
  };

  const handleMouseUp = (upEvent: MouseEvent) => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = previousCursor;
    document.body.style.userSelect = previousUserSelect;
    setDragState(EMPTY_DRAG_STATE);
    setDragGhostState(null);

    if (!hasMoved) return; // しきい値未満の移動＝通常のクリックとして扱う（何もしない）

    // ドラッグ操作の直後に、mouseup対象への余計なクリック（選択トグル等）が
    // 発生しないよう、次のclickイベントだけを1回無効化する。何らかの理由でclickが
    // 一切発火しないケース（ブラウザ外でmouseupした等）に備え、一定時間後には
    // 監視を諦めて外す（無関係な次のクリックまで巻き込んで無効化し続けないため）
    const suppressClick = (clickEvent: MouseEvent) => {
      clickEvent.stopPropagation();
      clickEvent.preventDefault();
    };
    document.addEventListener('click', suppressClick, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', suppressClick, { capture: true }), 300);

    const target = findDropTargetElementAt(upEvent.clientX, upEvent.clientY);
    if (!target) return;
    resolveDrop(characterId, source, target.id.slice(NODE_ID_PREFIX.length), computeDropZone(target, upEvent.clientY));
  };

  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
}
