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

/**
 * Collects disposers that must run when a command finishes, so that every
 * resource is released even if an earlier disposer fails.
 */
export type CleanupStack = {
  add(label: string, fn: () => Promise<void>): void;
  run(): Promise<string[]>;
};

export function createCleanupStack(): CleanupStack {
  const disposers: { label: string; fn: () => Promise<void> }[] = [];
  return {
    add(label, fn) {
      disposers.push({ label, fn });
    },
    async run() {
      const failures: string[] = [];
      for (let i = disposers.length - 1; i >= 0; i--) {
        const { label, fn } = disposers[i];
        try {
          await fn();
        } catch (error) {
          failures.push(
            `${label}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
      return failures;
    },
  };
}
