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

import type { LoaderContext, RawSourceMap } from '@rspack/core';
import postcss from 'postcss';
import { dirname, resolve as resolvePath } from 'node:path';
import { loadPostcssConfig } from '../postcssConfig';

// Sources from the source maps of imported files may not be valid URLs
function decodeSource(source: string) {
  try {
    return decodeURIComponent(source);
  } catch {
    return source;
  }
}

async function processCss(
  context: LoaderContext,
  css: string,
  map?: string | RawSourceMap,
): Promise<{ css: string; map?: string | RawSourceMap }> {
  // Config functions get the mode of the build as the environment
  const { plugins, options, configFile } = await loadPostcssConfig(
    context.resourcePath,
    context.mode,
  );
  if (!configFile) {
    return { css, map };
  }
  context.addDependency(configFile);

  const result = await postcss([
    ...plugins,
    // Without any plugins PostCSS skips parsing, and the source map maps all
    // of the CSS to the first line
    { postcssPlugin: 'backstage-postcss-loader' },
  ]).process(css, {
    ...options,
    from: context.resourcePath,
    to: context.resourcePath,
    // Like Rspack without this loader, ignore source maps that the CSS
    // references itself
    map: context.sourceMap
      ? { inline: false, annotation: false, prev: map ?? false }
      : false,
  });

  for (const warning of result.warnings()) {
    context.emitWarning(new Error(warning.toString()));
  }
  for (const message of result.messages) {
    if (message.type === 'dependency') {
      context.addDependency(message.file);
    } else if (message.type === 'dir-dependency') {
      context.addContextDependency(message.dir);
    }
  }

  // PostCSS writes the sources of the map as URLs relative to the CSS file,
  // while Rspack expects paths
  const resultMap = result.map?.toJSON();
  return {
    css: result.css,
    map:
      resultMap &&
      JSON.stringify({
        ...resultMap,
        file: undefined,
        sources: resultMap.sources.map(source =>
          // Placeholders for CSS without a file, and URLs from the source maps
          // of imported files
          source.startsWith('<') || /^\w+:\/\//.test(source)
            ? source
            : resolvePath(dirname(context.resourcePath), decodeSource(source)),
        ),
      }),
  };
}

/**
 * Rspack loader that applies the PostCSS config file in the directory of a
 * CSS file or above it, in the same way as package builds. CSS files without a
 * config file are left unchanged.
 */
export default function postcssLoader(
  this: LoaderContext,
  css: string,
  map?: string | RawSourceMap,
) {
  const callback = this.async();
  processCss(this, css, map).then(
    result => callback(null, result.css, result.map),
    error => {
      // Keeps watching a file with a syntax error, for example an imported
      // one, so that fixing it triggers a rebuild
      if (error?.file) {
        this.addDependency(error.file);
      }
      callback(error);
    },
  );
}

// The bundler config refers to the loader by path. Reading the path from the
// loader function also keeps the function in the build output.
postcssLoader.path = __filename;
