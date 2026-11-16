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
import type { V1Pod, V2HorizontalPodAutoscaler } from '@kubernetes/client-node';
import { Box, Flex, Grid, Text } from '@backstage/ui';
import { RiErrorWarningLine, RiPauseLine } from '@remixicon/react';
import { PodsTable } from '../../Pods';
import { HorizontalPodAutoscalerDrawer } from '../../HorizontalPodAutoscalers';
import { RolloutDrawer } from './RolloutDrawer';
import { DateTime } from 'luxon';
import { StepsProgress } from './StepsProgress';
import {
  PodNamesWithErrorsContext,
  GroupedResponsesContext,
} from '../../../hooks';
import {
  getMatchingHpa,
  getOwnedPodsThroughReplicaSets,
} from '../../../utils/owner';
import { StatusError, StatusOK } from '@backstage/core-components';
import { READY_COLUMNS, RESOURCE_COLUMNS } from '../../Pods/PodsTable';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../../translation';
import { ResourceAccordion } from '../../ResourceAccordion';

type RolloutAccordionsProps = {
  rollouts: any[];
  defaultExpanded?: boolean;
  children?: ReactNode;
};

type RolloutAccordionProps = {
  rollout: any;
  ownedPods: V1Pod[];
  defaultExpanded?: boolean;
  matchingHpa?: V2HorizontalPodAutoscaler;
  children?: ReactNode;
};

type RolloutSummaryProps = {
  rollout: any;
  numberOfCurrentPods: number;
  numberOfPodsWithErrors: number;
  hpa?: V2HorizontalPodAutoscaler;
  children?: ReactNode;
};

const AbortedTitle = (
  <Flex align="center" gap="1">
    <RiErrorWarningLine size={24} aria-hidden />
    <Text variant="body-large">Aborted</Text>
  </Flex>
);

const findAbortedMessage = (rollout: any): string | undefined =>
  rollout.status?.conditions?.find(
    (c: any) =>
      c.type === 'Progressing' &&
      c.status === 'False' &&
      c.reason === 'RolloutAborted',
  )?.message;

const RolloutSummary = ({
  rollout,
  hpa,
}: Pick<RolloutSummaryProps, 'rollout' | 'hpa'>) => {
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
        <RolloutDrawer rollout={rollout} />
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

const RolloutStatus = ({
  rollout,
  numberOfCurrentPods,
  numberOfPodsWithErrors,
}: RolloutSummaryProps) => {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  const pauseTime: string | undefined = rollout.status?.pauseConditions?.find(
    (p: any) => p.reason === 'CanaryPauseStep',
  )?.startTime;
  const abortedMessage = findAbortedMessage(rollout);

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
      {pauseTime && (
        <Flex align="center" gap="1">
          <RiPauseLine size={24} aria-hidden />
          <Text variant="body-large">
            Paused ({DateTime.fromISO(pauseTime).toRelative({ locale: 'en' })})
          </Text>
        </Flex>
      )}
      {abortedMessage && AbortedTitle}
    </>
  );
};

const RolloutAccordion = ({
  rollout,
  ownedPods,
  matchingHpa,
  defaultExpanded,
}: RolloutAccordionProps) => {
  const podNamesWithErrors = useContext(PodNamesWithErrorsContext);

  const podsWithErrors = ownedPods.filter(p =>
    podNamesWithErrors.has(p.metadata?.name ?? ''),
  );

  const currentStepIndex = rollout.status?.currentStepIndex ?? 0;
  const abortedMessage = findAbortedMessage(rollout);

  return (
    <ResourceAccordion
      label={rollout.metadata?.name ?? 'unknown object'}
      defaultExpanded={defaultExpanded}
      start={<RolloutSummary rollout={rollout} hpa={matchingHpa} />}
      status={
        <RolloutStatus
          rollout={rollout}
          numberOfCurrentPods={ownedPods.length}
          numberOfPodsWithErrors={podsWithErrors.length}
        />
      }
    >
      <Flex direction="column" gap="0">
        <Text as="h6" variant="title-x-small" weight="bold">
          Rollout status
        </Text>
        <Box m="4">
          {abortedMessage && (
            <>
              {AbortedTitle}
              <Text variant="body-medium" weight="bold">
                {abortedMessage}
              </Text>
            </>
          )}
          <StepsProgress
            aborted={abortedMessage !== undefined}
            steps={rollout.spec?.strategy?.canary?.steps ?? []}
            currentStepIndex={currentStepIndex}
          />
        </Box>
        <PodsTable
          pods={ownedPods}
          extraColumns={[READY_COLUMNS, RESOURCE_COLUMNS]}
        />
      </Flex>
    </ResourceAccordion>
  );
};

export const RolloutAccordions = ({
  rollouts,
  defaultExpanded = false,
}: RolloutAccordionsProps) => {
  const groupedResponses = useContext(GroupedResponsesContext);

  return (
    <Flex direction="column" gap="4">
      {rollouts.map((rollout, i) => (
        <RolloutAccordion
          key={i}
          defaultExpanded={defaultExpanded}
          matchingHpa={getMatchingHpa(
            {
              name: rollout.metadata?.name,
              namespace: rollout.metadata?.namespace,
              kind: 'rollout',
            },
            groupedResponses.horizontalPodAutoscalers,
          )}
          ownedPods={getOwnedPodsThroughReplicaSets(
            rollout,
            groupedResponses.replicaSets,
            groupedResponses.pods,
          )}
          rollout={rollout}
        />
      ))}
    </Flex>
  );
};
