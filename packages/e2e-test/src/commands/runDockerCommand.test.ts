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

import type { RegistryFixture } from '../lib/packageRegistry';
import {
  assertSupportedPlatform,
  isNodeVersionAtLeast,
  parseBaseImage,
  runDockerPhases,
  type DockerRunPhases,
} from './runDockerCommand';

describe('runDockerPhases', () => {
  it('runs cleanup when a later phase fails and keeps the original error', async () => {
    const stop = jest.fn(async () => {});
    const phases: DockerRunPhases = {
      prepare: async () => ({
        bootstrapWorkspace: '/workspace',
        repositoryPackageNames: new Set(),
        artifacts: [],
      }),
      startRegistry: async (_prepared, cleanup) => {
        cleanup.add('registry', stop);
        return { stop } as unknown as RegistryFixture;
      },
      generateApp: async () => '/app',
      buildApp: async () => {
        throw new Error('image build failed');
      },
    };

    await expect(runDockerPhases(phases)).rejects.toThrow('image build failed');
    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('assertSupportedPlatform', () => {
  it('only accepts Linux', () => {
    expect(() => assertSupportedPlatform('darwin')).toThrow(/Linux/);
    expect(() => assertSupportedPlatform('linux')).not.toThrow();
  });
});

describe('parseBaseImage', () => {
  it('extracts the node base image from the Dockerfile template', () => {
    expect(
      parseBaseImage('# comment\nFROM node:24-trixie-slim\n\nRUN true\n'),
    ).toBe('node:24-trixie-slim');
    expect(() => parseBaseImage('FROM alpine:3\n')).toThrow(/node base image/);
  });
});

describe('isNodeVersionAtLeast', () => {
  it('compares the version numerically against the minimum', () => {
    expect(isNodeVersionAtLeast('v24.15.0', '24.15.0')).toBe(true);
    expect(isNodeVersionAtLeast('24.22.2', '24.15.0')).toBe(true);
    expect(isNodeVersionAtLeast('24.14.9', '24.15.0')).toBe(false);
    expect(isNodeVersionAtLeast('26.0.0', '24.15.0')).toBe(true);
  });
});
