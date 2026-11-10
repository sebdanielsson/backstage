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

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const MINIMUM_NODE_VERSION = '24.15.0';
const DOCKERFILE_PATH = path.join(
  __dirname,
  '..',
  'packages/create-app/templates/default-app/packages/backend/Dockerfile.hbs',
);

/**
 * Returns the image and tag from the single unconditional FROM line of a
 * backend Dockerfile template.
 */
function parseBaseImage(dockerfileText) {
  const fromLines = dockerfileText.match(/^FROM\s+(\S+)\s*$/gim) ?? [];
  if (fromLines.length !== 1) {
    throw new Error(
      `Expected a single FROM line in the backend Dockerfile template, found ${fromLines.length}`,
    );
  }

  const image = fromLines[0].replace(/^FROM\s+/i, '').trim();
  const tagIndex = image.lastIndexOf(':');
  if (tagIndex <= image.lastIndexOf('/')) {
    throw new Error(`The base image ${image} does not include a tag`);
  }
  return { image, tag: image.slice(tagIndex + 1) };
}

function isNodeVersionAtLeast(version, minimum) {
  const current = version.replace(/^v/, '').split('.').map(Number);
  const required = minimum.split('.').map(Number);
  for (let i = 0; i < required.length; i++) {
    if ((current[i] ?? 0) !== required[i]) {
      return (current[i] ?? 0) > required[i];
    }
  }
  return true;
}

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim();
}

function readDigest(image) {
  const repoDigests = JSON.parse(
    docker(['image', 'inspect', '--format', '{{json .RepoDigests}}', image]),
  );
  if (repoDigests.length > 0) {
    return repoDigests[0].slice(repoDigests[0].indexOf('@') + 1);
  }
  return docker(['image', 'inspect', '--format', '{{.Id}}', image]);
}

function setOutput(name, value) {
  const entry = `${name}=${value}\n`;
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, entry);
  } else {
    process.stdout.write(entry);
  }
}

function main() {
  const { image } = parseBaseImage(fs.readFileSync(DOCKERFILE_PATH, 'utf8'));
  execFileSync('docker', ['pull', image], { stdio: 'inherit' });

  const digest = readDigest(image);
  const nodeVersion = docker([
    'run',
    '--rm',
    '--entrypoint',
    'node',
    image,
    '--version',
  ]);
  if (!isNodeVersionAtLeast(nodeVersion, MINIMUM_NODE_VERSION)) {
    throw new Error(
      `The template base image ${image} provides Node ${nodeVersion}, expected at least ${MINIMUM_NODE_VERSION}`,
    );
  }

  setOutput('image', image);
  setOutput('digest', digest);
  setOutput('node-version', nodeVersion.replace(/^v/, ''));
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = { parseBaseImage };
