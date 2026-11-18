import { describe, it, expect } from 'vitest';
import { faStore } from '@fortawesome/free-solid-svg-icons';
import { categories } from '../data/categories';
import { categoryIcon } from './categoryIcons';

describe('category icons', () => {
  it('every category has its own icon, not the fallback store, so no shop type shows a generic tile', () => {
    categories.forEach((c) => {
      expect(c.icon, c.id).not.toBe('store');
      expect(categoryIcon(c.icon), `${c.id}: icon "${c.icon}" is not registered in categoryIcons.js`).not.toBe(faStore);
    });
  });
  it('an unknown name falls back to the store icon', () => {
    expect(categoryIcon('no-such-icon')).toBe(faStore);
  });
});
