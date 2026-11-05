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

import { RuleSetRule } from '@rspack/core';
import postcssLoader from './postcssLoader';
import { STATIC_ASSET_HASH_LENGTH } from './staticAssetHash';

type Transforms = {
  loaders: RuleSetRule[];
};

type TransformOptions = {
  isDev: boolean;
  isBackend?: boolean;
};

export const transforms = (options: TransformOptions): Transforms => {
  const { isDev, isBackend } = options;

  const loaders = [
    {
      test: /\.(tsx?)$/,
      exclude: /node_modules/,
      use: [
        {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              target: 'es2024',
              externalHelpers: !isBackend,
              parser: {
                syntax: 'typescript',
                tsx: !isBackend,
                dynamicImport: true,
              },
              transform: {
                react: isBackend
                  ? undefined
                  : {
                      runtime: 'automatic',
                      refresh: isDev,
                    },
              },
            },
          },
        },
      ],
    },
    {
      test: /\.(jsx?|mjs|cjs)$/,
      exclude: /node_modules/,
      use: [
        {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              target: 'es2024',
              externalHelpers: !isBackend,
              parser: {
                syntax: 'ecmascript',
                jsx: !isBackend,
                dynamicImport: true,
              },
              transform: {
                react: isBackend
                  ? undefined
                  : {
                      runtime: 'automatic',
                      refresh: isDev,
                    },
              },
            },
          },
        },
      ],
    },
    {
      test: /\.(js|mjs|cjs)$/,
      resolve: {
        fullySpecified: false,
      },
    },
    {
      test: [
        /\.bmp$/,
        /\.gif$/,
        /\.jpe?g$/,
        /\.png$/,
        /\.frag$/,
        /\.vert$/,
        { and: [/\.svg$/, { not: [/\.icon\.svg$/] }] },
        /\.xml$/,
        /\.ico$/,
        /\.webp$/,
      ],
      type: 'asset/resource',
      generator: {
        filename: `static/[name].[hash:${STATIC_ASSET_HASH_LENGTH}][ext]`,
      },
    },
    {
      test: /\.(eot|woff|woff2|ttf)$/i,
      type: 'asset/resource',
      generator: {
        filename: `static/[name].[hash:${STATIC_ASSET_HASH_LENGTH}][ext][query]`,
      },
    },
    {
      test: /\.ya?ml$/,
      use: require.resolve('yml-loader'),
    },
    {
      include: /\.(md)$/,
      type: 'asset/resource',
      generator: {
        filename: `static/[name].[hash:${STATIC_ASSET_HASH_LENGTH}][ext][query]`,
      },
    },
    {
      test: /\.css$/i,
      type: 'css/auto',
      parser: {
        // Keeps the default export of CSS modules, as in
        // `import styles from './styles.module.css'`
        namedExports: false,
        // Development builds inject styles from JavaScript, while production
        // builds emit separate stylesheets
        exportType: isDev ? 'style' : 'link',
        // Only rename class names, IDs and keyframes in CSS modules, like
        // css-loader did. This keeps for example custom properties global, so
        // that they can be set from outside the module.
        dashedIdents: false,
        customIdents: false,
        container: false,
        grid: false,
        function: false,
      },
      rules: [
        {
          // Only the CSS of the app and its workspace packages, not of
          // dependencies
          exclude: /node_modules/,
          use: [{ loader: postcssLoader.path }],
        },
      ],
    },
  ];

  return { loaders };
};
