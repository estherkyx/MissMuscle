/** Adapt the pinned classic MediaPipe loader for an ES-module worker. */
export function poseLoaderModule(source: string): string {
  // MediaPipe 0.10.32 declares custom_dbg inside an if block, then calls it
  // outside that block. Classic scripts permit that via Annex B; ES modules
  // use strict block scope. Supply the outer binding without modifying vendor
  // files or hiding WASM diagnostics.
  return `const custom_dbg = (...args) => console.warn(...args);\n${source}\nexport default ModuleFactory;`;
}
