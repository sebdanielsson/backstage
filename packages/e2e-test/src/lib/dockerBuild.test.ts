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

import { buildxBuildArgs, buildxCreateArgs } from './dockerBuild';

describe('buildx arguments', () => {
  it('creates a container-driver builder with host networking allowed', () => {
    expect(buildxCreateArgs('e2e-run')).toEqual([
      'buildx',
      'create',
      '--name',
      'e2e-run',
      '--driver',
      'docker-container',
      '--driver-opt',
      'network=host',
      '--buildkitd-flags',
      '--allow-insecure-entitlement network.host',
    ]);
  });

  it('builds with host networking, the npmrc secret, and an image id file', () => {
    expect(
      buildxBuildArgs({
        builder: 'e2e-run',
        contextDir: '/app',
        dockerfile: '/app/packages/backend/Dockerfile',
        npmrcPath: '/tmp/consumer.npmrc',
        iidFile: '/tmp/iid',
      }),
    ).toEqual([
      'buildx',
      'build',
      '--builder',
      'e2e-run',
      '--network',
      'host',
      '--allow',
      'network.host',
      '--secret',
      'id=npmrc,src=/tmp/consumer.npmrc',
      '--load',
      '--iidfile',
      '/tmp/iid',
      '--progress',
      'plain',
      '-f',
      '/app/packages/backend/Dockerfile',
      '/app',
    ]);
  });
});
