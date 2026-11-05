/*
 * Copyright 2020 The Backstage Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import fs from 'fs-extra';
import postcss from 'postcss';
import postcssImport from 'postcss-import';
import postcssModules from 'postcss-modules';
import {
  dirname,
  resolve as resolvePath,
  relative as relativePath,
} from 'node:path';
import { createFilter } from 'rollup-pluginutils';
import {
  Plugin,
  InputOptions,
  OutputChunk,
  HasModuleSideEffects,
} from 'rollup';
import { EntryPoint } from '../entryPoints';
import { loadPostcssConfig } from '../postcssConfig';

type ForwardFileImportsOptions = {
  include: Array<string | RegExp> | string | RegExp | null;
  exclude?: Array<string | RegExp> | string | RegExp | null;
};

/**
 * This rollup plugin leaves all encountered asset imports as-is, but
 * copies the imported files into the output directory.
 *
 * For example `import ImageUrl from './my-image.png'` inside `src/MyComponent` will
 * cause `src/MyComponent/my-image.png` to be copied to the output directory at the
 * path `dist/MyComponent/my-image.png`. The import itself will stay, but be resolved,
 * resulting in something like `import ImageUrl from './MyComponent/my-image.png'`
 */
export function forwardFileImports(options: ForwardFileImportsOptions) {
  const filter = createFilter(options.include, options.exclude);

  // We collect the absolute paths to all files we want to bundle into the
  // output dir here. Resolving to relative paths in the output dir happens later.
  const exportedFiles = new Set<string>();

  // We keep track of output directories that we've already copied files
  // into, so that we don't duplicate that work
  const generatedFor = new Set<string>();

  return {
    name: 'forward-file-imports',
    async generateBundle(outputOptions, bundle, isWrite) {
      if (!isWrite) {
        return;
      }

      const dir = outputOptions.dir || dirname(outputOptions.file!);
      if (generatedFor.has(dir)) {
        return;
      }

      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') {
          continue;
        }
        const chunk = output as OutputChunk;

        // This'll be an absolute path pointing to the initial index file of the
        // build, and we use it to find the location of the `src` dir
        if (!chunk.facadeModuleId) {
          continue;
        }
        generatedFor.add(dir);

        // We're assuming that the index file is at the root of the source dir, and
        // that all assets exist within that dir.
        const srcRoot = dirname(chunk.facadeModuleId);

        // Copy all the files we found into the dist dir
        await Promise.all(
          Array.from(exportedFiles).map(async exportedFile => {
            const outputPath = relativePath(srcRoot, exportedFile);
            const targetFile = resolvePath(dir, outputPath);

            await fs.ensureDir(dirname(targetFile));
            await fs.copyFile(exportedFile, targetFile);
          }),
        );
        return;
      }
    },
    options(inputOptions) {
      // We're in control of the config ourselves, so these are just checks to
      // make sure we don't update the config but forget about the config
      // overrides here
      const treeshake = inputOptions.treeshake;
      if (treeshake !== undefined && typeof treeshake !== 'object') {
        throw new Error(
          'Expected treeshake input config to be an object or not set',
        );
      }
      if (treeshake?.moduleSideEffects) {
        throw new Error('treeshake.moduleSideEffects must not be set');
      }

      // All external assets are treated as being side-effect free.
      //
      // This also works around an apparent bug in rollup where the
      // `makeAbsoluteExternalsRelative: false` option sometimes caused relative
      // asset paths to be rewritten with an incorrect path. They are rewritten
      // in the first place because they are being treated as external by this
      // plugin, but that seems to be the best way to handle asset files.
      const moduleSideEffects: HasModuleSideEffects = id => {
        if (filter(id)) {
          return false;
        }
        return true;
      };

      const origExternal = inputOptions.external;

      // We decorate any existing `external` option with our own way of determining
      // if a module should be external. The can't use `resolveId`, since asset files
      // aren't passed there, might be some better way to do this though.
      const external: InputOptions['external'] = (id, importer, isResolved) => {
        // Call to inner external option
        if (
          typeof origExternal === 'function' &&
          origExternal(id, importer, isResolved)
        ) {
          return true;
        }

        if (Array.isArray(origExternal) && origExternal.includes(id)) {
          return true;
        }

        // The piece that we're adding
        if (!filter(id)) {
          return false;
        }

        // Confidence check, dunno if this can happen
        if (!importer) {
          throw new Error(`Unknown importer of file module ${id}`);
        }

        // Resolve relative imports to the full file URL, for deduping and copying later
        const fullId = isResolved ? id : resolvePath(dirname(importer), id);
        exportedFiles.add(fullId);

        // Treating this module as external from here, meaning rollup won't try to
        // put it in the output bundle, but still keep track of the relative imports
        // as needed in the output code.
        return true;
      };

      return {
        ...inputOptions,
        external,
        treeshake: { ...treeshake, moduleSideEffects },
      };
    },
  } satisfies Plugin;
}

