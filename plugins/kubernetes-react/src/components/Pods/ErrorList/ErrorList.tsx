/*
 * Copyright 2023 The Backstage Authors
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
import { Card, Grid, Text } from '@backstage/ui';
import { PodAndErrors } from '../types';
import { FixDialog } from '../FixDialog/FixDialog';
import styles from './ErrorList.module.css';

/**
 * Props for ErrorList
 *
 * @public
 */
export interface ErrorListProps {
  podAndErrors: PodAndErrors[];
}

/**
 * Shows a list of errors found on a Pod
 *
 * @public
 */
export const ErrorList = ({ podAndErrors }: ErrorListProps) => {
  return (
    <Card>
      <ul className={styles.list}>
        {podAndErrors
          .filter(pae => pae.errors.length > 0)
          .flatMap(onlyPodWithErrors => {
            return onlyPodWithErrors.errors.map((error, i) => {
              return (
                <li
                  key={`${
                    onlyPodWithErrors.pod.metadata?.name ?? 'unknown'
                  }-eli-${i}`}
                  className={styles.item}
                >
                  <Grid.Root columns="12" gap="0">
                    <Grid.Item colSpan="9">
                      <Text as="p" variant="body-large">
                        {error.message}
                      </Text>
                      <Text as="p" variant="body-medium" color="secondary">
                        {onlyPodWithErrors.pod.metadata?.name}
                      </Text>
                    </Grid.Item>
                    <Grid.Item colSpan="3">
                      <FixDialog
                        pod={onlyPodWithErrors.pod}
                        error={error}
                        clusterName={onlyPodWithErrors.cluster.name}
                      />
                    </Grid.Item>
                  </Grid.Root>
                </li>
              );
            });
          })}
      </ul>
    </Card>
  );
};
