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

import http from 'node:http';
import { HttpRequestInterceptor } from '@mswjs/interceptors/http';

describe('jest-environment-jsdom', () => {
  const interceptor = new HttpRequestInterceptor();

  beforeAll(() => {
    interceptor.on('request', ({ controller }) => {
      controller.respondWith(new Response('mocked'));
    });
    interceptor.apply();
  });

  afterAll(() => interceptor.dispose());

  it('supports mocking node:http requests next to the DOM', async () => {
    expect(document.createElement('div')).toBeInstanceOf(HTMLElement);

    const cancelled = jest.fn();
    clearImmediate(setImmediate(cancelled));
    await new Promise(resolve => setImmediate(resolve));
    expect(cancelled).not.toHaveBeenCalled();

    const body = await new Promise<string>((resolve, reject) => {
      http
        .get('http://example.test/', res => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', chunk => {
            data += chunk;
          });
          res.on('end', () => resolve(data));
        })
        .on('error', reject);
    });
    expect(body).toBe('mocked');
  });
});
