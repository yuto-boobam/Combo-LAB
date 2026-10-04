// src/components/AccordionSection.tsx
// アイコン＋タイトル＋件数バッジ＋開閉シェブロンの、開閉可能なセクション見出し。
// サイドドロワー内の各リスト（今日が期限のタスク／優先的タスク／プロジェクト別 等）で共用する。

import type { CSSProperties, ReactNode } from 'react';

type AccordionSectionProps = {
  // 長い技名等で改行位置を指定したい呼び出し元向けに、文字列だけでなくReactNode
  // （<br/>を含むフラグメント等）も渡せるようにしている
  title: ReactNode;
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
  // trueの間、枠線・背景・件数バッジをteal系の配色にする。同じ画面に並ぶ他のAccordionSection
  // （選べる候補の一覧等）と見た目を区別したい時に使う（例: BranchStatsEditor.tsxの
  // 「この後に繋ぐこともある技」で、既に登録済みの技を、追加用のMoveNamePickerが示す
  // 技カテゴリの一覧と混同しないようにする。2026-10-04ユーザー指摘：両者が同じ見た目で
  // 紛らわしかった）
  accented?: boolean;
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
  accented = false,
}: AccordionSectionProps) {
  return (
    <section style={{ ...styles.section, ...(accented ? styles.sectionAccented : {}) }}>
      <button
        type="button"
        style={{
          ...styles.sectionHeader,
          borderRadius: isOpen ? '13px 13px 0 0' : 13,
          ...(sticky ? { position: 'sticky', top: 0, zIndex: 1 } : {}),
          ...(highlight ? { animation: 'tutorialGuidePulse 1.6s ease-in-out infinite' } : {}),
          ...(accented ? styles.sectionHeaderAccented : {}),
        }}
        onClick={onToggle}
      >
        <span style={styles.sectionTitle}>
          <span>{icon}</span>
          {/* titleが複数のReactNode（例: ラベルと技名を別々のwhiteSpace:nowrapなspan）で
              構成される場合、それぞれがsectionTitle（flexWrap:wrap）の独立したflexアイテムに
              なるため、収まらない時だけ技名側がまるごと次の行へ折り返る（アイテムの途中で
              千切れない）。折り返した行もflex-start基準で左端から始まる */}
          {title}
        </span>

        <span style={styles.sectionRight}>
          <span style={{ ...styles.countBadge, ...(accented ? styles.countBadgeAccented : {}) }}>{count}</span>
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

      {isOpen && <div style={{ ...styles.sectionBody, ...(accented ? styles.sectionBodyAccented : {}) }}>{children}</div>}
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

  // accented時、中立な配色（var(--border)・var(--bg-elevated)）からteal系に差し替える
  sectionAccented: {
    border: '1px solid var(--accent-teal-border)',
  },

  sectionHeader: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    // titleが2行になる場合（<br/>を含むReactNode）に、アイコン・件数バッジ・シェブロンが
    // 2行ぶんの高さの中央（＝行と行の間）に来て中途半端な位置に見えてしまっていたため、
    // 先頭行の高さに揃うよう上寄せにする（1行だけのtitleでは見た目に影響しない。
    // 2026-09-21ユーザー指摘）
    alignItems: 'flex-start',
    gap: 10,
    border: 0,
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    // <button>要素はブラウザ既定でtext-align:centerが当たるため、titleが2行になった時に
    // 短い方の行だけ中央寄せに見えてしまっていた。明示的に左揃えへ戻す
    // （2026-09-22ユーザー指摘）
    textAlign: 'left',
    padding: '9px 11px',
    minHeight: 40,
    cursor: 'pointer',
  },

  sectionHeaderAccented: {
    background: 'var(--accent-teal-bg)',
  },

  sectionTitle: {
    display: 'inline-flex',
    // 上のsectionHeaderと同じ理由。アイコンをtitleの1行目と揃える
    alignItems: 'flex-start',
    // titleが「ラベル＋技名」のように複数のReactNodeで構成される場合、収まらない時だけ
    // 技名側を折り返す（呼び出し側でそれぞれをwhiteSpace:nowrapにして、技名の途中で
    // 折り返されないようにする。折り返した2行目もflex-start基準で左端から始まる）
    flexWrap: 'wrap',
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

  countBadgeAccented: {
    background: 'var(--accent-teal-bg)',
    color: 'var(--accent-teal-text)',
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

  sectionBodyAccented: {
    background: 'var(--accent-teal-bg)',
  },
};
