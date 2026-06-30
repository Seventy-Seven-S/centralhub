import { describe, it, expect } from 'vitest';
import {
  STORAGE_KEY,
  readStoredProjectId,
  writeStoredProjectId,
  resolveStoredSelection,
} from './projectSelection';

function fakeStorage(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
    _dump: () => Object.fromEntries(m),
  };
}

describe('readStoredProjectId', () => {
  it('devuelve null cuando no hay nada guardado', () => {
    expect(readStoredProjectId(fakeStorage())).toBeNull();
  });
  it('devuelve el id guardado', () => {
    const s = fakeStorage({ [STORAGE_KEY]: 'abc' });
    expect(readStoredProjectId(s)).toBe('abc');
  });
});

describe('writeStoredProjectId', () => {
  it('guarda el id', () => {
    const s = fakeStorage();
    writeStoredProjectId(s, 'xyz');
    expect(s._dump()[STORAGE_KEY]).toBe('xyz');
  });
  it('borra la clave cuando el id es null', () => {
    const s = fakeStorage({ [STORAGE_KEY]: 'xyz' });
    writeStoredProjectId(s, null);
    expect(STORAGE_KEY in s._dump()).toBe(false);
  });
});

describe('resolveStoredSelection', () => {
  const projects = [{ id: 'a' }, { id: 'b' }];
  it('null se queda en null (Todos)', () => {
    expect(resolveStoredSelection(projects, null)).toBeNull();
  });
  it('id existente se conserva', () => {
    expect(resolveStoredSelection(projects, 'b')).toBe('b');
  });
  it('id inexistente cae a null', () => {
    expect(resolveStoredSelection(projects, 'zzz')).toBeNull();
  });
});
