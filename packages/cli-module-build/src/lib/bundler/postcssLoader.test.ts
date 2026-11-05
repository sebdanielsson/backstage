/*
 * Copyright 2026 The Backstage Authors
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

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';
import fs from 'fs-extra';
import { rspack, Stats } from '@rspack/core';
import { transforms } from './transforms';

// A source map from a tool that generated the CSS, which is ignored with and
// without a PostCSS config
const inlineSourceMap = Buffer.from(
  JSON.stringify({
    version: 3,
    sources: ['webpack://lib/./src/other.scss'],
    names: [],
    mappings: 'AAAA',
  }),
).toString('base64');

const sourceFiles = {
  'src/entry.js': `import './app.css';
import './other/app.css';
import styles from './app.module.css';
import '@fixture/styles/index.css';
globalThis.title = styles.title;`,
  'src/app.css': '.app { color: red; }',
  'src/other/app.css': `.other { color: red; }
/*# sourceMappingURL=data:application/json;base64,${inlineSourceMap} */`,
  'src/app.module.css': '.title { color: red; }',
  'node_modules/@fixture/styles/package.json': JSON.stringify({
    name: '@fixture/styles',
  }),
  'node_modules/@fixture/styles/index.css': '.dependency { color: red; }',
};

// A plugin that sets every color, which the config picks based on the
// environment. It also reports a file and a directory that the result depends
// on, like Tailwind CSS does for the files it scans.
const pluginFiles = {
  'postcss.config.js': `module.exports = ctx => ({
  plugins: {
    'postcss-fixture': { color: ctx.env === 'production' ? 'green' : 'blue' },
  },
});`,
  'node_modules/postcss-fixture/index.js': `module.exports = options => ({
  postcssPlugin: 'postcss-fixture',
  Declaration: { color: decl => { decl.value = options.color; } },
  Once(root, { result }) {
    const { join } = require('node:path');
    result.messages.push(
      { type: 'dependency', plugin: 'postcss-fixture', file: join(__dirname, '../../content.txt'), parent: root.source.input.file },
      { type: 'dir-dependency', plugin: 'postcss-fixture', dir: join(__dirname, '../../content'), parent: root.source.input.file },
    );
  },
});
module.exports.postcss = true;`,
};

// Without a source map from a loader, Rspack adds the export type of the CSS
// to the source name
const sourceWithoutLoader = (path: string) =>
  `webpack:///./${path}|css-export-type|link`;

async function compile(files: Record<string, string>) {
  // The native version also expands short names in Windows paths
  const root = realpathSync.native(
    await fs.mkdtemp(join(tmpdir(), 'backstage-postcss-')),
  );
  try {
    await Promise.all(
      Object.entries(files).map(([file, content]) =>
        fs.outputFile(join(root, file), content),
      ),
    );

    const compiler = rspack({
      mode: 'production',
      context: root,
      entry: './src/entry.js',
      output: { path: join(root, 'dist') },
      devtool: 'source-map',
      optimization: { minimize: false },
      module: { rules: transforms({ isDev: false }).loaders },
    });
    const stats = await new Promise<Stats>((resolve, reject) => {
      compiler.run((error, result) => {
        compiler.close(closeError => {
          if (error || closeError || !result) {
            reject(error ?? closeError ?? new Error('Missing stats'));
          } else {
            resolve(result);
          }
        });
      });
    });

    const { errors, warnings } = stats.toJson({
      all: false,
      errors: true,
      warnings: true,
    });
    const outputFiles = await fs.readdir(join(root, 'dist'));
    const readAssets = (extension: string) =>
      Promise.all(
        outputFiles
          .filter(file => file.endsWith(extension))
          .map(file => fs.readFile(join(root, 'dist', file), 'utf8')),
      );
    const css = (await readAssets('.css')).join('\n');
    const sourceMapSources = (await readAssets('.css.map')).flatMap(
      map => JSON.parse(map).sources as string[],
    );
    return {
      root,
      nodeEnv: process.env.NODE_ENV,
      errors,
      warnings,
      css,
      sourceMapSources,
      fileDependencies: [...stats.compilation.fileDependencies],
      contextDependencies: [...stats.compilation.contextDependencies],
    };
  } finally {
    await fs.remove(root);
  }
}

describe('postcssLoader', () => {
  it('applies the PostCSS config to the CSS of the app, but not of dependencies', async () => {
    // postcss-load-config sets NODE_ENV when it isn't set and there is no
    // environment in the context
    const env = process.env as Record<string, string | undefined>;
    const nodeEnv = env.NODE_ENV;
    delete env.NODE_ENV;
    const result = await compile({ ...sourceFiles, ...pluginFiles }).finally(
      () => {
        env.NODE_ENV = nodeEnv;
      },
    );

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.css).toMatch(/\.app\s*\{\s*color:\s*green;?\s*\}/);
    expect(result.css).toMatch(/\.other\s*\{\s*color:\s*green;?\s*\}/);
    expect(result.css.match(/color:\s*green/g)).toHaveLength(3);
    expect(result.css).not.toMatch(/\.title\s*\{/);
    expect(result.css).toMatch(/\.dependency\s*\{\s*color:\s*red;?\s*\}/);
    expect(result.css.match(/color:\s*red/g)).toHaveLength(1);
    expect(result.sourceMapSources.sort()).toEqual([
      sourceWithoutLoader('node_modules/@fixture/styles/index.css'),
      'webpack:///./src/app.css',
      'webpack:///./src/app.module.css',
      'webpack:///./src/other/app.css',
    ]);
    expect(result.nodeEnv).toBeUndefined();
    expect(result.fileDependencies).toEqual(
      expect.arrayContaining([
        join(result.root, 'postcss.config.js'),
        join(result.root, 'content.txt'),
      ]),
    );
    expect(result.contextDependencies).toContain(join(result.root, 'content'));
  });

  it('leaves CSS unchanged without a PostCSS config', async () => {
    const result = await compile(sourceFiles);

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.css).toMatch(/\.app\s*\{\s*color:\s*red;?\s*\}/);
    expect(result.css).toMatch(/\.dependency\s*\{\s*color:\s*red;?\s*\}/);
    expect(result.css.match(/color:\s*red/g)).toHaveLength(4);
    expect(result.css).not.toMatch(/green/);
    expect(result.sourceMapSources.sort()).toEqual([
      sourceWithoutLoader('node_modules/@fixture/styles/index.css'),
      sourceWithoutLoader('src/app.css'),
      sourceWithoutLoader('src/app.module.css'),
      sourceWithoutLoader('src/other/app.css'),
    ]);
  });
});
