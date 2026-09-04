import { AspectPreset } from '../types/crop';

export const ASPECT_PRESETS: AspectPreset[] = [
  { mode: 'free', label: 'Free', shortcut: '0' },
  { mode: '16:9', label: '16:9', ratio: 16 / 9, shortcut: '1' },
  { mode: '4:3', label: '4:3', ratio: 4 / 3, shortcut: '2' },
  { mode: '1:1', label: '1:1', ratio: 1, shortcut: '3' },
  { mode: '3:4', label: '3:4', ratio: 3 / 4, shortcut: '4' },
  { mode: '9:16', label: '9:16', ratio: 9 / 16, shortcut: '5' },
];

export const getPresetByMode = (mode: string): AspectPreset => {
  return ASPECT_PRESETS.find((p) => p.mode === mode) || ASPECT_PRESETS[0];
};
