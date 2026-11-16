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
import { Badge, Flex, Text } from '@backstage/ui';
import { KubernetesStructuredMetadataTableDrawer } from '../KubernetesDrawer';
import type { V1ConfigMap } from '@kubernetes/client-node';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../translation';

export const ConfigmapsDrawer = ({
  configmap,
  expanded,
}: {
  configmap: V1ConfigMap;
  expanded?: boolean;
}) => {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  const namespace = configmap.metadata?.namespace;
  return (
    <KubernetesStructuredMetadataTableDrawer
      object={configmap}
      expanded={expanded}
      kind="ConfigMap"
      renderObject={(configmapObject: V1ConfigMap) => {
        return configmapObject || {};
      }}
    >
      <Flex direction="column" align="start" gap="0">
        <Text variant="body-large">
          {configmap.metadata?.name ?? 'unknown object'}
        </Text>
        <Text variant="body-large" color="secondary">
          ConfigMap
        </Text>
        {namespace && (
          <Badge size="medium">
            {t('namespace.labelWithValue', { namespace })}
          </Badge>
        )}
      </Flex>
    </KubernetesStructuredMetadataTableDrawer>
  );
};
