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
import { StructuredMetadataTable } from '@backstage/core-components';
import { ClientContainerStatus } from '@backstage/plugin-kubernetes-common';
import {
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Flex,
  Text,
} from '@backstage/ui';
import { IContainer, IContainerStatus } from 'kubernetes-models/v1';
import { DateTime } from 'luxon';

import { useIsPodExecTerminalEnabled } from '../../../hooks';
import { bytesToMiB, formatMillicores } from '../../../utils/resources';
import { PodExecTerminalDialog } from '../../PodExecTerminal/PodExecTerminalDialog';
import { ResourceUtilization } from '../../ResourceUtilization';
import { PodLogsDialog, PodScope } from '../PodLogs';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../../translation';

const getContainerHealthChecks = (
  containerSpec: IContainer,
  containerStatus: IContainerStatus,
): { [key: string]: boolean } => {
  const healthCheck = {
    'not waiting to start': containerStatus.state?.waiting === undefined,
    'no restarts': containerStatus.restartCount === 0,
  };
  if (containerStatus.state?.terminated?.reason === 'Completed') {
    return healthCheck;
  }
  Object.assign(
    healthCheck,
    { started: !!containerStatus.started },
    { ready: containerStatus.ready },
    { 'readiness probe set': containerSpec?.readinessProbe !== undefined },
  );
  if (containerSpec && containerSpec?.livenessProbe !== undefined) {
    Object.assign(healthCheck, {
      'liveness probe set': containerSpec.livenessProbe,
    });
  }
  return healthCheck;
};

const getCurrentState = (containerStatus: IContainerStatus): string => {
  return (
    containerStatus.state?.waiting?.reason ||
    containerStatus.state?.terminated?.reason ||
    (containerStatus.state?.running !== undefined ? 'Running' : 'Unknown')
  );
};

const getStartedAtTime = (
  containerStatus: IContainerStatus,
): string | undefined => {
  return (
    containerStatus.state?.running?.startedAt ||
    containerStatus.state?.terminated?.startedAt
  );
};

interface ContainerDatetimeProps {
  prefix: string;
  dateTime: string;
}

const ContainerDatetime = ({ prefix, dateTime }: ContainerDatetimeProps) => {
  return (
    <Text as="p" variant="body-medium" weight="bold">
      {prefix}:{' '}
      {DateTime.fromISO(dateTime).toRelative({
        locale: 'en',
      })}
    </Text>
  );
};

/**
 * Props for ContainerCard
 *
 * @public
 */
export interface ContainerCardProps {
  podScope: PodScope;
  containerSpec?: IContainer;
  containerStatus: IContainerStatus;
  containerMetrics?: ClientContainerStatus;
}

/**
 * Shows details about a container within a pod
 *
 * @public
 */
export function ContainerCard({
  podScope,
  containerSpec,
  containerStatus,
  containerMetrics,
}: ContainerCardProps) {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  const isPodExecTerminalEnabled = useIsPodExecTerminalEnabled();

  // This should never be undefined
  if (containerSpec === undefined) {
    return (
      <Text as="p" variant="body-large">
        error reading pod from cluster
      </Text>
    );
  }
  const containerStartedTime = getStartedAtTime(containerStatus);
  const containerFinishedTime = containerStatus.state?.terminated?.finishedAt;

  return (
    <Card>
      <CardHeader>
        <Text as="h3" variant="title-small" weight="bold">
          {containerStatus.name}
        </Text>
        <Text as="p" variant="body-large" color="secondary">
          {containerStatus.image}
        </Text>
      </CardHeader>
      <CardBody>
        <Flex direction="column" gap="4">
          <div>
            {containerStartedTime && (
              <ContainerDatetime
                prefix="Started"
                dateTime={containerStartedTime}
              />
            )}
            {containerFinishedTime && (
              <ContainerDatetime
                prefix="Completed"
                dateTime={containerFinishedTime}
              />
            )}
            {containerStartedTime && containerFinishedTime && (
              <Text as="p" variant="body-medium" weight="bold">
                Execution time:{' '}
                {DateTime.fromISO(containerFinishedTime)
                  .diff(DateTime.fromISO(containerStartedTime), [
                    'hours',
                    'minutes',
                    'seconds',
                  ])
                  .toHuman()}
              </Text>
            )}
          </div>
          <Text as="p" variant="body-medium" weight="bold">
            Status: {getCurrentState(containerStatus)}
          </Text>
          {containerStatus.restartCount > 0 && (
            <Text as="p" variant="body-medium" weight="bold">
              Restarts: {containerStatus.restartCount}
            </Text>
          )}
          <Text as="p" variant="body-medium" weight="bold">
            Container health
          </Text>
          <StructuredMetadataTable
            metadata={getContainerHealthChecks(containerSpec, containerStatus)}
            options={{ nestedValuesAsYaml: true }}
          />
          {containerMetrics && (
            <div>
              <Text as="p" variant="body-large">
                {t('podDrawer.resourceUtilization')}
              </Text>
              <div style={{ minHeight: '5rem' }}>
                <ResourceUtilization
                  compressed
                  title={t('podDrawer.cpuRequests')}
                  usage={containerMetrics.cpuUsage.currentUsage}
                  total={containerMetrics.cpuUsage.requestTotal}
                  totalFormatted={formatMillicores(
                    containerMetrics.cpuUsage.requestTotal,
                  )}
                />
                <ResourceUtilization
                  compressed
                  title={t('podDrawer.cpuLimits')}
                  usage={containerMetrics.cpuUsage.currentUsage}
                  total={containerMetrics.cpuUsage.limitTotal}
                  totalFormatted={formatMillicores(
                    containerMetrics.cpuUsage.limitTotal,
                  )}
                />
                <ResourceUtilization
                  compressed
                  title={t('podDrawer.memoryRequests')}
                  usage={containerMetrics.memoryUsage.currentUsage}
                  total={containerMetrics.memoryUsage.requestTotal}
                  totalFormatted={bytesToMiB(
                    containerMetrics.memoryUsage.requestTotal,
                  )}
                />
                <ResourceUtilization
                  compressed
                  title={t('podDrawer.memoryLimits')}
                  usage={containerMetrics.memoryUsage.currentUsage}
                  total={containerMetrics.memoryUsage.limitTotal}
                  totalFormatted={bytesToMiB(
                    containerMetrics.memoryUsage.limitTotal,
                  )}
                />
              </div>
            </div>
          )}
        </Flex>
      </CardBody>
      <CardFooter>
        <Flex justify="end" gap="2">
          <PodLogsDialog
            containerScope={{
              containerName: containerStatus.name,
              ...podScope,
            }}
          />
          {isPodExecTerminalEnabled && (
            <PodExecTerminalDialog
              cluster={podScope.cluster}
              containerName={containerStatus.name}
              podName={podScope.podName}
              podNamespace={podScope.podNamespace}
            />
          )}
        </Flex>
      </CardFooter>
    </Card>
  );
}
