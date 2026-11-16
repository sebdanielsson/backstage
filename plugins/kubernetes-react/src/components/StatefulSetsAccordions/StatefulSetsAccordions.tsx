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
  V1Pod,
  V2HorizontalPodAutoscaler,
  V1StatefulSet,
} from '@kubernetes/client-node';
import { Flex, Grid, Text } from '@backstage/ui';
import { PodsTable } from '../Pods';
import { StatefulSetDrawer } from './StatefulSetDrawer';
import { HorizontalPodAutoscalerDrawer } from '../HorizontalPodAutoscalers';
import { getMatchingHpa, getOwnedResources } from '../../utils/owner';
import {
  GroupedResponsesContext,
  PodNamesWithErrorsContext,
} from '../../hooks';
import { StatusError, StatusOK } from '@backstage/core-components';
import { READY_COLUMNS, RESOURCE_COLUMNS } from '../Pods/PodsTable';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../translation';
import { ResourceAccordion } from '../ResourceAccordion';

type StatefulSetsAccordionsProps = {
  children?: ReactNode;
};

type StatefulSetAccordionProps = {
  statefulset: V1StatefulSet;
  ownedPods: V1Pod[];
  matchingHpa?: V2HorizontalPodAutoscaler;
  children?: ReactNode;
};

type StatefulSetSummaryProps = {
  statefulset: V1StatefulSet;
  numberOfCurrentPods: number;
  numberOfPodsWithErrors: number;
  hpa?: V2HorizontalPodAutoscaler;
  children?: ReactNode;
};

const StatefulSetSummary = ({
  statefulset,
  hpa,
}: Pick<StatefulSetSummaryProps, 'statefulset' | 'hpa'>) => {
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
        <StatefulSetDrawer statefulset={statefulset} />
      </Grid.Item>
      {hpa && (
        <Grid.Item>
          <HorizontalPodAutoscalerDrawer hpa={hpa}>
            <Flex direction="column" align="start" gap="0">
              <Text variant="body-medium" weight="bold">
                {t('hpa.minReplicas')} {hpa.spec?.minReplicas ?? '?'} /{' '}
                {t('hpa.maxReplicas')} {hpa.spec?.maxReplicas ?? '?'}
              </Text>
              <Text variant="body-medium" weight="bold">
                {t('hpa.currentCpuUsage')} {cpuUtil ?? '?'}%
              </Text>
              <Text variant="body-medium" weight="bold">
                {t('hpa.targetCpuUsage')} {specCpuUtil ?? '?'}%
              </Text>
            </Flex>
          </HorizontalPodAutoscalerDrawer>
        </Grid.Item>
      )}
    </Grid.Root>
  );
};

const StatefulSetStatus = ({
  numberOfCurrentPods,
  numberOfPodsWithErrors,
}: Pick<
  StatefulSetSummaryProps,
  'numberOfCurrentPods' | 'numberOfPodsWithErrors'
>) => {
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

const StatefulSetAccordion = ({
  statefulset,
  ownedPods,
  matchingHpa,
}: StatefulSetAccordionProps) => {
  const podNamesWithErrors = useContext(PodNamesWithErrorsContext);

  const podsWithErrors = ownedPods.filter(p =>
    podNamesWithErrors.has(p.metadata?.name ?? ''),
  );

  return (
    <ResourceAccordion
      label={statefulset.metadata?.name ?? 'unknown object'}
      start={<StatefulSetSummary statefulset={statefulset} hpa={matchingHpa} />}
      status={
        <StatefulSetStatus
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

export const StatefulSetsAccordions = ({}: StatefulSetsAccordionsProps) => {
  const groupedResponses = useContext(GroupedResponsesContext);

  return (
    <Flex direction="column" gap="4">
      {groupedResponses.statefulsets.map((statefulset, i) => (
        <StatefulSetAccordion
          key={i}
          matchingHpa={getMatchingHpa(
            {
              name: statefulset.metadata?.name,
              namespace: statefulset.metadata?.namespace,
              kind: 'statefulset',
            },
            groupedResponses.horizontalPodAutoscalers,
          )}
          ownedPods={getOwnedResources(statefulset, groupedResponses.pods)}
          statefulset={statefulset}
        />
      ))}
    </Flex>
  );
};
