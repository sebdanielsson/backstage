/*
 * Copyright 2021 The Backstage Authors
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
import { Badge, Flex, Text } from '@backstage/ui';
import type { V1PersistentVolume } from '@kubernetes/client-node';
import { KubernetesStructuredMetadataTableDrawer } from '../KubernetesDrawer';

export const PersistentVolumesDrawer = ({
  persistentVolume,
  expanded,
}: {
  persistentVolume: V1PersistentVolume;
  expanded?: boolean;
}) => {
  const namespace = persistentVolume.metadata?.namespace;
  return (
    <KubernetesStructuredMetadataTableDrawer
      object={persistentVolume}
      expanded={expanded}
      kind="PersistentVolume"
      renderObject={(persistentVolumeObject: V1PersistentVolume) => {
        return persistentVolumeObject || {};
      }}
    >
      <Flex direction="column" align="start" gap="0">
        <Text variant="body-large">
          {persistentVolume.metadata?.name ?? 'unknown object'}
        </Text>
        <Text variant="body-large" color="secondary">
          PersistentVolume
        </Text>
        {namespace && <Badge size="medium">{`namespace: ${namespace}`}</Badge>}
      </Flex>
    </KubernetesStructuredMetadataTableDrawer>
  );
};
