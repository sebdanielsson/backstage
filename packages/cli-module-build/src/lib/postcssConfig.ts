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

import postcssLoadConfig from 'postcss-load-config';
import { basename, dirname, extname } from 'node:path';

export type PostcssConfig = Pick<
  postcssLoadConfig.Result,
  'plugins' | 'options'
> & {
  /** The path of the config file, if one was found. */
  configFile?: string;
};

/**
 * Loads the PostCSS config file in the directory of a CSS file or above it.
 * Without a config file, there are no plugins or options.
 *
 * Config functions get `env` as the environment, which defaults to
 * `NODE_ENV`. Without either, postcss-load-config sets `NODE_ENV` to
 * `development` for the whole process.
 */
export async function loadPostcssConfig(
  file: string,
  env?: string,
): Promise<PostcssConfig> {
  // The same context that rollup-plugin-postcss gave config functions, which
  // can depend on the file
  const ctx: postcssLoadConfig.ConfigContext & {
    file: { extname: string; dirname: string; basename: string };
    options: {};
  } = {
    ...(env ? { env } : {}),
    file: {
      extname: extname(file),
      dirname: dirname(file),
      basename: basename(file),
    },
    options: {},
  };
  try {
    const result = await postcssLoadConfig(ctx, dirname(file));
    // The config is loaded again for each file. ES modules are imported anew
    // each time, but CommonJS ones come from the module cache, which would
    // keep edits from applying until the process restarts. The cache uses the
    // real path of the file.
    delete require.cache[require.resolve(result.file)];
    return {
      plugins: result.plugins,
      options: result.options,
      configFile: result.file,
    };
  } catch (error) {
    if (error?.message?.includes('No PostCSS Config found')) {
      return { plugins: [], options: {} };
    }
    throw error;
  }
}
