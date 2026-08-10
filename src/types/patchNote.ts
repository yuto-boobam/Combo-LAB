export type PatchNoteType = 'feature' | 'bugfix' | 'spec-change' | 'other';

export interface PatchNote {
  id: string;
  date: string; // YYYY-MM-DD
  buildNumber: number; // 全パッチノートを通した更新回数（1始まり）
  type: PatchNoteType;
  title: string;
  description: string;
  beforeImageUrl?: string | null;
  afterImageUrl?: string | null;
}

export type PatchNotesJson = PatchNote[];
