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
};

export default function AccordionSection({
  title,
  icon,
  count,
  isOpen,
  onToggle,
  children,
}: AccordionSectionProps) {
  return (
    <section style={styles.section}>
      <button
        type="button"
        style={{
          ...styles.sectionHeader,
          borderRadius: isOpen ? '13px 13px 0 0' : 13,
        }}
        onClick={onToggle}
      >
        <span style={styles.sectionTitle}>
          <span>{icon}</span>
          {title}
        </span>

        <span style={styles.sectionRight}>
          <span style={styles.countBadge}>{count}</span>
          <span style={styles.chevron}>{isOpen ? '⌃' : '⌄'}</span>
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

  chevron: {
    color: 'var(--text-secondary)',
    fontSize: 13,
  },

  sectionBody: {
    padding: 10,
  },
};
