import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { fontMaps } from '../node_modules/@busy-app/cli/dist/lib/fontMapsPlugin.js';

test('the real build scanner includes the track fonts', () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const plugin = fontMaps({root, app:fileURLToPath(new URL('../src', import.meta.url))});
  plugin.buildStart.call({warn(message) { throw new Error(message); }});
  const generated = plugin.load('\0#font-maps');
  for (const font of ['bold','small']) assert.ok(generated.includes(font+'.json'), 'Track fonts must be discovered under src/');
});
