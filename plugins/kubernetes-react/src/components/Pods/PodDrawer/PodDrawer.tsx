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

import { ItemCardGrid } from '@backstage/core-components';
import { Flex, Grid, Text } from '@backstage/ui';

import { Pod } from 'kubernetes-models/v1';

import { ContainerCard } from './ContainerCard';

import { PodAndErrors } from '../types';
import { KubernetesDrawer } from '../../KubernetesDrawer';
import { PodDeleteButton } from '../PodDelete/PodDeleteButton';
import { PendingPodContent } from './PendingPodContent';
import { ErrorList } from '../ErrorList';
import { usePodMetrics } from '../../../hooks/usePodMetrics';
import { ResourceUtilization } from '../../ResourceUtilization';
import { bytesToMiB, formatMillicores } from '../../../utils/resources';
import { useIsPodDeleteEnabled } from '../../../hooks';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../../translation';
import styles from './PodDrawer.module.css';

function getContainerSpecByName(pod: Pod, containerName: string) {
  return pod.spec?.containers.find(c => c.name === containerName);
}

/**
 * Props for PodDrawer
 *
 * @public
 */
export interface PodDrawerProps {
  open?: boolean;
  podAndErrors: PodAndErrors;
}

/**
 * A Drawer for Kubernetes Pods
 *
 * @public
 */
export const PodDrawer = ({ podAndErrors, open }: PodDrawerProps) => {
  const podMetrics = usePodMetrics(podAndErrors.cluster.name, podAndErrors.pod);
  const isPodDeleteEnabled = useIsPodDeleteEnabled();
  const { t } = useTranslationRef(kubernetesReactTranslationRef);

  return (
    <KubernetesDrawer
      open={open}
      drawerContentsHeader={
        <Text variant="body-large">
          Pod{' '}
          {podAndErrors.pod.status?.podIP &&
            `(${podAndErrors.pod.status?.podIP})`}
        </Text>
      }
      kubernetesObject={podAndErrors.pod}
      label={
        <Text variant="body-large">
          {podAndErrors.pod.metadata?.name ?? 'unknown'}
        </Text>
      }
    >
      <div className={styles.content}>
        {isPodDeleteEnabled && (
          <PodDeleteButton
            podScope={{
              podName: podAndErrors.pod.metadata?.name ?? 'unknown',
              podNamespace: podAndErrors.pod.metadata?.namespace ?? 'default',
              cluster: podAndErrors.cluster,
            }}
          />
        )}
        {podMetrics && (
          <Grid.Root columns="2" gap="4">
            <Grid.Item colSpan="2">
              <Text as="h5" variant="title-small" weight="bold">
                {t('podDrawer.resourceUtilization')}
              </Text>
            </Grid.Item>
            <Grid.Item>
              <ResourceUtilization
                title={t('podDrawer.cpuRequests')}
                usage={podMetrics.cpu.currentUsage}
                total={podMetrics.cpu.requestTotal}
                totalFormatted={formatMillicores(podMetrics.cpu.requestTotal)}
              />
              <ResourceUtilization
                title={t('podDrawer.cpuLimits')}
                usage={podMetrics.cpu.currentUsage}
                total={podMetrics.cpu.limitTotal}
                totalFormatted={formatMillicores(podMetrics.cpu.limitTotal)}
              />
            </Grid.Item>
            <Grid.Item>
              <ResourceUtilization
                title={t('podDrawer.memoryRequests')}
                usage={podMetrics.memory.currentUsage}
                total={podMetrics.memory.requestTotal}
                totalFormatted={bytesToMiB(podMetrics.memory.requestTotal)}
              />
              <ResourceUtilization
                title={t('podDrawer.memoryLimits')}
                usage={podMetrics.memory.currentUsage}
                total={podMetrics.memory.limitTotal}
                totalFormatted={bytesToMiB(podMetrics.memory.limitTotal)}
              />
            </Grid.Item>
          </Grid.Root>
        )}
        {podAndErrors.pod.status?.phase === 'Pending' && (
          <PendingPodContent pod={podAndErrors.pod} />
        )}
        {podAndErrors.pod.status?.containerStatuses?.length && (
          <Flex direction="column" gap="4">
            <Text as="h5" variant="title-small" weight="bold">
              Containers
            </Text>
            <ItemCardGrid>
              {podAndErrors.pod.status?.containerStatuses?.map(
                (containerStatus, i) => {
                  const containerSpec = getContainerSpecByName(
                    podAndErrors.pod,
                    containerStatus.name,
                  );
                  const containerMetrics = (podMetrics?.containers ?? []).find(
                    c => c.container === containerStatus.name,
                  );
                  return (
                    <ContainerCard
                      key={`container-card-${podAndErrors.pod.metadata?.name}-${i}`}
                      containerMetrics={containerMetrics}
                      podScope={{
                        podName: podAndErrors.pod.metadata?.name ?? 'unknown',
                        podNamespace:
                          podAndErrors.pod.metadata?.namespace ?? 'unknown',
                        cluster: podAndErrors.cluster,
                      }}
                      containerSpec={containerSpec}
                      containerStatus={containerStatus}
                    />
                  );
                },
              )}
            </ItemCardGrid>
            {podAndErrors.errors.length > 0 && (
              <Text as="h5" variant="title-small" weight="bold">
                Errors
              </Text>
            )}
            {podAndErrors.errors.length > 0 && (
              <ErrorList podAndErrors={[podAndErrors]} />
            )}
          </Flex>
        )}
      </div>
    </KubernetesDrawer>
  );
};
