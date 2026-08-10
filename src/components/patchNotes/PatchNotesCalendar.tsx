import { useMemo } from 'react';
import type { CSSProperties, MouseEvent } from 'react';
import type { PatchNote } from '../../types/patchNote';
import { todayDateKey } from '../../services/patchNotesService';

interface PatchNotesCalendarProps {
  notes: PatchNote[];
  selectedDate: string | null;
  displayMonth: Date;
  onSelectDate: (date: string) => void;
  onNavigateMonth: (nextMonth: Date) => void;
  onDeselectDate: () => void;
}

type CalendarCell =
  | {
      date: string;
      day: number;
      count: number;
      isSelected: boolean;
      isToday: boolean;
    }
  | null;

const WEEK_DAYS = ['日', '月', '火', '水', '木', '金', '土'];

export default function PatchNotesCalendar({
  notes,
  selectedDate,
  displayMonth,
  onSelectDate,
  onNavigateMonth,
  onDeselectDate,
}: PatchNotesCalendarProps) {
  const notesByDate = useMemo(() => {
    const map = new Map<string, number>();

    for (const note of notes) {
      map.set(note.date, (map.get(note.date) ?? 0) + 1);
    }

    return map;
  }, [notes]);

  const calendarCells = useMemo<CalendarCell[]>(() => {
    const year = displayMonth.getFullYear();
    const month = displayMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = todayDateKey();

    const cells: CalendarCell[] = [];

    for (let index = 0; index < firstDay; index += 1) {
      cells.push(null);
    }

    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = toDateKey(year, month, day);

      cells.push({
        date,
        day,
        count: notesByDate.get(date) ?? 0,
        isSelected: date === selectedDate,
        isToday: date === today,
      });
    }

    return cells;
  }, [displayMonth, notesByDate, selectedDate]);

  const moveMonth = (amount: number) => {
    onNavigateMonth(new Date(displayMonth.getFullYear(), displayMonth.getMonth() + amount, 1));
  };

  const handleTodayClick = () => {
    onSelectDate(todayDateKey());
  };

  const handleBackgroundClick = (event: MouseEvent<HTMLElement>) => {
    if (event.target === event.currentTarget) {
      onDeselectDate();
    }
  };

  return (
    <section style={styles.panel} aria-label="パッチノートカレンダー" onClick={handleBackgroundClick}>
      <div style={styles.header} onClick={handleBackgroundClick}>
        <button type="button" style={styles.navButton} onClick={() => moveMonth(-1)}>
          ‹
        </button>

        <div style={styles.monthTitle} onClick={onDeselectDate}>
          {displayMonth.getFullYear()}年 {displayMonth.getMonth() + 1}月
        </div>

        <button type="button" style={styles.navButton} onClick={() => moveMonth(1)}>
          ›
        </button>
      </div>

      <button type="button" style={styles.todayButton} onClick={handleTodayClick}>
        今日を選択
      </button>

      <div style={styles.weekGrid} onClick={handleBackgroundClick}>
        {WEEK_DAYS.map((weekDay) => (
          <div key={weekDay} style={styles.weekDay}>
            {weekDay}
          </div>
        ))}
      </div>

      <div style={styles.calendarGrid} onClick={handleBackgroundClick}>
        {calendarCells.map((cell, index) => {
          if (!cell) {
            return (
              <button
                key={`empty-${index}`}
                type="button"
                style={styles.emptyCell}
                aria-label="選択を解除"
                onClick={onDeselectDate}
              />
            );
          }

          const dayButtonStyle: CSSProperties = {
            ...styles.dayButton,
            ...(cell.isSelected ? styles.selectedDayButton : {}),
            ...(cell.count > 0 ? styles.dayWithNoteButton : {}),
            ...(cell.isToday ? styles.todayDayButton : {}),
          };

          return (
            <button
              key={cell.date}
              type="button"
              style={dayButtonStyle}
              onClick={() => onSelectDate(cell.date)}
              aria-pressed={cell.isSelected}
            >
              <span>{cell.day}</span>
              {cell.count > 0 && <span style={styles.noteDot}>{cell.count}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function toDateKey(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const styles: Record<string, CSSProperties> = {
  panel: {
    border: '1px solid rgba(148, 163, 184, 0.22)',
    borderRadius: 18,
    padding: 16,
    background: 'rgba(15, 23, 42, 0.78)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  navButton: {
    width: 34,
    height: 34,
    borderRadius: 10,
    border: '1px solid rgba(148, 163, 184, 0.22)',
    background: 'rgba(30, 41, 59, 0.8)',
    color: '#e5e7eb',
    cursor: 'pointer',
    fontSize: 20,
    lineHeight: 1,
  },
  monthTitle: {
    color: '#f8fafc',
    fontWeight: 700,
    fontSize: 15,
    cursor: 'pointer',
  },
  todayButton: {
    width: '100%',
    marginTop: 10,
    marginBottom: 12,
    border: '1px solid rgba(250, 204, 21, 0.3)',
    background: 'rgba(250, 204, 21, 0.08)',
    color: '#fde68a',
    borderRadius: 10,
    padding: '8px 10px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 700,
  },
  weekGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 6,
    marginBottom: 6,
  },
  weekDay: {
    color: '#94a3b8',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: 700,
  },
  calendarGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: 6,
  },
  emptyCell: {
    minHeight: 42,
    border: 'none',
    background: 'transparent',
    padding: 0,
    cursor: 'pointer',
  },
  dayButton: {
    position: 'relative',
    minHeight: 42,
    borderRadius: 12,
    border: '1px solid rgba(148, 163, 184, 0.14)',
    background: 'rgba(2, 6, 23, 0.5)',
    color: '#cbd5e1',
    cursor: 'pointer',
    fontSize: 12,
  },
  selectedDayButton: {
    borderColor: '#facc15',
    background: 'rgba(250, 204, 21, 0.16)',
    color: '#fef3c7',
    boxShadow: '0 0 0 1px rgba(250, 204, 21, 0.12)',
  },
  dayWithNoteButton: {
    borderColor: 'rgba(59, 130, 246, 0.55)',
  },
  todayDayButton: {
    color: '#93c5fd',
  },
  noteDot: {
    position: 'absolute',
    right: 5,
    bottom: 4,
    minWidth: 16,
    height: 16,
    padding: '0 4px',
    borderRadius: 999,
    background: '#2563eb',
    color: '#fff',
    fontSize: 10,
    lineHeight: '16px',
    fontWeight: 800,
  },
};
