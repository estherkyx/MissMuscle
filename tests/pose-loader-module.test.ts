import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { poseLoaderModule } from '../src/features/video/pose-loader-module';

const moduleUrl = (source: string) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
for (const variant of ['vision_wasm_internal', 'vision_wasm_nosimd_internal']) {
  test(`${variant}: vendor debug callback works in strict module scope`, async t => {
    const source = await readFile(new URL(`../node_modules/@mediapipe/tasks-vision/wasm/${variant}.js`, import.meta.url), 'utf8');
    // Exercise the exact vendor callback that emitted the user's error, with
    // only UTF8 decoding substituted so no camera or exercise run is needed.
    const callback = source.match(/function custom_emscripten_dbgn\(str,len\)\{.*?\}(?=var _free)/)?.[0];
    assert.ok(callback, 'Expected logging callback in pinned MediaPipe runtime');
    const harness = `const UTF8ToString = () => '${variant} diagnostic';\n${callback}\nconst ModuleFactory = custom_emscripten_dbgn;`;
    const original = await import(moduleUrl(`${harness}\nexport default ModuleFactory;`));
    assert.throws(() => original.default(0, 0), /custom_dbg/);
    const warnings: unknown[][] = [];
    t.mock.method(console, 'warn', (...args: unknown[]) => { warnings.push(args); });
    const fixed = await import(moduleUrl(poseLoaderModule(harness)));
    fixed.default(0, 0);
    assert.deepEqual(warnings, [[`${variant} diagnostic`]]);
    // Also check the complete adapted vendor source, not just the callback.
    const complete = await import(moduleUrl(poseLoaderModule(source)));
    assert.equal(typeof complete.default, 'function');
  });
}
