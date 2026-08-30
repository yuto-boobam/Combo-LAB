// src/components/AccordionSection.tsx
// アイコン＋タイトル＋件数バッジ＋開閉シェブロンの、開閉可能なセクション見出し。
// サイドドロワー内の各リスト（今日が期限のタスク／優先的タスク／プロジェクト別 等）で共用する。

import type { CSSProperties, ReactNode } from 'react';

type AccordionSectionProps = {
  title: string;
  icon: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
  // trueの間、見出しをパルスさせて注意を引く（誘導ガイド向け。index.cssの
  // tutorialGuidePulseキーフレームを再利用。呼び出し側が「今ここを見てほしい」を判断する）
  highlight?: boolean;
  // trueの間、見出しをposition:stickyで固定し、このセクションの中身をスクロールしても
  // 「どのノード/どの操作についての見出しか」が常に見えるようにする（2026-08-30ユーザー指摘：
  // 選択中のノードと追加フォームの見出しが縦に長い内容の下にスクロールすると見えなくなり、
  // どちらの設定を触っているか分からなくなる）。ネストしたAccordionSection（例:
  // MoveNamePickerの多重入れ子）では同じスクロール祖先の中で複数のstickyヘッダーが
  // top:0を奪い合って重なってしまうため、呼び出し側が「入れ子されない・単独の見出し」
  // だと分かっている時だけ明示的に指定する（既定はfalseで従来通り）
  sticky?: boolean;
};

export default function AccordionSection({
  title,
  icon,
  count,
  isOpen,
  onToggle,
  children,
  highlight = false,
  sticky = false,
}: AccordionSectionProps) {
  return (
    <section style={styles.section}>
      <button
        type="button"
        style={{
          ...styles.sectionHeader,
          borderRadius: isOpen ? '13px 13px 0 0' : 13,
          ...(sticky ? { position: 'sticky', top: 0, zIndex: 1 } : {}),
          ...(highlight ? { animation: 'tutorialGuidePulse 1.6s ease-in-out infinite' } : {}),
        }}
        onClick={onToggle}
      >
        <span style={styles.sectionTitle}>
          <span>{icon}</span>
          {title}
        </span>

        <span style={styles.sectionRight}>
          <span style={styles.countBadge}>{count}</span>
          <span
            style={{
              ...styles.chevron,
              transform: isOpen ? 'rotate(180deg)' : 'none',
            }}
          >
            ⌄
          </span>
        </span>
      </button>

      {isOpen && <div style={styles.sectionBody}>{children}</div>}
    </section>
  );
}

const styles: Record<string, CSSProperties> = {
  section: {
    border: '1px solid var(--border)',
    borderRadius: 14,
    background: 'var(--bg-elevated)',
    // overflow:hiddenは使わない。CSS Grid内でoverflow:hiddenを持つ子は自動最小サイズが0になり、
    // 高さの計算がずれて中身が押しつぶされる不具合が起きた（入れ子のAccordionSection、
    // 特にMoveNamePickerのような6重入れ子構成で顕著）。角丸のクリップはヘッダー側の
    // border-radiusを合わせることで実現し、overflow:hiddenそのものを排除する。
  },

  sectionHeader: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
    border: 0,
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    padding: '9px 11px',
    minHeight: 40,
    cursor: 'pointer',
  },

  sectionTitle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 13,
    fontWeight: 900,
  },

  sectionRight: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
  },

  countBadge: {
    minWidth: 21,
    height: 19,
    borderRadius: 999,
    display: 'inline-grid',
    placeItems: 'center',
    background: 'rgba(59, 130, 246, 0.18)',
    color: 'var(--accent-blue-text)',
    fontSize: 11,
    fontWeight: 900,
  },

  // 開閉で別の文字（⌃/⌄）に差し替えると字形の重心が微妙にずれて位置が上下して見えるため、
  // 同じ文字を180度回転させるだけにする（BranchStatsEditor.tsxの「計算式」ボタンと同じ考え方）
  chevron: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    fontSize: 13,
    lineHeight: 1,
    transition: 'transform 0.15s',
  },

  sectionBody: {
    padding: 10,
  },
};
