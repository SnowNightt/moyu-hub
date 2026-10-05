import { describe, expect, it } from 'vitest';
import { defaultSettings, validateSettings } from './model';

describe('settings persistence boundary', () => {
  it('restores old settings with a default blur and validates the new independent strength', () => {
    expect(validateSettings({ opacity: 12, blur: 48 }).blurStrength).toBe(40);
    expect(validateSettings({ blurStrength: 140 }).blurStrength).toBe(100);
    expect(validateSettings({ blurStrength: -2 }).blurStrength).toBe(0);
    expect(validateSettings({ blurStrength: NaN }).blurStrength).toBe(40);
    expect(validateSettings({ blurStrength: '80' }).blurStrength).toBe(40);
    const saved = JSON.parse(JSON.stringify({ opacity: 12, blurStrength: 73 }));
    expect(validateSettings(saved)).toMatchObject({ opacity: 12, blurStrength: 73 });
  });
  it('recovers from missing or corrupt records', () => {
    for (const value of [null, undefined, 'corrupt', [], { theme: false, opacity: '80' }]) {
      expect(validateSettings(value)).toEqual(defaultSettings);
    }
  });
  it('rejects non-finite preferences and clamps valid out-of-range numbers', () => {
    const settings = validateSettings({
      opacity: Infinity,
      readingSize: NaN,
      volume: -50,
      readingLineHeight: 40,
    });
    expect(settings.opacity).toBe(defaultSettings.opacity);
    expect(settings.readingSize).toBe(defaultSettings.readingSize);
    expect(settings.volume).toBe(0);
    expect(settings.readingLineHeight).toBe(2.6);
  });
  it('discards retired blur values, unknown fields and unsafe startup routes', () => {
    const settings = validateSettings({
      blur: 48,
      apiCookie: 'never persist',
      lastPage: '/reader/novel/deleted-file',
    });
    expect(settings.lastPage).toBe('/');
    expect(settings).not.toHaveProperty('blur');
    expect(settings).not.toHaveProperty('apiCookie');
  });
  it('retains legitimate user preferences', () => {
    expect(
      validateSettings({
        theme: 'dark',
        opacity: 22,
        closeBehavior: 'exit',
        readingTheme: 'light',
        lastPage: '/steam',
        rememberPosition: false,
      }),
    ).toMatchObject({
      theme: 'dark',
      opacity: 22,
      closeBehavior: 'exit',
      readingTheme: 'light',
      lastPage: '/steam',
      rememberPosition: false,
    });
  });
});
