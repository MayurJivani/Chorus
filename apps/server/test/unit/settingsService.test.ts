import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../../src/db/client';
import { appSettings } from '../../src/db/schema';
import {
  SETTING_DEFS,
  SETTING_KEYS,
  SettingsError,
  defaultSettings,
  describeSettings,
  getSettings,
  invalidateSettingsCache,
  resetSetting,
  updateSettings,
} from '../../src/services/settingsService';

beforeEach(async () => {
  await db.delete(appSettings);
  invalidateSettingsCache();
});

describe('getSettings', () => {
  it('returns the compiled-in defaults when nothing is stored', async () => {
    expect(await getSettings()).toEqual(defaultSettings());
  });

  it('overlays only the keys that have been stored', async () => {
    await updateSettings([{ key: 'challengeRounds', value: 20 }], null);

    const settings = await getSettings();
    expect(settings.challengeRounds).toBe(20);
    // Everything else is untouched.
    expect(settings.multiplayerRounds).toBe(SETTING_DEFS.multiplayerRounds.default);
    expect(settings.snippetScheduleSeconds).toEqual(SETTING_DEFS.snippetScheduleSeconds.default);
  });

  it('falls back to the default for a stored value that no longer validates', async () => {
    // Simulates a value written before the bounds were tightened. It must not take the rest of
    // the config down with it.
    await db.insert(appSettings).values({ key: 'challengeRounds', value: 9999 });
    invalidateSettingsCache();

    const settings = await getSettings();
    expect(settings.challengeRounds).toBe(SETTING_DEFS.challengeRounds.default);
    expect(settings.multiplayerRounds).toBe(SETTING_DEFS.multiplayerRounds.default);
  });

  it('ignores rows for keys that no longer exist', async () => {
    await db.insert(appSettings).values({ key: 'removedSettingFromAnOlderBuild', value: 1 });
    invalidateSettingsCache();

    expect(await getSettings()).toEqual(defaultSettings());
  });
});

describe('updateSettings', () => {
  it('rejects a value outside its bounds and writes nothing', async () => {
    await expect(
      updateSettings([{ key: 'challengeRounds', value: 1 }], null),
    ).rejects.toBeInstanceOf(SettingsError);
    expect(await db.select().from(appSettings)).toEqual([]);
  });

  it('rejects the whole batch if any one value is invalid', async () => {
    await expect(
      updateSettings(
        [
          { key: 'challengeRounds', value: 15 },
          { key: 'multiplayerMaxPlayers', value: 500 },
        ],
        null,
      ),
    ).rejects.toBeInstanceOf(SettingsError);

    // The valid half must not have landed — a partly-applied change is a config nobody asked for.
    expect(await db.select().from(appSettings)).toEqual([]);
    expect((await getSettings()).challengeRounds).toBe(SETTING_DEFS.challengeRounds.default);
  });

  it('rejects an unknown key', async () => {
    await expect(
      updateSettings([{ key: 'nonsense' as never, value: 1 }], null),
    ).rejects.toBeInstanceOf(SettingsError);
  });

  it('rejects a snippet schedule that does not increase', async () => {
    // A later stage revealing *less* audio than an earlier one would make "reveal more" shrink
    // the snippet.
    await expect(
      updateSettings([{ key: 'snippetScheduleSeconds', value: [1, 5, 3] }], null),
    ).rejects.toBeInstanceOf(SettingsError);
  });

  it('accepts a valid schedule of a different length', async () => {
    await updateSettings([{ key: 'snippetScheduleSeconds', value: [2, 5, 10] }], null);
    expect((await getSettings()).snippetScheduleSeconds).toEqual([2, 5, 10]);
  });

  it('is idempotent for the same key, rather than inserting twice', async () => {
    await updateSettings([{ key: 'challengeRounds', value: 12 }], null);
    await updateSettings([{ key: 'challengeRounds', value: 14 }], null);

    const rows = await db.select().from(appSettings);
    expect(rows).toHaveLength(1);
    expect((await getSettings()).challengeRounds).toBe(14);
  });
});

describe('resetSetting', () => {
  it('drops the row and returns the key to its default', async () => {
    await updateSettings([{ key: 'challengeRounds', value: 25 }], null);
    await resetSetting('challengeRounds');

    expect(await db.select().from(appSettings)).toEqual([]);
    expect((await getSettings()).challengeRounds).toBe(SETTING_DEFS.challengeRounds.default);
  });
});

describe('describeSettings', () => {
  it('describes every registered setting, with its control metadata', async () => {
    const described = await describeSettings();

    expect(described.map((d) => d.key).sort()).toEqual([...SETTING_KEYS].sort());
    for (const descriptor of described) {
      expect(descriptor.label).toBeTruthy();
      expect(descriptor.help).toBeTruthy();
      expect(descriptor.control.kind).toBeTruthy();
    }
  });

  it('flags which settings still hold their default', async () => {
    await updateSettings([{ key: 'challengeRounds', value: 20 }], null);
    const described = await describeSettings();

    expect(described.find((d) => d.key === 'challengeRounds')?.isDefault).toBe(false);
    expect(described.find((d) => d.key === 'multiplayerRounds')?.isDefault).toBe(true);
  });
});

describe('the registry itself', () => {
  it('has a default that satisfies its own schema for every setting', () => {
    // Guards the fallback path: if a default were invalid, a bad stored row would fall back to
    // something that is also rejected downstream.
    for (const key of SETTING_KEYS) {
      const def = SETTING_DEFS[key];
      expect(def.schema.safeParse(def.default).success, `${key} default`).toBe(true);
    }
  });
});
