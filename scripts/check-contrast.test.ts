import themes from '../src/themes/builtin.json';
import type { ThemeDef } from '../src/themes/types';
import { checkThemes } from './check-contrast';

describe('built-in themes', () => {
  it('has at least 40 themes', () => {
    expect((themes as ThemeDef[]).length).toBeGreaterThanOrEqual(40);
  });
  it('are all legible', () => {
    expect(checkThemes(themes as ThemeDef[])).toEqual([]);
  });
});
