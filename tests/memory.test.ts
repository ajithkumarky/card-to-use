import { afterEach, describe, expect, it } from 'vitest';
import { forget, recall, remember } from '../src/ui/memory';

function fakeStorage() {
  const data = new Map<string, string>();
  (globalThis as { window?: unknown }).window = {
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    },
  };
  return data;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe('memory', () => {
  it('returns nothing when storage is unavailable', () => {
    expect(recall()).toBeNull();
    expect(() => remember({ held: [], custom: [], rotating: {}, overrides: {}, mode: 'best' })).not.toThrow();
  });

  it('round-trips choices and forgets them', () => {
    fakeStorage();
    remember({ held: ['amex-gold'], custom: [], rotating: { 'discover-it': ['gas'] }, overrides: { 'corner bistro': 'dining' }, mode: 'cash' });
    expect(recall()).toEqual({ held: ['amex-gold'], custom: [], rotating: { 'discover-it': ['gas'] }, overrides: { 'corner bistro': 'dining' }, mode: 'cash' });
    forget();
    expect(recall()).toBeNull();
  });

  it('drops malformed saved data', () => {
    const data = fakeStorage();
    data.set('card-to-use:v1', JSON.stringify({ held: ['a', 3], rotating: { x: ['gas', 'bogus'] }, overrides: { y: 'nope' }, custom: [{ id: 'z' }], mode: 'weird' }));
    expect(recall()).toEqual({ held: ['a'], custom: [], rotating: { x: ['gas'] }, overrides: {}, mode: 'best' });
    data.set('card-to-use:v1', '{not json');
    expect(recall()).toBeNull();
  });
});
