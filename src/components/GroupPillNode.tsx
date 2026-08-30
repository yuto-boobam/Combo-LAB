// src/components/GroupPillNode.tsx
// 「共通区間を名前付きグループとして折りたたむ」機能で、折りたたみ中の区間を
// 1個のノードとして表示するための専用コンポーネント（企画: MoveNodeCircleの技名表示を
// グループ名表示に差し替えたもの）。
//
// 折りたたみ中は編集不可の純粋な表示物にする。クリックは展開のみを行い、選択編集・
// D&D先としての子ノード追加は受け付けない（展開すれば実ノードに対して通常通り行える）。
// 位置移動（自分をドラッグして並び替える）自体はグループ区間ごと正しく動くため許可する。

import { GROUP_PILL_WIDTH, NODE_DEFAULT_HEIGHT } from '../utils/nodeSizing';
import { applyManualLineBreaks } from '../utils/textDisplay';

type Props = {
  id: string;
  groupName: string;
  memberCount: number;
  onExpand: () => void;
  parentId: string | null;
  dragIndex: number;
  readOnly?: boolean;
  // コピー/グループ化モード中（自分は候補になり得ない）は展開操作を無効化し、薄く表示する
  isDisabledByOtherMode?: boolean;
  // 誘導ガイド（チュートリアル用）: trueの間、光るリングで囲んでクリックを促す
  // （MoveNodeCircleのisGuideTargetと同じ考え方。2026-08-30ユーザー要望）
  isGuideTarget?: boolean;
};

export function GroupPillNode({
  id,
  groupName,
  memberCount,
  onExpand,
  parentId,
  dragIndex,
  readOnly = false,
  isDisabledByOtherMode = false,
  isGuideTarget = false,
}: Props) {
  return (
    <div
      id={`node-${id}`}
      draggable={!readOnly && !isDisabledByOtherMode}
      onDragStart={(event) => {
        if (readOnly || isDisabledByOtherMode) return;
        event.dataTransfer.setData('application/json', JSON.stringify({ id, parentId, index: dragIndex }));
        event.dataTransfer.effectAllowed = 'move';
      }}
      onClick={isDisabledByOtherMode ? undefined : onExpand}
      title={isDisabledByOtherMode ? undefined : 'クリックして展開'}
      className="flex flex-col items-center justify-center select-none"
      style={{
        width: GROUP_PILL_WIDTH,
        minHeight: NODE_DEFAULT_HEIGHT,
        borderRadius: 'var(--radius-lg)',
        position: 'relative',
        background: 'var(--bg-elevated)',
        border: '2px dashed var(--accent)',
        padding: '8px 8px',
        textAlign: 'center',
        opacity: isDisabledByOtherMode ? 0.35 : 1,
        cursor: isDisabledByOtherMode ? 'default' : 'pointer',
        transition: 'border-color 0.15s, opacity 0.15s',
        ...(isGuideTarget ? { animation: 'tutorialGuidePulse 1.6s ease-in-out infinite' } : {}),
      }}
    >
      <span
        title={`${memberCount}個の技をまとめています`}
        style={{
          position: 'absolute',
          top: -5,
          left: -5,
          minWidth: 16,
          height: 16,
          padding: '0 3px',
          borderRadius: 999,
          background: 'var(--accent)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 900,
        }}
      >
        {memberCount}
      </span>

      <span style={{ fontSize: 12, lineHeight: 1 }}>🔗</span>

      <span
        style={{
          // 通常ノードの技名(10px)より読みにくいという指摘があったため、それより
          // 大きい11pxへ引き上げた（ピル自体の幅(GROUP_PILL_WIDTH=116px)は元々
          // 通常ノードより広く確保済みのため、この拡大で見切れやすくなることはない。
          // 2026-08-28ユーザー指摘：グループ名が小さく、画数の多い漢字がつぶれて見える）
          fontSize: 11,
          fontWeight: 800,
          color: 'var(--accent)',
          lineHeight: 1.3,
          // グループ名中の「｜」で明示的に改行できるようにする（MoveNodeCircle.tsxと同じ規約）
          whiteSpace: 'pre-line',
          wordBreak: 'break-word',
          overflow: 'hidden',
          display: '-webkit-box',
          WebkitLineClamp: 3,
          WebkitBoxOrient: 'vertical',
        }}
        title={groupName}
      >
        {applyManualLineBreaks(groupName)}
      </span>
    </div>
  );
}
