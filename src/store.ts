// src/store.ts
// フェーズ0時点の最小限のストア。
// AuthPage / Header が動作するのに必要な状態のみを持つ。
// キャラクター・コンボ木まわりの状態はフェーズ1以降で追加する。

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '@supabase/supabase-js';
import { supabase } from './utils/supabaseClient';

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
};

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
    }),
    {
      name: 'combo-lab-storage',

      partialize: (state) => ({
        theme: state.theme,
        isGuest: state.isGuest,
      }),

      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<AppState> | undefined;

        return {
          ...currentState,
          ...persisted,
          user: currentState.user,
          nickname: persisted?.isGuest ? 'ゲスト' : currentState.nickname,
          isPatchNotesModalOpen: false,
          selectedPatchNoteDate: null,
        };
      },
    },
  ),
);
