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
import type { V1Deployment } from '@kubernetes/client-node';
import { KubernetesStructuredMetadataTableDrawer } from '../KubernetesDrawer';
import { renderCondition } from '../../utils/pod';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../translation';

export const DeploymentDrawer = ({
  deployment,
  expanded,
}: {
  deployment: V1Deployment;
  expanded?: boolean;
}) => {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  const namespace = deployment.metadata?.namespace;
  return (
    <KubernetesStructuredMetadataTableDrawer
      object={deployment}
      expanded={expanded}
      kind="Deployment"
      renderObject={(deploymentObj: V1Deployment) => {
        const conditions = (deploymentObj.status?.conditions ?? [])
          .map(renderCondition)
          .reduce((accum, next) => {
            accum[next[0]] = next[1];
            return accum;
          }, {} as { [key: string]: ReactNode });

        return {
          strategy: deploymentObj.spec?.strategy ?? '???',
          minReadySeconds: deploymentObj.spec?.minReadySeconds ?? '???',
          progressDeadlineSeconds:
            deploymentObj.spec?.progressDeadlineSeconds ?? '???',
          ...conditions,
        };
      }}
    >
      <Flex direction="column" align="start" gap="0">
        <Text variant="body-large">
          {deployment.metadata?.name ?? 'unknown object'}
        </Text>
        <Text variant="body-large" color="secondary">
          Deployment
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
