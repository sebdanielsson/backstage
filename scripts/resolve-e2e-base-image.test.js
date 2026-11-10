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

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { parseBaseImage } = require('./resolve-e2e-base-image');

test('reads the single unconditional Node FROM image', () => {
  assert.deepEqual(parseBaseImage('FROM node:24-trixie-slim\nRUN echo hi\n'), {
    image: 'node:24-trixie-slim',
    tag: '24-trixie-slim',
  });
});

test('fails when the Dockerfile has multiple or no FROM lines', () => {
  assert.throws(() => parseBaseImage('RUN echo hi\n'), /single FROM/i);
  assert.throws(
    () => parseBaseImage('FROM node:24\nFROM node:26\n'),
    /single FROM/i,
  );
});
