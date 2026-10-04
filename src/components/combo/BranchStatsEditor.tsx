// src/components/combo/BranchStatsEditor.tsx
// 枝（コンボ）の統計情報の編集UI。葉ノード、またはガード/空振り属性を持つノードで使う
// （表示するかどうかの判断は呼び出し側で行う。src/components/combo/SideDrawerPanel.tsx を参照）。

import { useEffect, useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import type { BranchStartHitCondition, ComboBranchStats, FinishingMoveOption, Rating5 } from '../../types';
import type { DamageBreakdown, DamageBreakdownEntry, GaugeStep, OdLevelConstraint } from '../../utils/comboGaugeCalc';
import { DEFAULT_BRANCH_STATS, createDefaultFinishingMoveOption } from '../../utils/branchStatsDefaults';
import { calculateWeightedOverallRating } from '../../utils/overallRating';
import {
  expandStarterMoveOptions,
  parseStarterMoveChain,
  serializeStarterMoveOptions,
} from '../../utils/starterMoveOptions';
import { OdLevelToggle } from './OdLevelToggle';
import { MoveNamePicker } from './MoveNamePicker';
import AccordionSection from '../AccordionSection';

export type OdUsageOnPath = {
  nodeId: string;
  label: string;
  constraint: OdLevelConstraint;
  usesOD: boolean;
};

type Props = {
  value: ComboBranchStats | null;
  onChange: (next: ComboBranchStats | null) => void;
  readOnly?: boolean;
  // 「この後に繋ぐこともある技」欄（MoveNamePicker）で使う。readOnlyの間は未指定でもよい
  // （ピッカー自体を表示しないため）
  characterId?: string;
  // 選択中ノード自身の技名。「この後に繋ぐこともある技」ピッカーのprecedingMoveName
  // （派生技の直前技チェック）に渡す。readOnlyの間は未指定でもよい
  ownMoveName?: string;
  // root〜このノードの経路上にある「カウンター」「パニッシュカウンター」属性から求まる、
  // この枝が繋がるために最低限必要な始動条件（例:「カウンター以上でないと繋がらない」
  // ノードが経路上にあれば'カウンター'）。null = 制約なし
  requiredStartHitCondition?: BranchStartHitCondition | null;
  // ダメージ計算式の内訳。「計算式」ボタンを押した時だけ展開して見せる
  // （普段は閉じておく。2026-08-26ユーザー指定：計算根拠を見せる正式な機能として採用）
  damageBreakdown?: DamageBreakdown | null;
  // このノードより前に「コンボ終了」で区切られた区間（1本目のコンボ等）の内訳。
  // 古い順に並ぶ。空配列（デフォルト）＝このノードの経路にコンボ終了が無い＝今まで通り
  // 「ダメージ」欄1つだけの見た目のまま（2026-09-30ユーザー要望：起き攻めセットアップ後の
  // 2本目のコンボを別計算にしたうえで、末端ノードでは両方のダメージ・計算式を見たい）
  priorComboSegments?: DamageBreakdown[];
  // 誘導ガイド（チュートリアル用）: trueの間、「ダメージ・計算式」欄をスポットライトで
  // 光らせ、「計算式」を開くよう誘導する（このコンポーネント自身はチュートリアルの
  // 手順を知らず、呼び出し側が段階を判断してここへ渡すだけ。highlightComboInfoと同じ考え方）
  highlightDamageFormula?: boolean;
  onFormulaOpened?: () => void;
  // trueの間、計算式を開いた時に「ストリートファイター6と同じ補正でダメージを計算」の
  // 一言を添える（チュートリアルキャラクター限定。2026-08-27ユーザー指定）
  showFormulaExplanation?: boolean;
  // Dゲージ増減欄の「合計⇄内訳」表示切替用。1ノードずつの増減（例:「+200→+200→-20000」）。
  // ダメージ/Dゲージ削り量/Dゲージ増減/SAゲージ増加の各欄は、未入力の間だけ呼び出し側
  // （SideDrawerPanel.tsx）が自動計算値でそのまま埋めるため、このコンポーネント側は
  // 「自動計算：X」「この値を使う」のような案内は持たない（2026-08-26ユーザー指定：
  // 自動で埋めて、間違っていたら直接修正する運用に統一）。totalExcludingEarlyRecoveryは
  // 「最初にゲージを消費する技より前の回復」を除いた場合の参考値。totalと異なる時だけ、
  // 合計欄に「-25500(-27500)」のように括弧書きで併記する
  dGaugeBreakdown?: { steps: GaugeStep[]; total: number; totalExcludingEarlyRecovery: number } | null;
  // SAゲージ増加欄の「合計⇄内訳」表示切替用。dGaugeBreakdownと同じ考え方（早期回復の概念が
  // 無いためtotalExcludingEarlyRecoveryは持たない）
  saGaugeBreakdown?: { steps: GaugeStep[]; total: number } | null;
  // このコンボを最後まで遂行するために最低限必要な開始時Dゲージ量。SF6は「ゲージが0でなければ
  // 消費行動を発動できる」仕様（名目コストを満額持っている必要はない）のため、単純な消費量の
  // 合計ではなくシミュレーションで求めた値（詳細はcomboGaugeCalc.tsのcalculateBranchDGaugeMinimumRequired
  // 参照）。0＝消費行動が経路上に無い、null＝技データ未登録
  dGaugeMinimumRequired?: number | null;
  // このノードがSA(superArt・特殊性能あり)で、まだ特殊性能を選ばず技名だけ（例:「SA1」）
  // で置かれている場合のみ渡される。渡された場合、このコンポーネントは「使用した特殊性能」を
  // 選ばせるUIを表示し、finishingSpecialVariantに保存する（呼び出し側の判定はSideDrawerPanel参照）
  finishingSuperArtMove?: { name: string; specialVariantOptions: string[] } | null;
  // value.finishingMoveOptions（登録済みの「この後に繋ぐこともある技」）それぞれについて、
  // その技を追加した場合のダメージを計算済みの状態で渡す（配列のインデックスが
  // finishingMoveOptionsと対応する）。呼び出し側（SideDrawerPanel.tsx）が
  // comboGaugeCalc.tsのcalculateBranchDamage経由で計算する（このコンポーネント自身は
  // 技データベースを持たないため計算できない）。未指定の間は各技の横にダメージを表示しない
  finishingMoveOptionPreviews?: { option: FinishingMoveOption; damage: number | null }[];
  // root〜このノードの経路上にある「OD版はレベル+1相当の性能になる」技（ビーム等）の一覧。
  // 末端ノードの「コンボの情報」欄から、経路の途中にあるノードのOD使用もまとめて確認・
  // 変更できるようにする（選択中のノードを1つずつ辿らなくても、最終的なゲージを見ている
  // 画面から直接調整できるようにしてほしい、というユーザー要望）
  odUsagesOnPath?: OdUsageOnPath[];
  onChangeOdUsage?: (nodeId: string, next: boolean) => void;
  // trueの間、未入力（null/false/未選択）の項目は表示自体を省く。実際の編集画面では
  // 「空の入力欄が編集入り口になる」ため常にfalseで使うが、チュートリアルキャラクターの
  // 「コンボの情報」欄は初見の情報量を減らす目的で使う（呼び出し側のSideDrawerPanel.tsxが
  // characterIdで判定して渡す。2026-08-27ユーザー指定）
  hideEmptyFields?: boolean;
  // root（始動技）がMoveNode.startingMoveOptionsを持つ「汎用コンボ」の場合にのみ渡される
  // 候補一覧。渡された場合、この枝で実際に使った始動技を選ばせるUIを表示する
  // （選ぶまではダメージ・ゲージの自動計算が行われない。src/utils/comboGaugeCalc.ts参照）
  starterMoveOptions?: string[][];
  // 選択済みの始動技（startingMoveNamesの最後の技）が複数ヒット技で、かつキャンセル可能な
  // 段がある場合にのみ渡される。渡された場合、「何段目でキャンセルしたか」を選ばせるUIを表示する
  starterMoveCancelInfo?: { cancelableHitIndices: number[] } | null;
};

// 「通常」ボタンは出さない（カウンター/パニカンをどちらもオフにすれば同じ状態に戻せるため）。
// パニカンは表示スペースが空いた分、フルの「パニッシュカウンター」表記にする
const START_HIT_CONDITIONS: BranchStartHitCondition[] = ['カウンター', 'パニカン'];

const START_HIT_CONDITION_LABELS: Record<BranchStartHitCondition, string> = {
  通常: '通常',
  カウンター: 'カウンター',
  パニカン: 'パニッシュカウンター',
};

const START_HIT_CONDITION_RANK: Record<BranchStartHitCondition, number> = {
  通常: 0,
  カウンター: 1,
  パニカン: 2,
};

/**
 * 計算式の内訳（「計算式」ボタンの中身）で、各段の技名の後ろに添える注記を組み立てる。
 * 以前は`modifier="${entry.modifierText || 'なし'}"`のように、補正が無い段にも
 * 毎回`modifier=""`という表記が付き、専用の補正が無いことを示すためだけの「なし」も
 * 機械的な印象で読みにくいとの指摘があった（2026-09-30ユーザー指摘）。
 * `modifier=`という接頭辞は外して補正名だけを表示し、補正が何も無い段（modifierTextが
 * 空でラッシュ後でもない）は注記自体を出さないようにする
 */
export function formatDamageEntryNote(entry: DamageBreakdownEntry): string {
  if (entry.isSystemAction) return '敵にヒットしない行動のため補正対象外';

  const parts: string[] = [];
  if (entry.modifierText) parts.push(entry.modifierText);
  if (entry.isRush) parts.push('ラッシュ後');
  const base = parts.join('／');

  if (entry.isSuperArt && entry.minDamageGuaranteePercent !== null) {
    if (entry.percent === entry.minDamageGuaranteePercent) {
      return `SA最低保証${entry.minDamageGuaranteePercent}%が適用（自然計算が下回った）`;
    }
    const guaranteeNote = `（SA最低保証${entry.minDamageGuaranteePercent}%は未到達）`;
    return base ? `${base}${guaranteeNote}` : guaranteeNote;
  }

  return base;
}

export function BranchStatsEditor({
  value,
  onChange,
  readOnly = false,
  characterId,
  ownMoveName,
  requiredStartHitCondition = null,
  damageBreakdown = null,
  priorComboSegments = [],
  highlightDamageFormula = false,
  onFormulaOpened,
  showFormulaExplanation = false,
  dGaugeBreakdown = null,
  saGaugeBreakdown = null,
  dGaugeMinimumRequired = null,
  finishingSuperArtMove = null,
  finishingMoveOptionPreviews = [],
  odUsagesOnPath = [],
  onChangeOdUsage,
  hideEmptyFields = false,
  starterMoveOptions = [],
  starterMoveCancelInfo = null,
}: Props) {
  const stats = value ?? DEFAULT_BRANCH_STATS;
  // ショーケース（ゲスト向け）データ等、finishingMoveOptions追加前の形式のまま保存されている
  // branchStatsはこのフィールドを持たない(undefined)ことがあるため、他の旧フィールドと同じく
  // ここで安全に初期化する（stats.finishingMoveOptionsを直接参照しない）
  const finishingMoveOptions = stats.finishingMoveOptions ?? [];
  // 計算式の内訳は普段は閉じておき、興味を持った人がボタンを押した時だけ見せる
  const [isFormulaOpen, setIsFormulaOpen] = useState(false);
  // Dゲージ増減／SAゲージ増加欄の表示モード。falseは合計（従来通りの編集可能な数値入力）、
  // trueは1ノードずつの内訳（読み取り専用のテキスト表示に切り替わる）
  const [isDGaugeBreakdownMode, setIsDGaugeBreakdownMode] = useState(false);
  const [isSaGaugeBreakdownMode, setIsSaGaugeBreakdownMode] = useState(false);
  // 「この後に繋ぐこともある技」を新しく1件追加するための下書き。null＝追加中でない
  // （「+ 技を追加」を押すとnameが空文字の下書きを作る）。MoveNamePickerは「技を選ぶ→
  // 特殊性能を選ぶ」のように複数回onChangeが呼ばれることがあるため（例: Lv.違いのSA）、
  // 選ぶたびに即配列へ確定させず、ここで保持してから「追加する」ボタンで初めて配列へ積む
  // （そうしないと1回目のonChangeで即座にピッカーを閉じてしまい、特殊性能を選ぶ前に
  // 確定してしまう）
  const [draftFinishingMove, setDraftFinishingMove] = useState<FinishingMoveOption | null>(null);
  // 「この後に繋ぐこともある技」欄全体の開閉。普段は畳んでおき、他のアコーディオンと
  // 同じく必要な時だけ開く（2026-10-04ユーザー要望：この欄自体も開閉できるようにしたい）
  const [isFinishingMoveSectionOpen, setIsFinishingMoveSectionOpen] = useState(false);

  // 「この枝の始動技」の自由記入欄（一覧に無い経由技をその場で入力するため）の下書き。
  // 確定前の入力途中の文字列（例:「強P→」）をそのまま保持したいので、値そのもの
  // （stats.startingMoveNames）とは別にローカルで持ち、blur時にだけ反映する
  // （矢印を打った直後に即座に反映すると、末尾の空トークンが消えて表示が巻き戻ってしまうため）。
  // プリセットボタンを押した時もこの下書きを合わせて更新する（onClick内でsetCustomStarterDraftも呼ぶ）
  const [customStarterDraft, setCustomStarterDraft] = useState(() =>
    serializeStarterMoveOptions(stats.startingMoveNames ? [stats.startingMoveNames] : []),
  );

  // starterMoveOptionsは見出し表示用にコンパクトな「強P/4強P」表記のまま保持されているため、
  // 実際に1つ選ばせるこのピッカーでだけ具体的な組み合わせへ展開する（expandStarterMoveOptions参照）
  const expandedStarterMoveOptions = useMemo(
    () => expandStarterMoveOptions(starterMoveOptions),
    [starterMoveOptions],
  );

  // 旧データ（startingMoveCancelHitIndex追加前に保存されたbranchStats）はundefinedのままのため、
  // nullと同じ「キャンセルしていない」扱いに正規化する
  const starterMoveCancelHitIndex = stats.startingMoveCancelHitIndex ?? null;

  const update = (patch: Partial<ComboBranchStats>) => {
    onChange({ ...stats, ...patch });
  };

  // finishingMoveOptionsのうち1件（登録済みの「この後に繋ぐこともある技」）だけを更新する。
  // 技ごとの評価・プラスフレーム等はこの技専用の項目であり、ノード自身の評価には影響しない
  const updateFinishingMoveOption = (index: number, patch: Partial<FinishingMoveOption>) => {
    update({
      finishingMoveOptions: finishingMoveOptions.map((option, i) =>
        i === index ? { ...option, ...patch } : option,
      ),
    });
  };

  // 始動条件・SA締めのように、この枝のダメージ・ゲージ計算の前提そのものを変える変更は、
  // ダメージ/Dゲージ削り量/Dゲージ増減/SAゲージ増加の4欄も明示的に未入力（null）へ戻し、
  // 自動追従（isXAutoSynced）を再度trueにする。すでに手動で固定していた値もここでリセット
  // 対象になる点は、前提が変わった以上その値自体の根拠も変わっているため妥当
  // （2026-08-28ユーザー報告：カウンター/SA締めを変えてもダメージ欄が追従しない不具合の修正）
  const updateAndResetAutoFields = (patch: Partial<ComboBranchStats>) => {
    onChange({
      ...stats,
      ...patch,
      damage: null,
      opponentDGaugeChip: null,
      dGaugeChange: null,
      saGaugeGain: null,
      isDamageAutoSynced: true,
      isOpponentDGaugeChipAutoSynced: true,
      isDGaugeChangeAutoSynced: true,
      isSaGaugeGainAutoSynced: true,
    });
  };

  // ジャストパリィ始動は常にパニッシュカウンター始動を伴う（実機仕様、パニッシュカウンターの
  // トグルとは別にオン/オフできるが、始動条件としては常に「パニッシュカウンター以上」を要求する）
  const justParryRequiredCondition: BranchStartHitCondition | null = stats.isJustParryStart
    ? 'パニカン'
    : null;

  // 経路上に「カウンター以上でないと繋がらない」ノードがある場合、およびジャストパリィ始動の
  // 場合、始動条件はそれ以上でなければならない（両方あればランクが高い方を採用）。
  // 手動入力がまだそれを満たしていなければ表示・実データの両方を自動で引き上げる
  // （「通常」を選べる状態のまま放置されないようにするための仕様。ユーザー確認済み）
  const effectiveRequiredCondition: BranchStartHitCondition | null =
    !requiredStartHitCondition
      ? justParryRequiredCondition
      : !justParryRequiredCondition
        ? requiredStartHitCondition
        : START_HIT_CONDITION_RANK[requiredStartHitCondition] >=
            START_HIT_CONDITION_RANK[justParryRequiredCondition]
          ? requiredStartHitCondition
          : justParryRequiredCondition;

  const satisfiesRequirement =
    !effectiveRequiredCondition ||
    (stats.startHitCondition !== null &&
      START_HIT_CONDITION_RANK[stats.startHitCondition] >= START_HIT_CONDITION_RANK[effectiveRequiredCondition]);
  const effectiveStartHitCondition = satisfiesRequirement
    ? stats.startHitCondition
    : effectiveRequiredCondition;

  useEffect(() => {
    if (readOnly || satisfiesRequirement || !effectiveRequiredCondition) return;
    updateAndResetAutoFields({ startHitCondition: effectiveRequiredCondition });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, satisfiesRequirement, effectiveRequiredCondition]);

  // 総合評価は、他の6項目（ダメージ/Dゲージ/SAゲージ/運び/起き攻め内容/難易度）からの
  // 加重平均（src/utils/overallRating.ts）に、isOverallRatingAutoSynced（既定true）が
  // trueの間、常に追従させる（damage等の4欄と同じ考え方。2026-10-02ユーザー要望：
  // 総合評価を他の評価と独立に毎回手入力するのではなく、既定値として自動計算したい）。
  // ユーザーが総合評価を直接選ぶと、その時点でisOverallRatingAutoSyncedがfalseになり
  // 以降は上書きされなくなる（「自動計算に戻す」ボタンでtrueに戻せる）
  const autoOverallRating = calculateWeightedOverallRating(stats);
  useEffect(() => {
    if (readOnly) return;
    if (!(stats.isOverallRatingAutoSynced ?? true)) return;
    if (stats.overallRating === autoOverallRating) return;
    update({ overallRating: autoOverallRating });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, stats.isOverallRatingAutoSynced, stats.overallRating, autoOverallRating]);

  // hideEmptyFields時、各セクションを「未入力なら畳む」判定。実際の編集画面では
  // 常にfalse相当（空欄も編集の入り口として必要）なので通常は全て表示される
  const showPlusFrameSection =
    !hideEmptyFields || stats.plusFrame !== null || stats.opponentDGaugeChip !== null;
  const showRatingGrid =
    !hideEmptyFields ||
    [
      stats.damageRating,
      stats.dGaugeRating,
      stats.saGaugeRating,
      stats.carryRating,
      stats.okizemeRating,
      stats.difficultyRating,
    ].some((rating) => rating !== null);
  const showOverallRating = !hideEmptyFields || stats.overallRating !== null;
  const showThrowRange = !hideEmptyFields || stats.isThrowRange;
  const showOkizeme = !hideEmptyFields || stats.canOkizeme;
  const showStartCondition =
    !hideEmptyFields ||
    stats.startHitCondition !== null ||
    stats.isJustParryStart ||
    !!requiredStartHitCondition;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {/* コンボ/グループの締めのノード（このコンポーネント自体がそこにしか表示されない）を
          お気に入り登録できるようにする。評価項目ではなく単独の目印なので、一番目立つ
          最上部に置く（ユーザー要望） */}
      <button
        type="button"
        onClick={() => update({ isFavorite: !stats.isFavorite })}
        disabled={readOnly}
        style={{
          ...styles.favoriteButton,
          borderColor: stats.isFavorite ? 'var(--accent-amber-border)' : 'var(--border)',
          background: stats.isFavorite ? 'var(--accent-amber-bg)' : 'var(--bg-elevated)',
          color: stats.isFavorite ? 'var(--accent-amber-text)' : 'var(--text-secondary)',
          cursor: readOnly ? 'default' : 'pointer',
        }}
      >
        {stats.isFavorite ? '★ お気に入り登録済み' : '☆ お気に入りに登録'}
      </button>

      {/* 「コンボ終了」で区切られた、このノードより前の区間（1本目・2本目…のコンボ）の
          ダメージと計算式。区間が無い（＝コンボ終了を使っていない従来通りのコンボ）場合は
          何も表示しない（2026-09-30ユーザー要望） */}
      {priorComboSegments.length > 0 && (
        <div style={{ display: 'grid', gap: 10 }}>
          {priorComboSegments.map((segment, index) => (
            <PriorComboSegmentBlock
              key={index}
              label={`コンボ${index + 1}`}
              breakdown={segment}
              showFormulaExplanation={showFormulaExplanation}
            />
          ))}
          <div style={styles.sectionDivider} />
        </div>
      )}

      {/* ダメージ・計算式を囲んで誘導する。ドロワーは overflow:hidden/auto な祖先を
          複数持つため、画面全体を暗くする.tutorial-spotlight（box-shadowの9999px拡散）は
          ドロワーの外まで届かずクリップされてしまう。代わりに、①②③のステップで実績のある
          .tutorial-guide-pulse（このコンポーネント内で完結する光るリング）で囲む
          （2026-08-27ユーザー指定：ダメージ・計算式を囲んで計算式を開くよう誘導） */}
      <div
        className={highlightDamageFormula ? 'tutorial-guide-pulse' : undefined}
        style={{ display: 'grid', gap: 10, borderRadius: 10 }}
      >
        <NumberField
          // コンボ終了で区切られた区間がある時だけ「コンボ2（現在）」のように何本目かを
          // 添える。区間が無い（従来通りの1本のコンボ）時は今まで通り「ダメージ」のまま
          label={priorComboSegments.length > 0 ? `ダメージ（コンボ${priorComboSegments.length + 1}・現在）` : 'ダメージ'}
          value={stats.damage}
          onChange={(next) => update({ damage: next, isDamageAutoSynced: false })}
          readOnly={readOnly}
          isAutoSynced={stats.isDamageAutoSynced}
          onResetToAuto={() => update({ isDamageAutoSynced: true })}
        />

        {/* この技の直後に繋ぐこともある技を、木にノードを追加せず複数登録できる。あえて
            使わないことも多い技（SA締め等）や、同じノードから「何もしない／技Cを追加／SAを
            追加」のように複数の終わり方がありうる場合に、枝を分岐させずそれぞれ記録して
            おきたいというユーザー要望（2026-10-03）。登録した技ごとに専用の評価・
            プラスフレーム・投げ間合い・起き攻め可能を個別登録できる（締め技によって評価や
            終わり際の状況が変わるため、ノード自身の評価とは独立に持たせたい、という
            2026-10-03ユーザー要望）。各技は技のように開閉できるアコーディオンにし、
            普段は畳んでおく。この欄自体も他のアコーディオンと同じく開閉できるようにし、
            普段は畳んでおく（2026-10-04ユーザー要望）。ダメージ欄のすぐ下・計算式ボタンの
            上に置くことで、「ダメージを見る→この後に繋ぐこともある技を確認する→裏付けとして
            計算式を見る」という自然な導線にする（2026-10-03ユーザー指定の配置）。このノード
            自身が特殊性能の選択待ちの技（finishingSuperArtMove）の場合は、混同を避けるため
            この欄自体を出さない（従来からの仕様） */}
        {!finishingSuperArtMove && (
          <AccordionSection
            title="この後に繋ぐこともある技"
            icon="🔀"
            count={finishingMoveOptions.length}
            isOpen={isFinishingMoveSectionOpen}
            onToggle={() => setIsFinishingMoveSectionOpen((open) => !open)}
          >
            <div style={{ display: 'grid', gap: 10 }}>
              <span style={styles.requiredHint}>
                あえて使わないこともある技を、複数登録しておけます。技ごとに開いて、追加した
                場合のダメージと、この技で締めた場合専用の評価・プラスフレーム・投げ間合い・
                起き攻め可能を個別に登録できます
              </span>

              {finishingMoveOptions.length > 0 && (
                <div style={{ display: 'grid', gap: 6 }}>
                  {finishingMoveOptions.map((option, index) => (
                    <FinishingMoveOptionAccordion
                      key={`${option.name}::${option.specialVariant ?? ''}::${index}`}
                      option={option}
                      preview={finishingMoveOptionPreviews[index]}
                      readOnly={readOnly}
                      onChange={(patch) => updateFinishingMoveOption(index, patch)}
                      onRemove={() =>
                        update({ finishingMoveOptions: finishingMoveOptions.filter((_, i) => i !== index) })
                      }
                    />
                  ))}
                </div>
              )}

              {!readOnly &&
                (draftFinishingMove ? (
                  <div style={{ display: 'grid', gap: 6 }}>
                    <MoveNamePicker
                      characterId={characterId ?? ''}
                      value={draftFinishingMove.name}
                      onChange={(name, _displayName, finishingSpecialVariant) =>
                        setDraftFinishingMove({ name, specialVariant: finishingSpecialVariant ?? null })
                      }
                      precedingMoveName={ownMoveName}
                      activeFinishingSpecialVariant={draftFinishingMove.specialVariant ?? undefined}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={styles.autoCalcButton}
                        disabled={!draftFinishingMove.name}
                        onClick={() => {
                          update({
                            finishingMoveOptions: [
                              ...finishingMoveOptions,
                              createDefaultFinishingMoveOption(draftFinishingMove.name, draftFinishingMove.specialVariant),
                            ],
                          });
                          setDraftFinishingMove(null);
                        }}
                      >
                        この技を追加する
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        style={styles.autoCalcButton}
                        onClick={() => setDraftFinishingMove(null)}
                      >
                        キャンセル
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn-ghost"
                    style={styles.formulaToggle}
                    onClick={() => setDraftFinishingMove({ name: '', specialVariant: null })}
                  >
                    + 技を追加
                  </button>
                ))}
            </div>
          </AccordionSection>
        )}

        {/* 経路上に技データが1件も無く計算対象が無い場合はボタン自体を出さない
            （手動でダメージ欄を確定しているかどうかは問わない） */}
        {damageBreakdown && (
          <div style={{ display: 'grid', gap: 6 }}>
            <button
              type="button"
              className="btn-ghost"
              style={styles.formulaToggle}
              onClick={() =>
                setIsFormulaOpen((open) => {
                  const next = !open;
                  if (next && highlightDamageFormula) onFormulaOpened?.();
                  return next;
                })
              }
            >
              <span>計算式</span>
              <span
                style={{
                  ...styles.formulaToggleChevron,
                  transform: isFormulaOpen ? 'rotate(180deg)' : 'none',
                }}
              >
                ⌄
              </span>
            </button>

            {isFormulaOpen && (
              <DamageFormulaBreakdown breakdown={damageBreakdown} showFormulaExplanation={showFormulaExplanation} />
            )}
          </div>
        )}
      </div>

      {damageBreakdown && <div style={styles.sectionDivider} />}

      {showPlusFrameSection && (
        <div style={styles.twoColRow}>
          <NumberField
            label="プラスフレーム"
            value={stats.plusFrame}
            onChange={(next) => update({ plusFrame: next })}
            readOnly={readOnly}
          />

          <NumberField
            label="Dゲージ削り量"
            value={stats.opponentDGaugeChip}
            onChange={(next) => update({ opponentDGaugeChip: next, isOpponentDGaugeChipAutoSynced: false })}
            readOnly={readOnly}
            isAutoSynced={stats.isOpponentDGaugeChipAutoSynced}
            onResetToAuto={() => update({ isOpponentDGaugeChipAutoSynced: true })}
          />
        </div>
      )}

      <GaugeChangeField
        label="Dゲージ増減"
        value={stats.dGaugeChange}
        onChange={(next) => update({ dGaugeChange: next, isDGaugeChangeAutoSynced: false })}
        readOnly={readOnly}
        breakdown={dGaugeBreakdown}
        isBreakdownMode={isDGaugeBreakdownMode}
        onToggleBreakdownMode={() => setIsDGaugeBreakdownMode((open) => !open)}
        isAutoSynced={stats.isDGaugeChangeAutoSynced}
        onResetToAuto={() => update({ isDGaugeChangeAutoSynced: true })}
      />

      {/* SF6は「ゲージが0でなければ消費行動を発動できる」仕様（名目コストを満額持っている
          必要はない）ため、消費行動の間に十分な回復があれば名目コストの合計よりずっと少ない
          ゲージで足りる。逆に回復を挟まず連続すると名目コストを超える量が必要になることもある
          （2026-08-26ユーザー指定：単純な消費量の合計ではなく実際に発動できるかをシミュレーション
          した最低限必要量を表示する）。消費行動が経路上に無ければ(0)表示しない */}
      {dGaugeMinimumRequired !== null && dGaugeMinimumRequired > 0 && (
        <p style={styles.minRequiredGaugeText}>
          最低限必要なDゲージ：{dGaugeMinimumRequired}
        </p>
      )}

      <GaugeChangeField
        label="SAゲージ増加"
        value={stats.saGaugeGain}
        onChange={(next) => update({ saGaugeGain: next, isSaGaugeGainAutoSynced: false })}
        readOnly={readOnly}
        breakdown={saGaugeBreakdown}
        isBreakdownMode={isSaGaugeBreakdownMode}
        onToggleBreakdownMode={() => setIsSaGaugeBreakdownMode((open) => !open)}
        isAutoSynced={stats.isSaGaugeGainAutoSynced}
        onResetToAuto={() => update({ isSaGaugeGainAutoSynced: true })}
      />

      {showRatingGrid && (
        <div style={styles.ratingGrid}>
          <RatingField
            label="ダメージ評価"
            value={stats.damageRating}
            onChange={(next) => update({ damageRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="Dゲージ評価"
            value={stats.dGaugeRating}
            onChange={(next) => update({ dGaugeRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="SAゲージ評価"
            value={stats.saGaugeRating}
            onChange={(next) => update({ saGaugeRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="運び評価"
            value={stats.carryRating}
            onChange={(next) => update({ carryRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="起き攻め内容"
            value={stats.okizemeRating}
            onChange={(next) => update({ okizemeRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="難易度"
            value={stats.difficultyRating}
            onChange={(next) => update({ difficultyRating: next })}
            disabled={readOnly}
            compact
          />
        </div>
      )}

      {/* 総合評価だけは他の評価より目立たせたいため、ボタンサイズを縮めず単独で1行に配置する
          （ユーザー指定：「総合評価のサイズは変えずに他の評価の数字を小さくしていく」方針） */}
      {showOverallRating && (
        <RatingField
          label="総合評価"
          value={stats.overallRating}
          onChange={(next) => update({ overallRating: next, isOverallRatingAutoSynced: false })}
          disabled={readOnly}
          isAutoSynced={stats.isOverallRatingAutoSynced}
          onResetToAuto={() => update({ isOverallRatingAutoSynced: true })}
        />
      )}

      {showThrowRange && (
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={stats.isThrowRange}
            disabled={readOnly}
            onChange={(event) => update({ isThrowRange: event.target.checked })}
          />
          投げ間合い
        </label>
      )}

      {showOkizeme && (
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={stats.canOkizeme}
            disabled={readOnly}
            onChange={(event) => update({ canOkizeme: event.target.checked })}
          />
          起き攻め可能
        </label>
      )}

      {expandedStarterMoveOptions.length > 0 && (
        <div style={styles.fieldLabel}>
          この枝の始動技
          {(!stats.startingMoveNames || stats.startingMoveNames.length === 0) && (
            <span style={styles.requiredHint}>
              選ぶまではダメージ・ゲージの自動計算欄が空欄のままになります
            </span>
          )}
          <div style={styles.threeColRow}>
            {expandedStarterMoveOptions.map((chain) => {
              const chainLabel = chain.join(' → ');
              const active =
                stats.startingMoveNames !== null &&
                stats.startingMoveNames?.length === chain.length &&
                stats.startingMoveNames?.every((name, index) => name === chain[index]);
              return (
                <button
                  key={chainLabel}
                  type="button"
                  onClick={() => {
                    updateAndResetAutoFields({
                      startingMoveNames: active ? null : chain,
                      // 始動技を変えると何段目でキャンセルしたかの前提も変わるため、
                      // 選び直しのたびに一旦リセットする
                      startingMoveCancelHitIndex: null,
                    });
                    setCustomStarterDraft(active ? '' : serializeStarterMoveOptions([chain]));
                  }}
                  disabled={readOnly}
                  style={{
                    ...styles.conditionButton,
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  {chainLabel}
                </button>
              );
            })}
          </div>

          <label style={{ ...styles.fieldLabel, marginTop: 6 }}>
            または自由記入（一覧に無い、経由技を挟んだ入り方をした場合。矢印は→か-&gt;で繋ぐ）
            <input
              type="text"
              className="input-field"
              value={customStarterDraft}
              disabled={readOnly}
              placeholder="例: 強P→2中P"
              onChange={(event) => setCustomStarterDraft(event.target.value)}
              onBlur={() => {
                const chain = parseStarterMoveChain(customStarterDraft);
                const nextChain = chain.length > 0 ? chain : null;
                const currentSerialized = serializeStarterMoveOptions(
                  stats.startingMoveNames ? [stats.startingMoveNames] : [],
                );
                const nextSerialized = serializeStarterMoveOptions(nextChain ? [nextChain] : []);
                // 何も変えずにフォーカスを外しただけの場合、ダメージ等の自動計算欄を
                // 無駄にリセットしないようにする
                if (nextSerialized === currentSerialized) return;
                updateAndResetAutoFields({
                  startingMoveNames: nextChain,
                  startingMoveCancelHitIndex: null,
                });
              }}
            />
          </label>
        </div>
      )}

      {starterMoveCancelInfo && stats.startingMoveNames && (
        <div style={styles.fieldLabel}>
          始動技の何段目でキャンセルしたか
          <div style={styles.threeColRow}>
            <button
              type="button"
              onClick={() => updateAndResetAutoFields({ startingMoveCancelHitIndex: null })}
              disabled={readOnly}
              style={{
                ...styles.conditionButton,
                borderColor: starterMoveCancelHitIndex === null ? 'var(--accent)' : 'var(--border)',
                background: starterMoveCancelHitIndex === null ? 'var(--accent)' : 'var(--bg-elevated)',
                color: starterMoveCancelHitIndex === null ? '#fff' : 'var(--text-secondary)',
                cursor: readOnly ? 'default' : 'pointer',
              }}
            >
              キャンセルしていない
            </button>

            {starterMoveCancelInfo.cancelableHitIndices.map((hitIndex) => {
              const active = starterMoveCancelHitIndex === hitIndex;
              return (
                <button
                  key={hitIndex}
                  type="button"
                  onClick={() =>
                    updateAndResetAutoFields({
                      startingMoveCancelHitIndex: active ? null : hitIndex,
                    })
                  }
                  disabled={readOnly}
                  style={{
                    ...styles.conditionButton,
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  {hitIndex}段目でキャンセル
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showStartCondition && (
        <div style={styles.fieldLabel}>
          始動条件
          {requiredStartHitCondition && (
            <span style={styles.requiredHint}>
              経路上に「{START_HIT_CONDITION_LABELS[requiredStartHitCondition]}以上」でないと繋がらないノードがあるため、
              {START_HIT_CONDITION_LABELS[requiredStartHitCondition]}未満は選べません
            </span>
          )}
          {justParryRequiredCondition && (
            <span style={styles.requiredHint}>
              ジャストパリィ始動は常に「パニッシュカウンター」扱いになります
            </span>
          )}
          <div style={styles.threeColRow}>
            {START_HIT_CONDITIONS.map((condition) => {
              const active = effectiveStartHitCondition === condition;
              const belowRequirement =
                !!effectiveRequiredCondition &&
                START_HIT_CONDITION_RANK[condition] < START_HIT_CONDITION_RANK[effectiveRequiredCondition];
              const disabled = readOnly || belowRequirement;
              return (
                <button
                  key={condition}
                  type="button"
                  onClick={() => updateAndResetAutoFields({ startHitCondition: active ? null : condition })}
                  disabled={disabled}
                  style={{
                    ...styles.conditionButton,
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    cursor: disabled ? 'default' : 'pointer',
                    opacity: belowRequirement ? 0.4 : 1,
                  }}
                >
                  {START_HIT_CONDITION_LABELS[condition]}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => updateAndResetAutoFields({ isJustParryStart: !(stats.isJustParryStart ?? false) })}
              disabled={readOnly}
              style={{
                ...styles.conditionButton,
                borderColor: stats.isJustParryStart ? 'var(--accent)' : 'var(--border)',
                background: stats.isJustParryStart ? 'var(--accent)' : 'var(--bg-elevated)',
                color: stats.isJustParryStart ? '#fff' : 'var(--text-secondary)',
                cursor: readOnly ? 'default' : 'pointer',
              }}
            >
              ジャストパリィ
            </button>
          </div>
        </div>
      )}

      {finishingSuperArtMove && finishingSuperArtMove.specialVariantOptions.length > 0 && (
        <div style={styles.fieldLabel}>
          使用した{finishingSuperArtMove.name}の特殊性能
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {finishingSuperArtMove.specialVariantOptions.map((variant) => {
              const active = (stats.finishingSpecialVariant ?? null) === variant;
              return (
                <button
                  key={variant}
                  type="button"
                  onClick={() => update({ finishingSpecialVariant: active ? null : variant })}
                  disabled={readOnly}
                  style={{
                    ...styles.conditionButton,
                    borderColor: active ? 'var(--accent)' : 'var(--border)',
                    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    cursor: readOnly ? 'default' : 'pointer',
                  }}
                >
                  {variant}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {odUsagesOnPath.length > 0 && (
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={styles.fieldLabel}>経路上のOD使用</div>
          {odUsagesOnPath.map((entry) => (
            <OdLevelToggle
              key={entry.nodeId}
              label={entry.label}
              constraint={entry.constraint}
              usesOD={entry.usesOD}
              onChange={(next) => onChangeOdUsage?.(entry.nodeId, next)}
              readOnly={readOnly || !onChangeOdUsage}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// 「計算式」ボタンを開いた時の中身（起点基準値・各段の内訳・合計）。現在の区間の
// ダメージ（NumberField直下）と、このノードより前の区間（PriorComboSegmentBlock）の
// 両方から共通で使う（2026-09-30ユーザー要望：コンボ終了で区切った各区間の計算式を
// それぞれ見られるようにする）
function DamageFormulaBreakdown({
  breakdown,
  showFormulaExplanation,
}: {
  breakdown: DamageBreakdown;
  showFormulaExplanation: boolean;
}) {
  return (
    <div style={styles.debugBreakdown}>
      {showFormulaExplanation && (
        <div style={styles.formulaExplanation}>
          ただの足し算ではなく、ストリートファイター6と同じ補正計算をしたうえで算出しています
        </div>
      )}
      <div style={styles.debugBreakdownHeader}>
        起点基準値{breakdown.startBase}%
        {breakdown.rushTriggerPosition !== null &&
          `／ラッシュ発生位置${breakdown.rushTriggerPosition}発目〜`}
      </div>
      {breakdown.entries.map((entry) => {
        const note = formatDamageEntryNote(entry);
        return (
          <div key={entry.position} style={styles.debugBreakdownRow}>
            {entry.position}発目 {entry.hitLabel}
            {note && ` : ${note}`}
            {' → '}
            {entry.isSystemAction ? (
              'ダメージ0（位置のみ消費）'
            ) : (
              <>
                <span style={styles.formulaEmphasis}>{entry.damage}</span>
                {' × '}
                <span
                  className={showFormulaExplanation ? 'tutorial-formula-blink' : undefined}
                  style={styles.formulaEmphasisPercent}
                >
                  {entry.percent}%
                </span>
                {' = '}
                <span style={styles.formulaEmphasis}>{Math.round(entry.contribution)}</span>
              </>
            )}
          </div>
        );
      })}
      <div style={styles.debugBreakdownRow}>合計：{breakdown.total}</div>
    </div>
  );
}

// 「コンボ終了」で区切られた、末端ノードより前の1区間ぶんの読み取り専用ブロック
// （ラベル＋合計ダメージ＋開閉式の「計算式」。中身はDamageFormulaBreakdownを再利用）。
// 現在の区間のダメージ欄（NumberField）と違い編集はできない
// （その区間自身のノードを選べば、そちらの「コンボの情報」欄から編集できるため）
function PriorComboSegmentBlock({
  label,
  breakdown,
  showFormulaExplanation,
}: {
  label: string;
  breakdown: DamageBreakdown;
  showFormulaExplanation: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={styles.priorComboHeader}>
        <span>{label}</span>
        <span style={styles.priorComboDamage}>{breakdown.total}</span>
      </div>
      <button type="button" className="btn-ghost" style={styles.formulaToggle} onClick={() => setIsOpen((open) => !open)}>
        <span>計算式</span>
        <span style={{ ...styles.formulaToggleChevron, transform: isOpen ? 'rotate(180deg)' : 'none' }}>⌄</span>
      </button>
      {isOpen && <DamageFormulaBreakdown breakdown={breakdown} showFormulaExplanation={showFormulaExplanation} />}
    </div>
  );
}

// Dゲージ増減・SAゲージ増加で共用する、「合計⇄内訳」をワンボタンで切り替えられる欄。
// 内訳モードでは編集不可の読み取り専用テキストに切り替わる（合計モードに戻せば通常通り
// 編集できる）。内訳の各ステップは長い矢印区切りの文字列でも折り返して全文表示し、
// 省略（…）はしない（2026-08-26ユーザー指定）。合計モードでは、totalExcludingEarlyRecovery
// （Dゲージ限定・SAゲージ側は無し）がtotalと異なる時だけ、入力欄の右に括弧書きの参考値
// 「-25500(-27500)」を添える（2026-08-26ユーザー指定：内訳の1ステップずつを括弧で示す
// のではなく、合計欄側に括弧で併記する方式に変更）
function GaugeChangeField({
  label,
  value,
  onChange,
  readOnly,
  breakdown,
  isBreakdownMode,
  onToggleBreakdownMode,
  isAutoSynced = true,
  onResetToAuto,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  readOnly: boolean;
  breakdown?: { steps: GaugeStep[]; total: number; totalExcludingEarlyRecovery?: number } | null;
  isBreakdownMode: boolean;
  onToggleBreakdownMode: () => void;
  // falseの間（ユーザーが手で書き換えて固定した状態）だけ「自動計算に戻す」ボタンを出す。
  // 詳細はtypes.tsのComboBranchStats.isDamageAutoSynced等のコメント参照
  isAutoSynced?: boolean;
  onResetToAuto?: () => void;
}) {
  const hasEarlyRecoveryNote =
    breakdown?.totalExcludingEarlyRecovery !== undefined &&
    breakdown.totalExcludingEarlyRecovery !== breakdown.total;

  return (
    <div style={styles.fieldLabel}>
      <div style={styles.fieldLabelRow}>
        <span>{label}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {!readOnly && !isAutoSynced && onResetToAuto && (
            <button type="button" className="btn-ghost" style={styles.autoCalcButton} onClick={onResetToAuto}>
              自動計算に戻す
            </button>
          )}
          {/* 「合計(-19600)」⇄「内訳(+200→+200→-20000)」をワンボタンで切り替える。
              内訳が無い（技データ未登録等）場合はボタン自体を出さない */}
          {breakdown && breakdown.steps.length > 0 && (
            <button
              type="button"
              className="btn-ghost"
              style={styles.autoCalcButton}
              onClick={onToggleBreakdownMode}
            >
              {isBreakdownMode ? '合計で見る' : '内訳で見る'}
            </button>
          )}
        </div>
      </div>

      {isBreakdownMode && breakdown ? (
        <div style={styles.gaugeBreakdownText}>
          {breakdown.steps
            .map((step) => (step.value >= 0 ? `+${step.value}` : `${step.value}`))
            .join(' → ')}
        </div>
      ) : (
        <div style={styles.gaugeInputRow}>
          <input
            type="number"
            className="input-field"
            style={styles.numberInput}
            value={value ?? ''}
            readOnly={readOnly}
            onChange={(event) =>
              onChange(event.target.value === '' ? null : Number(event.target.value))
            }
          />
          {hasEarlyRecoveryNote && (
            <span
              style={styles.gaugeSecondaryTotal}
              title="Dゲージを使うまでの技の分を加算しなかった場合"
            >
              ({breakdown!.totalExcludingEarlyRecovery})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  readOnly = false,
  isAutoSynced = true,
  onResetToAuto,
}: {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  readOnly?: boolean;
  // falseの間（ユーザーが手で書き換えて固定した状態）だけ「自動計算に戻す」ボタンを出す。
  // 詳細はtypes.tsのComboBranchStats.isDamageAutoSynced等のコメント参照
  isAutoSynced?: boolean;
  onResetToAuto?: () => void;
}) {
  return (
    <div style={styles.fieldLabel}>
      <div style={styles.fieldLabelRow}>
        <span>{label}</span>
        {!readOnly && !isAutoSynced && onResetToAuto && (
          <button type="button" className="btn-ghost" style={styles.autoCalcButton} onClick={onResetToAuto}>
            自動計算に戻す
          </button>
        )}
      </div>
      <input
        type="number"
        className="input-field"
        style={styles.numberInput}
        value={value ?? ''}
        readOnly={readOnly}
        onChange={(event) =>
          onChange(event.target.value === '' ? null : Number(event.target.value))
        }
      />
    </div>
  );
}

function RatingField({
  label,
  value,
  onChange,
  disabled = false,
  // trueの時、総合評価より小さいボタンサイズを使う（ratingButtonCompact参照）。
  // 総合評価だけを目立たせるため、縮めるのは他の評価側という方針
  compact = false,
  // falseの間（ユーザーが選んで固定した状態）だけ「自動計算に戻す」ボタンを出す。
  // NumberFieldのisAutoSynced/onResetToAutoと同じ考え方（総合評価だけが対象。
  // 他の6項目はそもそも自動計算を持たないため常にundefinedのまま渡される）
  isAutoSynced,
  onResetToAuto,
}: {
  label: string;
  value: Rating5 | null;
  onChange: (next: Rating5 | null) => void;
  disabled?: boolean;
  compact?: boolean;
  isAutoSynced?: boolean;
  onResetToAuto?: () => void;
}) {
  return (
    <label style={styles.fieldLabel}>
      <div style={styles.fieldLabelRow}>
        <span>{label}</span>
        {!disabled && isAutoSynced === false && onResetToAuto && (
          <button type="button" className="btn-ghost" style={styles.autoCalcButton} onClick={onResetToAuto}>
            自動計算に戻す
          </button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {([1, 2, 3, 4, 5] as Rating5[]).map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(value === n ? null : n)}
            disabled={disabled}
            style={{
              ...(compact ? styles.ratingButtonCompact : styles.ratingButton),
              borderColor: value === n ? 'var(--accent)' : 'var(--border)',
              background: value === n ? 'var(--accent)' : 'var(--bg-elevated)',
              color: value === n ? '#fff' : 'var(--text-secondary)',
              cursor: disabled ? 'default' : 'pointer',
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </label>
  );
}

/**
 * 「この後に繋ぐこともある技」1件ぶんの編集UI。技のように開閉できるアコーディオンにし、
 * 開くとこの技で締めた場合専用の評価・プラスフレーム・投げ間合い・起き攻め可能を編集できる
 * （2026-10-03ユーザー要望：締め技によって評価や終わり際の状況が変わるため、ノード自身の
 * 評価とは独立に持たせたい。それまでは技を複数登録しても評価は1つしか持てず、どの技で
 * 締めたかで評価を切り替えられなかった）。総合評価は、ノード本体と同じく他の6項目からの
 * 加重平均にisOverallRatingAutoSynced（既定true）の間だけ自動追従する
 */
function FinishingMoveOptionAccordion({
  option,
  preview,
  readOnly,
  onChange,
  onRemove,
}: {
  option: FinishingMoveOption;
  preview?: { option: FinishingMoveOption; damage: number | null };
  readOnly: boolean;
  onChange: (patch: Partial<FinishingMoveOption>) => void;
  onRemove: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const autoOverallRating = calculateWeightedOverallRating(option);
  useEffect(() => {
    if (readOnly) return;
    if (!(option.isOverallRatingAutoSynced ?? true)) return;
    if ((option.overallRating ?? null) === autoOverallRating) return;
    onChange({ overallRating: autoOverallRating });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, option.isOverallRatingAutoSynced, option.overallRating, autoOverallRating]);

  const label = option.specialVariant ? `${option.name}（${option.specialVariant}）` : option.name;
  const filledCount =
    [
      option.damageRating,
      option.dGaugeRating,
      option.saGaugeRating,
      option.carryRating,
      option.okizemeRating,
      option.difficultyRating,
      option.overallRating,
      option.plusFrame,
    ].filter((value) => value !== null && value !== undefined).length +
    [option.isThrowRange, option.canOkizeme].filter(Boolean).length;

  return (
    <AccordionSection
      title={label}
      icon="🔗"
      count={filledCount}
      isOpen={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      // 下の「+ 技を追加」から開くMoveNamePickerが示す技カテゴリの一覧（通常技/必殺技/SA/
      // 共通システム）と見た目が同じだと、どちらが「既に登録済みの技」か紛らわしいとの指摘
      // （2026-10-04ユーザー指摘）。teal系の配色にして区別する
      accented
    >
      <div style={{ display: 'grid', gap: 10 }}>
        {preview && preview.damage !== null && (
          <p style={styles.finishingMoveRowDamage}>ダメージ: {preview.damage}</p>
        )}

        <NumberField
          label="プラスフレーム"
          value={option.plusFrame ?? null}
          onChange={(next) => onChange({ plusFrame: next })}
          readOnly={readOnly}
        />

        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={option.isThrowRange ?? false}
            disabled={readOnly}
            onChange={(event) => onChange({ isThrowRange: event.target.checked })}
          />
          投げ間合い
        </label>

        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={option.canOkizeme ?? false}
            disabled={readOnly}
            onChange={(event) => onChange({ canOkizeme: event.target.checked })}
          />
          起き攻め可能
        </label>

        <div style={styles.ratingGrid}>
          <RatingField
            label="ダメージ評価"
            value={option.damageRating ?? null}
            onChange={(next) => onChange({ damageRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="Dゲージ評価"
            value={option.dGaugeRating ?? null}
            onChange={(next) => onChange({ dGaugeRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="SAゲージ評価"
            value={option.saGaugeRating ?? null}
            onChange={(next) => onChange({ saGaugeRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="運び評価"
            value={option.carryRating ?? null}
            onChange={(next) => onChange({ carryRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="起き攻め内容"
            value={option.okizemeRating ?? null}
            onChange={(next) => onChange({ okizemeRating: next })}
            disabled={readOnly}
            compact
          />
          <RatingField
            label="難易度"
            value={option.difficultyRating ?? null}
            onChange={(next) => onChange({ difficultyRating: next })}
            disabled={readOnly}
            compact
          />
        </div>

        <RatingField
          label="総合評価"
          value={option.overallRating ?? null}
          onChange={(next) => onChange({ overallRating: next, isOverallRatingAutoSynced: false })}
          disabled={readOnly}
          isAutoSynced={option.isOverallRatingAutoSynced ?? true}
          onResetToAuto={() => onChange({ isOverallRatingAutoSynced: true })}
        />

        {!readOnly && (
          <button type="button" className="btn-ghost" style={styles.autoCalcButton} onClick={onRemove}>
            登録を解除する
          </button>
        )}
      </div>
    </AccordionSection>
  );
}

const styles: Record<string, CSSProperties> = {
  favoriteButton: {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 10,
    border: '1.5px solid var(--border)',
    fontSize: 13,
    fontWeight: 800,
    textAlign: 'center',
  },
  fieldLabel: {
    display: 'grid',
    gap: 4,
    fontSize: 12,
    color: 'var(--text-secondary)',
    fontWeight: 700,
    minWidth: 0,
  },
  numberInput: {
    fontSize: 12,
    padding: '6px 10px',
  },
  fieldLabelRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
    flexWrap: 'wrap',
  },
  twoColRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 8,
  },
  autoCalcButton: {
    fontSize: 11,
    padding: '2px 8px',
  },
  // Dゲージ/SAゲージ増減の内訳表示（例:「+200 → +200 → -20000」）。読み取り専用のテキストなので
  // input-fieldと縦幅を合わせつつ、編集不可であることが分かるよう文字色を少し落とす。
  // コンボが長く1行に収まらない場合も省略（…）せず、折り返して全文表示する
  // （2026-08-26ユーザー指定。white-space:nowrap/text-overflow:ellipsisは使わない）
  gaugeBreakdownText: {
    fontSize: 12,
    padding: '6px 10px',
    color: 'var(--text-secondary)',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    lineHeight: 1.6,
  },
  // 合計欄本体（input）＋「Dゲージを使うまでの技の分を除いた場合」の参考値（括弧書き）を
  // 横並びにする
  gaugeInputRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  gaugeSecondaryTotal: {
    flex: '0 0 auto',
    fontSize: 12,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  minRequiredGaugeText: {
    margin: 0,
    marginTop: -6,
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--text-muted)',
  },
  formulaToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    fontSize: 12,
    padding: '4px 10px',
    border: 'none',
  },
  // 開閉で別の文字（⌃/⌄）に差し替えると字形の重心が微妙にずれて位置が上下して見えるため、
  // 同じ文字を180度回転させるだけにする（円い枠は常に同じ場所・同じ見た目のまま）
  formulaToggleChevron: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    lineHeight: 1,
    transition: 'transform 0.15s',
  },
  sectionDivider: {
    height: 2,
    margin: '2px 0',
    // 通常のvar(--border)よりも一段明るい区切り線用の色（見出し無しでも区切りが目立つように）
    background: 'var(--border-hover)',
  },
  // コンボ終了で区切られた、末端ノードより前の区間（PriorComboSegmentBlock）のラベル行
  priorComboHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--text-secondary)',
  },
  priorComboDamage: {
    fontSize: 15,
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  // 計算式の内訳表示（元は調査用のデバッグ表示だったが、計算根拠を見せる機能として
  // 「計算式」ボタンの開閉式に変更した。2026-08-26ユーザー指定）。当初の赤枠・赤文字は
  // デバッグ表示時代の名残でサイトの雰囲気から浮いていたため、灰色の枠線・明るい白文字・
  // 背景(黒と枠線グレーの中間)へ変更した（2026-08-27ユーザー指定）
  debugBreakdown: {
    display: 'grid',
    gap: 3,
    marginTop: -2,
    padding: '8px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    fontFamily: 'monospace',
    fontSize: 10.5,
    color: 'var(--text-primary)',
  },
  debugBreakdownHeader: {
    fontWeight: 800,
    color: 'var(--text-primary)',
  },
  // チュートリアルキャラクター限定、計算式を開いた時に添える一言（2026-08-27ユーザー指定）
  formulaExplanation: {
    marginBottom: 4,
    paddingBottom: 6,
    borderBottom: '1px solid var(--border)',
    fontFamily: 'inherit',
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--accent-blue-text)',
  },
  debugBreakdownRow: {
    lineHeight: 1.5,
  },
  // 各段の「技のダメージ×補正% = 段ダメージ」のうち、実際に計算に使っている数値だけを
  // 緑色にして目立たせる。技名や注記など数値以外の説明文に埋もれて、どこが計算箇所か
  // 分かりにくいとの指摘を受けた（2026-09-30ユーザー指摘）。当初はチュートリアル
  // キャラクター限定の強調だったが、この見やすさは全キャラクター共通で欲しい内容の
  // ため常時オンにした。太字だけでは目立たないとの指摘を受け、補正%側は下線も加えて
  // 「ここが補正されている数値」だとより分かるようにした（2026-08-31）
  formulaEmphasis: {
    fontWeight: 800,
    color: 'var(--accent-green-text)',
  },
  formulaEmphasisPercent: {
    fontWeight: 800,
    color: 'var(--accent-green-text)',
    textDecoration: 'underline',
  },
  // ダメージ評価/Dゲージ評価/SAゲージ評価/運び評価を2×2で並べるためのグリッド。
  // 総合評価はこのグリッドの外に単独で置き、サイズを変えずに目立たせる
  ratingGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 10,
  },
  ratingButton: {
    width: 26,
    height: 26,
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontSize: 11,
    fontWeight: 800,
    cursor: 'pointer',
  },
  ratingButtonCompact: {
    width: 19,
    height: 19,
    borderRadius: 6,
    border: '1px solid var(--border)',
    fontSize: 9,
    fontWeight: 800,
    cursor: 'pointer',
  },
  conditionButton: {
    padding: '4px 10px',
    borderRadius: 8,
    border: '1px solid var(--border)',
    fontSize: 11,
    fontWeight: 800,
    textAlign: 'center',
    cursor: 'pointer',
  },
  requiredHint: {
    fontSize: 10.5,
    fontWeight: 400,
    color: 'var(--text-muted)',
  },
  // 「この後に繋ぐこともある技」のアコーディオンを開いた時に表示する、追加した場合のダメージ
  finishingMoveRowDamage: {
    fontSize: 11,
    fontWeight: 700,
    color: 'var(--accent-green-text)',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 12,
    color: 'var(--text-secondary)',
  },
};