interface CssEntryPointsOptions {
  entryPoints: EntryPoint[];
  targetDir: string;
}

/**
 * Rollup plugin that bundles CSS entry points using postcss-import.
 * CSS files declared in package.json exports are processed and emitted
 * as part of the Rollup bundle.
 */
export function cssEntryPoints(options: CssEntryPointsOptions): Plugin {
  const cssEntries = options.entryPoints.filter(ep => ep.ext === '.css');

  // Track output directories we've already emitted CSS to, to avoid duplicates
  // when Rollup runs generateBundle multiple times (once per output format)
  const generatedFor = new Set<string>();

  return {
    name: 'backstage-css-entry-points',

    async generateBundle(outputOptions, _bundle, isWrite) {
      if (!isWrite) {
        return;
      }

      const dir = outputOptions.dir || dirname(outputOptions.file!);
      if (generatedFor.has(dir)) {
        return;
      }
      generatedFor.add(dir);

      for (const entryPoint of cssEntries) {
        const sourcePath = resolvePath(options.targetDir, entryPoint.path);
        // Strip the src/ prefix to create an output filename relative to the Rollup output directory
        const outputPath = entryPoint.path.replace(/^(\.\/)?src\//, '');

        // Read source CSS
        const source = await fs.readFile(sourcePath, 'utf8');

        // Bundle @import statements using postcss-import
        const result = await postcss([postcssImport()]).process(source, {
          from: sourcePath,
        });

        // Emit the bundled CSS as an asset
        this.emitFile({
          type: 'asset',
          fileName: outputPath,
          source: result.css,
        });
      }
    },
  };
}

// The module that adds styles to the document, shared by all CSS imports
const STYLE_INJECT_ID = '\0backstage-style-inject';
const STYLE_INJECT_SOURCE = `export default function styleInject(css) {
  if (!css || typeof document === 'undefined') {
    return;
  }
  const style = document.createElement('style');
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}
`;

const CSS_FILE_PATTERN = /\.(?:css|sss|pcss)$/;
const CSS_MODULE_PATTERN = /\.module\.[a-z]{2,6}$/;

interface CssImportsOptions {
  /**
   * Generates the class names of CSS modules, see the option with the same
   * name in postcss-modules.
   */
  generateScopedName(name: string, filename: string, css: string): string;
}

/**
 * Rollup plugin that turns imported CSS files into modules that add their
 * styles to the document head when loaded. For CSS modules, `*.module.css`,
 * the default export maps the class names in the file to the generated ones.
 * For other CSS files it is the CSS itself. A PostCSS config file in the
 * directory of the CSS file or above it is applied.
 */
export function cssImports(options: CssImportsOptions): Plugin {
  return {
    name: 'backstage-css-imports',

    resolveId(source) {
      return source === STYLE_INJECT_ID ? source : null;
    },

    load(id) {
      return id === STYLE_INJECT_ID ? STYLE_INJECT_SOURCE : null;
    },

    async transform(code, id) {
      if (!CSS_FILE_PATTERN.test(id)) {
        return null;
      }

      const { plugins, options: processOptions } = await loadPostcssConfig(id);

      let classNames: Record<string, string> | undefined;
      const result = await postcss([
        ...(CSS_MODULE_PATTERN.test(id)
          ? [
              postcssModules({
                generateScopedName: options.generateScopedName,
                getJSON(_file, json) {
                  classNames = json;
                },
              }),
            ]
          : []),
        ...plugins,
        // Without any plugins PostCSS skips parsing, which would let syntax
        // errors through
        { postcssPlugin: 'backstage-css-imports' },
      ]).process(code, { ...processOptions, from: id, to: id, map: false });

      for (const warning of result.warnings()) {
        this.warn(warning.toString());
      }
      for (const message of result.messages) {
        if (message.type === 'dependency') {
          this.addWatchFile(message.file);
        }
      }

      return {
        code: [
          `import styleInject from ${JSON.stringify(STYLE_INJECT_ID)};`,
          `const css = ${JSON.stringify(result.css)};`,
          'styleInject(css);',
          `export default ${classNames ? JSON.stringify(classNames) : 'css'};`,
          '',
        ].join('\n'),
        map: { mappings: '' },
      };
    },
  };
}
