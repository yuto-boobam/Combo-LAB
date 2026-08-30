// src/components/combo/ComboRankingList.tsx
// 「一覧」表示モード: 全ての木を横断して、コンボの終端（branchStatsを持つノード）を
// 表形式で一覧し、ダメージ・各評価でソートできるようにする。木の実データ（並び順含む）には
// 一切手を付けない、表示専用の一覧（ユーザー要望: いつでも「元の並び順」に戻せる必要がある）。

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ComboTree, MoveDefinition } from '../../types';
import { useAppStore } from '../../store';
import {
  collectComboEndingSummaries,
  sortComboEndingSummaries,
  COMBO_RANKING_SORT_LABELS,
  type ComboRankingSortKey,
} from '../../utils/comboRanking';

const SORT_KEYS = Object.keys(COMBO_RANKING_SORT_LABELS) as ComboRankingSortKey[];

export function ComboRankingList({
  characterId,
  trees,
  moveList,
  onJumpTo,
}: {
  characterId: string;
  trees: ComboTree[];
  moveList: MoveDefinition[];
  onJumpTo: (nodeId: string) => void;
}) {
  const moveStatsDatabase = useAppStore((state) => state.moveStatsDatabase);
  const [starterFilter, setStarterFilter] = useState<string | null>(null);
  // null = ソートしない（=木の並び順のまま。ユーザー要望の「元の並び順に戻す」状態）
  const [sortKey, setSortKey] = useState<ComboRankingSortKey | null>(null);
  const [direction, setDirection] = useState<'asc' | 'desc'>('desc');

  const allSummaries = useMemo(
    () => collectComboEndingSummaries(trees, characterId, moveStatsDatabase, moveList),
    [trees, characterId, moveStatsDatabase, moveList],
  );

  const starterOptions = useMemo(
    () => Array.from(new Set(allSummaries.map((summary) => summary.starterLabel))),
    [allSummaries],
  );

  const filtered = starterFilter
    ? allSummaries.filter((summary) => summary.starterLabel === starterFilter)
    : allSummaries;

  const displayed = sortKey ? sortComboEndingSummaries(filtered, sortKey, direction) : filtered;

  if (allSummaries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-full">
        <div className="text-6xl">📊</div>
        <p style={{ color: 'var(--text-secondary)' }}>
          まだ評価対象のコンボがありません。木の末端（またはガード/空振り属性のノード）に
          「コンボの情報」を入力すると、ここに一覧できます。
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20, display: 'grid', gap: 16 }}>
      <div style={styles.toolbar}>
        <label style={styles.toolbarField}>
          始動技で絞り込み
          <select
            className="input-field"
            value={starterFilter ?? ''}
            onChange={(event) => setStarterFilter(event.target.value || null)}
          >
            <option value="">すべて</option>
            {starterOptions.map((label) => (
              <option key={label} value={label}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label style={styles.toolbarField}>
          並び替え
          <select
            className="input-field"
            value={sortKey ?? ''}
            onChange={(event) => setSortKey((event.target.value || null) as ComboRankingSortKey | null)}
          >
            <option value="">並び替えない（元の順番）</option>
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {COMBO_RANKING_SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </label>

        {sortKey && (
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setDirection((current) => (current === 'desc' ? 'asc' : 'desc'))}
          >
            {direction === 'desc' ? '高い順 ▼' : '低い順 ▲'}
          </button>
        )}

        {sortKey && (
          <button type="button" className="btn-ghost" onClick={() => setSortKey(null)}>
            ↺ 元の順番に戻す
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>始動技</th>
              <th style={styles.th}>経路</th>
              <th style={styles.th}>終端技</th>
              <th style={styles.th}>ダメージ</th>
              <th style={styles.th}>総合評価</th>
              <th style={styles.th}>ダメージ評価</th>
              <th style={styles.th}>Dゲージ評価</th>
              <th style={styles.th}>SAゲージ評価</th>
              <th style={styles.th}>運び評価</th>
              <th style={styles.th} />
            </tr>
          </thead>
          <tbody>
            {displayed.map((summary) => (
              <tr key={summary.key}>
                <td style={styles.td}>
                  {summary.starterLabel}
                  {!summary.isSelectedStarter && (
                    <span
                      title="この始動技はまだ「この枝の始動技」として選ばれていません。ダメージ・ゲージはこの始動技だった場合の参考値です（評価等の手入力項目は未記録）"
                      style={{ marginLeft: 4, fontSize: 10, color: 'var(--text-muted)' }}
                    >
                      (仮)
                    </span>
                  )}
                </td>
                <td style={{ ...styles.td, color: 'var(--text-secondary)' }}>
                  {summary.pathLabel || '(始動技自身)'}
                </td>
                <td style={styles.td}>{summary.endingLabel}</td>
                <td style={styles.td}>{summary.branchStats?.damage ?? '−'}</td>
                <td style={styles.td}>{summary.branchStats?.overallRating ?? '−'}</td>
                <td style={styles.td}>{summary.branchStats?.damageRating ?? '−'}</td>
                <td style={styles.td}>{summary.branchStats?.dGaugeRating ?? '−'}</td>
                <td style={styles.td}>{summary.branchStats?.saGaugeRating ?? '−'}</td>
                <td style={styles.td}>{summary.branchStats?.carryRating ?? '−'}</td>
                <td style={styles.td}>
                  <button type="button" className="btn-icon" title="このコンボへジャンプ" onClick={() => onJumpTo(summary.nodeId)}>
                    →
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  toolbar: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    gap: 12,
  },
  toolbarField: {
    display: 'grid',
    gap: 4,
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--text-secondary)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  },
  th: {
    textAlign: 'left',
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-muted)',
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '8px 10px',
    borderBottom: '1px solid var(--border)',
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
  },
};
