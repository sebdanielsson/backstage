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

import { createMockDirectory } from '@backstage/backend-test-utils';
import { pathToFileURL } from 'node:url';

// The hooks are a plain ES module outside of src, so they're loaded at runtime
const hooksPath = require.resolve('../config/nodeTransformHooks.mjs');

type Context = {
  conditions: string[] | Set<string>;
  format?: string;
  importAttributes?: Record<string, string>;
};

describe('nodeTransformHooks', () => {
  const mockDir = createMockDirectory({
    content: {
      'package.json': JSON.stringify({ name: 'test' }),
      'lib.ts': 'export const value: number = 1;\n',
      'dir/index.ts': 'export const value: number = 2;\n',
      'data.json': '{ "value": 1 }\n',
    },
  });
  const libUrl = pathToFileURL(mockDir.resolve('lib.ts')).href;
  const dataUrl = pathToFileURL(mockDir.resolve('data.json')).href;
  const dirUrl = pathToFileURL(mockDir.resolve('dir/index.ts')).href;
  const importContext: Context = {
    conditions: ['node', 'import'],
    importAttributes: {},
  };

  const nextResolve = jest.fn((specifier: string, _context: Context) => {
    if (specifier === './lib.ts') {
      return { url: libUrl };
    }
    if (specifier === './data.json') {
      return { url: dataUrl, format: 'json' };
    }
    if (specifier === './dir/index.ts') {
      return { url: dirUrl };
    }
    if (specifier === './dir') {
      throw Object.assign(new Error('Directory import is not supported'), {
        code: 'ERR_UNSUPPORTED_DIR_IMPORT',
      });
    }
    throw Object.assign(new Error(`Cannot find module '${specifier}'`), {
      code: 'ERR_MODULE_NOT_FOUND',
    });
  });
  const nextLoad = jest.fn((url: string, context: Context) => ({
    url,
    format: context.format,
    source: 'source from the next hook',
  }));

  beforeEach(() => {
    nextResolve.mockClear();
    nextLoad.mockClear();
  });

  it('gives the same results from the synchronous and asynchronous hooks', async () => {
    const { resolve, resolveSync, load, loadSync } = await import(hooksPath);
    const asyncNextResolve = async (specifier: string, context: Context) =>
      nextResolve(specifier, context);
    const asyncNextLoad = async (url: string, context: Context) =>
      nextLoad(url, context);

    // The synchronous hooks are called first, so that a failure in them fails
    // the test rather than leaving the asynchronous call unhandled
    for (const specifier of ['./lib', './dir', './data.json']) {
      const expected = resolveSync(specifier, importContext, nextResolve);
      await expect(
        resolve(specifier, importContext, asyncNextResolve),
      ).resolves.toEqual(expected);
    }
    expect(resolveSync('./lib', importContext, nextResolve)).toEqual({
      url: libUrl,
      format: 'commonjs',
    });
    expect(resolveSync('./dir', importContext, nextResolve)).toEqual({
      url: dirUrl,
      format: 'commonjs',
    });
    expect(resolveSync('./data.json', importContext, nextResolve)).toEqual({
      url: dataUrl,
      format: 'commonjs',
      importAttributes: { type: 'json' },
    });
    await expect(
      resolve('./missing', importContext, asyncNextResolve),
    ).rejects.toThrow("Cannot find module './missing'");
    expect(() => resolveSync('./missing', importContext, nextResolve)).toThrow(
      "Cannot find module './missing'",
    );

    const loadContexts: Array<[string, Context]> = [
      [libUrl, { ...importContext, format: 'commonjs' }],
      [libUrl, { ...importContext, format: 'commonjs-typescript' }],
      [
        dataUrl,
        {
          ...importContext,
          format: 'commonjs',
          importAttributes: { type: 'json' },
        },
      ],
    ];
    for (const [url, context] of loadContexts) {
      const expected = loadSync(url, context, nextLoad);
      await expect(load(url, context, asyncNextLoad)).resolves.toEqual(
        expected,
      );
    }
    expect(loadSync(...loadContexts[0], nextLoad)).toEqual({
      url: libUrl,
      format: 'commonjs',
      source: 'source from the next hook',
    });
    expect(loadSync(...loadContexts[1], nextLoad)).toEqual(
      expect.objectContaining({
        format: 'commonjs-typescript',
        source: expect.stringContaining('value'),
        shortCircuit: true,
      }),
    );
    expect(loadSync(...loadContexts[2], nextLoad)).toEqual({
      format: 'json',
      source: '{ "value": 1 }\n',
      shortCircuit: true,
    });
  });

  it('passes require calls on to the next synchronous hook', async () => {
    const { resolveSync, loadSync } = await import(hooksPath);

    for (const conditions of [['require', 'node'], new Set(['require'])]) {
      const context: Context = { conditions };
      expect(() => resolveSync('./lib', context, nextResolve)).toThrow(
        "Cannot find module './lib'",
      );
      expect(resolveSync('./data.json', context, nextResolve)).toEqual({
        url: dataUrl,
        format: 'json',
      });
      expect(
        loadSync(
          libUrl,
          { ...context, format: 'commonjs-typescript' },
          nextLoad,
        ),
      ).toEqual({
        url: libUrl,
        format: 'commonjs-typescript',
        source: 'source from the next hook',
      });
    }
    expect(nextResolve).toHaveBeenCalledTimes(4);
    expect(nextLoad).toHaveBeenCalledTimes(2);
  });
});
