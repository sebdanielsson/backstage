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
import type { V1PersistentVolumeClaim } from '@kubernetes/client-node';
import { KubernetesStructuredMetadataTableDrawer } from '../KubernetesDrawer';

export const PersistentVolumeClaimsDrawer = ({
  persistentVolumeClaim,
  expanded,
}: {
  persistentVolumeClaim: V1PersistentVolumeClaim;
  expanded?: boolean;
}) => {
  const namespace = persistentVolumeClaim.metadata?.namespace;
  return (
    <KubernetesStructuredMetadataTableDrawer
      object={persistentVolumeClaim}
      expanded={expanded}
      kind="PersistentVolumeClaim"
      renderObject={(persistentVolumeClaimObject: V1PersistentVolumeClaim) => {
        return persistentVolumeClaimObject || {};
      }}
    >
      <Flex direction="column" align="start" gap="0">
        <Text variant="body-large">
          {persistentVolumeClaim.metadata?.name ?? 'unknown object'}
        </Text>
        <Text variant="body-large" color="secondary">
          PersistentVolumeClaim
        </Text>
        {namespace && <Badge size="medium">{`namespace: ${namespace}`}</Badge>}
      </Flex>
    </KubernetesStructuredMetadataTableDrawer>
  );
};
