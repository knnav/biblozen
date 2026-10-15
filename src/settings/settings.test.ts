import { createFakePlatform } from '../platform/fake';
import { FakeFs } from '../platform/fakefs';
import { bindSettings, serialize } from './persistence';
import { defaultSettings, sanitize, setPath } from './schema';
import { useSettings } from './store';

const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

describe('settings schema', () => {
  it('drops wrongly typed values and keeps defaults', () => {
    const s = sanitize(
      { readingStyle: 3, reader: { progressBar: false, bogus: 1 }, theme: 'x' },
      defaultSettings,
    );
    expect(s.readingStyle).toBe('github');
    expect(s.reader.progressBar).toBe(false);
    expect(s.theme).toEqual(defaultSettings.theme);
    expect('bogus' in s.reader).toBe(false);
  });

  it('sets dotted paths immutably', () => {
    const s = setPath(defaultSettings, 'editor.vim', true);
    expect(s.editor.vim).toBe(true);
    expect(defaultSettings.editor.vim).toBe(false);
  });
});

describe('settings persistence', () => {
  beforeEach(() => useSettings.setState({ settings: defaultSettings, loaded: false }));

  it('creates settings.json in the data dir on first run', async () => {
    const fs = new FakeFs();
    const p = await createFakePlatform(fs);
    const dispose = await bindSettings(p);
    expect(fs.read('/data/settings.json')).toBe(serialize(defaultSettings));
    dispose();
  });

  it('saves changes and hot-reloads external edits', async () => {
    const fs = new FakeFs();
    const p = await createFakePlatform(fs);
    const dispose = await bindSettings(p);
    useSettings.getState().set('reader.progressBar', false);
    await tick(250);
    expect(JSON.parse(fs.read('/data/settings.json')).reader.progressBar).toBe(false);

    const edited = { ...JSON.parse(fs.read('/data/settings.json')), readingStyle: 'book' };
    fs.write('/data/settings.json', JSON.stringify(edited));
    await tick(10);
    expect(useSettings.getState().settings.readingStyle).toBe('book');
    dispose();
  });

  it('keeps current settings when the file becomes invalid', async () => {
    const fs = new FakeFs();
    const p = await createFakePlatform(fs);
    const errors: string[] = [];
    const dispose = await bindSettings(p, (m) => errors.push(m));
    fs.write('/data/settings.json', '{ nope');
    await tick(10);
    expect(errors[0]).toMatch(/not valid JSON/);
    expect(useSettings.getState().settings).toEqual(defaultSettings);
    dispose();
  });
});

describe('settings save races', () => {
  beforeEach(() => useSettings.setState({ settings: defaultSettings, loaded: false }));

  it('never loses an external edit that lands while a save is pending', async () => {
    const fs = new FakeFs();
    const p = await createFakePlatform(fs);
    const dispose = await bindSettings(p);
    for (const gap of [0, 5, 50, 199, 201, 400]) {
      const s1 = JSON.parse(fs.read('/data/settings.json'));
      s1.theme.manual = 'dark';
      s1.theme.dark = `d${gap}`;
      fs.write('/data/settings.json', JSON.stringify(s1));
      await tick(gap);
      const s2 = JSON.parse(fs.read('/data/settings.json'));
      s2.theme.light = `l${gap}`;
      fs.write('/data/settings.json', JSON.stringify(s2));
      await tick(500);
      const disk = JSON.parse(fs.read('/data/settings.json'));
      expect([gap, disk.theme.light, disk.theme.dark]).toEqual([gap, `l${gap}`, `d${gap}`]);
      expect(useSettings.getState().settings.theme.light).toBe(`l${gap}`);
    }
    dispose();
  });

  it('merges an in-app change with a concurrent external edit', async () => {
    const fs = new FakeFs();
    const p = await createFakePlatform(fs);
    const dispose = await bindSettings(p);
    useSettings.getState().set('editor.vim', true); // in-app, save pending
    const ext = JSON.parse(fs.read('/data/settings.json'));
    ext.readingStyle = 'book'; // hand edit lands before our save
    fs.write('/data/settings.json', JSON.stringify(ext), false); // no watch event: worst case
    await tick(300);
    const disk = JSON.parse(fs.read('/data/settings.json'));
    expect(disk.editor.vim).toBe(true);
    expect(disk.readingStyle).toBe('book');
    expect(useSettings.getState().settings.readingStyle).toBe('book');
    dispose();
  });

  it("doesn't reformat a hand-edited file it only read", async () => {
    const fs = new FakeFs();
    const p = await createFakePlatform(fs);
    const dispose = await bindSettings(p);
    const compact = JSON.stringify({
      ...JSON.parse(fs.read('/data/settings.json')),
      readingStyle: 'mono',
    });
    fs.write('/data/settings.json', compact);
    await tick(400);
    expect(fs.read('/data/settings.json')).toBe(compact);
    dispose();
  });
});
