// src/utils/resolvePatchNoteImageUrl.test.ts

import { describe, expect, it } from 'vitest';
import { resolvePatchNoteImageUrl } from './resolvePatchNoteImageUrl';

describe('resolvePatchNoteImageUrl', () => {
  it('ルート絶対パス（アップロード機能が発行するURL）にはBASE_URLを前置する', () => {
    expect(resolvePatchNoteImageUrl('/images/patch-notes/2026/08/xxx.png?v=1')).toBe(
      `${import.meta.env.BASE_URL}images/patch-notes/2026/08/xxx.png?v=1`,
    );
  });

  it('http(s)の外部URLはそのまま使う', () => {
    expect(resolvePatchNoteImageUrl('https://example.com/a.png')).toBe('https://example.com/a.png');
    expect(resolvePatchNoteImageUrl('http://example.com/a.png')).toBe('http://example.com/a.png');
  });

  it('プロトコル相対URL（//〜）はそのまま使う', () => {
    expect(resolvePatchNoteImageUrl('//example.com/a.png')).toBe('//example.com/a.png');
  });

  it('data URLはそのまま使う', () => {
    expect(resolvePatchNoteImageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
  });
});
