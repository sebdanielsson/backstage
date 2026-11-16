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
import { ReactNode } from 'react';
import type { V1StatefulSet } from '@kubernetes/client-node';
import { KubernetesStructuredMetadataTableDrawer } from '../KubernetesDrawer';
import { renderCondition } from '../../utils/pod';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../translation';

export const StatefulSetDrawer = ({
  statefulset,
  expanded,
}: {
  statefulset: V1StatefulSet;
  expanded?: boolean;
}) => {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  const namespace = statefulset.metadata?.namespace;
  return (
    <KubernetesStructuredMetadataTableDrawer
      object={statefulset}
      expanded={expanded}
      kind="StatefulSet"
      renderObject={(statefulsetObj: V1StatefulSet) => {
        const conditions = (statefulsetObj.status?.conditions ?? [])
          .map(renderCondition)
          .reduce((accum, next) => {
            accum[next[0]] = next[1];
            return accum;
          }, {} as { [key: string]: ReactNode });

        return {
          updateStrategy: statefulset.spec?.updateStrategy ?? '???',
          podManagementPolicy: statefulset.spec?.podManagementPolicy ?? '???',
          serviceName: statefulset.spec?.serviceName ?? '???',
          selector: statefulset.spec?.selector ?? '???',
          revisionHistoryLimit: statefulset.spec?.revisionHistoryLimit ?? '???',
          ...conditions,
        };
      }}
    >
      <Flex direction="column" align="start" gap="0">
        <Text variant="body-large">
          {statefulset.metadata?.name ?? 'unknown object'}
        </Text>
        <Text variant="body-large" color="secondary">
          Stateful Set
        </Text>
        {namespace && (
          <Badge size="medium">{`${t('namespace.label')} ${namespace}`}</Badge>
        )}
      </Flex>
    </KubernetesStructuredMetadataTableDrawer>
  );
};
