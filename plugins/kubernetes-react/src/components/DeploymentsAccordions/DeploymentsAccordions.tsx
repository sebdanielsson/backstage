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

import { ReactNode, useContext } from 'react';
import type {
  V1Deployment,
  V1Pod,
  V2HorizontalPodAutoscaler,
} from '@kubernetes/client-node';
import { Flex, Grid, Text } from '@backstage/ui';
import { PodsTable } from '../Pods';
import { DeploymentDrawer } from './DeploymentDrawer';
import { HorizontalPodAutoscalerDrawer } from '../HorizontalPodAutoscalers';
import {
  getOwnedPodsThroughReplicaSets,
  getMatchingHpa,
} from '../../utils/owner';
import {
  GroupedResponsesContext,
  PodNamesWithErrorsContext,
} from '../../hooks';
import { StatusError, StatusOK } from '@backstage/core-components';
import { READY_COLUMNS, RESOURCE_COLUMNS } from '../Pods/PodsTable';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../translation';
import { ResourceAccordion } from '../ResourceAccordion';

type DeploymentsAccordionsProps = {
  children?: ReactNode;
};

type DeploymentAccordionProps = {
  deployment: V1Deployment;
  ownedPods: V1Pod[];
  matchingHpa?: V2HorizontalPodAutoscaler;
  children?: ReactNode;
};

type DeploymentSummaryProps = {
  deployment: V1Deployment;
  hpa?: V2HorizontalPodAutoscaler;
  children?: ReactNode;
};

type DeploymentStatusProps = {
  numberOfCurrentPods: number;
  numberOfPodsWithErrors: number;
};

const DeploymentSummary = ({ deployment, hpa }: DeploymentSummaryProps) => {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  const specCpuUtil = hpa?.spec?.metrics?.find(
    metric => metric.type === 'Resource' && metric.resource?.name === 'cpu',
  )?.resource?.target.averageUtilization;

  const cpuUtil = hpa?.status?.currentMetrics?.find(
    metric => metric.type === 'Resource' && metric.resource?.name === 'cpu',
  )?.resource?.current.averageUtilization;

  return (
    <Grid.Root columns="2" gap="4" grow>
      <Grid.Item>
        <DeploymentDrawer deployment={deployment} />
      </Grid.Item>
      {hpa && (
        <Grid.Item>
          <HorizontalPodAutoscalerDrawer hpa={hpa}>
            <Flex direction="column" align="start" gap="0">
              <Text variant="body-medium" weight="bold">
                {t('hpa.replicasSummary', {
                  min: String(hpa.spec?.minReplicas ?? '?'),
                  max: String(hpa.spec?.maxReplicas ?? '?'),
                })}
              </Text>
              <Text variant="body-medium" weight="bold">
                {t('hpa.currentCpuUsageLabel', {
                  value: String(cpuUtil ?? '?'),
                })}
              </Text>
              <Text variant="body-medium" weight="bold">
                {t('hpa.targetCpuUsageLabel', {
                  value: String(specCpuUtil ?? '?'),
                })}
              </Text>
            </Flex>
          </HorizontalPodAutoscalerDrawer>
        </Grid.Item>
      )}
    </Grid.Root>
  );
};

const DeploymentStatus = ({
  numberOfCurrentPods,
  numberOfPodsWithErrors,
}: DeploymentStatusProps) => {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  return (
    <>
      <StatusOK>{t('pods.pods', { count: numberOfCurrentPods })}</StatusOK>
      {numberOfPodsWithErrors > 0 ? (
        <StatusError>
          {t('cluster.podsWithErrors', { count: numberOfPodsWithErrors })}
        </StatusError>
      ) : (
        <StatusOK>{t('cluster.noPodsWithErrors')}</StatusOK>
      )}
    </>
  );
};

const DeploymentAccordion = ({
  deployment,
  ownedPods,
  matchingHpa,
}: DeploymentAccordionProps) => {
  const podNamesWithErrors = useContext(PodNamesWithErrorsContext);

  const podsWithErrors = ownedPods.filter(p =>
    podNamesWithErrors.has(p.metadata?.name ?? ''),
  );

  return (
    <ResourceAccordion
      label={deployment.metadata?.name ?? 'unknown object'}
      start={<DeploymentSummary deployment={deployment} hpa={matchingHpa} />}
      status={
        <DeploymentStatus
          numberOfCurrentPods={ownedPods.length}
          numberOfPodsWithErrors={podsWithErrors.length}
        />
      }
    >
      <PodsTable
        pods={ownedPods}
        extraColumns={[READY_COLUMNS, RESOURCE_COLUMNS]}
      />
    </ResourceAccordion>
  );
};

export const DeploymentsAccordions = ({}: DeploymentsAccordionsProps) => {
  const groupedResponses = useContext(GroupedResponsesContext);

  return (
    <Flex direction="column" gap="4">
      {groupedResponses.deployments.map((deployment, i) => (
        <DeploymentAccordion
          key={i}
          matchingHpa={getMatchingHpa(
            {
              name: deployment.metadata?.name,
              namespace: deployment.metadata?.namespace,
              kind: 'deployment',
            },
            groupedResponses.horizontalPodAutoscalers,
          )}
          ownedPods={getOwnedPodsThroughReplicaSets(
            deployment,
            groupedResponses.replicaSets,
            groupedResponses.pods,
          )}
          deployment={deployment}
        />
      ))}
    </Flex>
  );
};
