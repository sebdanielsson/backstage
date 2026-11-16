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

import { ReactNode } from 'react';
import { Flex, Text } from '@backstage/ui';
import {
  ClientPodStatus,
  ClusterObjects,
  groupResponses,
} from '@backstage/plugin-kubernetes-common';
import { DeploymentsAccordions } from '../DeploymentsAccordions';
import { StatefulSetsAccordions } from '../StatefulSetsAccordions';
import { IngressesAccordions } from '../IngressesAccordions';
import { ServicesAccordions } from '../ServicesAccordions';
import { ConfigmapsAccordions } from '../ConfigmapsAccordions';
import { CronJobsAccordions } from '../CronJobsAccordions';
import { CustomResources } from '../CustomResources';
import { DaemonSetsAccordions } from '../DaemonSetsAccordions';
import { PersistentVolumesAccordions } from '../PersistentVolumesAccordions';
import { PersistentVolumeClaimsAccordions } from '../PersistentVolumesClaimsAccordions';
import {
  ClusterContext,
  GroupedResponsesContext,
  PodNamesWithErrorsContext,
} from '../../hooks';

import { StatusError, StatusOK } from '@backstage/core-components';
import { PodMetricsContext } from '../../hooks/usePodMetrics';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../translation';
import { SecretsAccordions } from '../SecretsAccordions';
import { ResourceAccordion } from '../ResourceAccordion';

type ClusterSummaryProps = {
  clusterName: string;
  totalNumberOfPods: number;
  numberOfPodsWithErrors: number;
  children?: ReactNode;
};

const ClusterTitle = ({ clusterName }: { clusterName: string }) => {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  return (
    <Flex direction="column" align="start" gap="0">
      <Text variant="body-large">{clusterName}</Text>
      <Text variant="body-large" color="secondary">
        {t('cluster.label')}
      </Text>
    </Flex>
  );
};

const ClusterStatus = ({
  totalNumberOfPods,
  numberOfPodsWithErrors,
}: Omit<ClusterSummaryProps, 'clusterName'>) => {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  return (
    <>
      <StatusOK>{t('cluster.pods', { count: totalNumberOfPods })}</StatusOK>
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

/**
 * Props for Cluster
 *
 * @public
 */
export type ClusterProps = {
  clusterObjects: ClusterObjects;
  podsWithErrors: Set<string>;
  children?: ReactNode;
};

/**
 * Component for rendering Kubernetes resources in a cluster
 *
 * @public
 */
export const Cluster = ({ clusterObjects, podsWithErrors }: ClusterProps) => {
  const groupedResponses = groupResponses(clusterObjects.resources);

  const clusterName =
    clusterObjects.cluster.title || clusterObjects.cluster.name;
  const podMetricsMap = new Map<string, ClientPodStatus[]>();
  podMetricsMap.set(clusterObjects.cluster.name, clusterObjects.podMetrics);
  return (
    <ClusterContext.Provider value={clusterObjects.cluster}>
      <GroupedResponsesContext.Provider value={groupedResponses}>
        <PodMetricsContext.Provider value={podMetricsMap}>
          <PodNamesWithErrorsContext.Provider value={podsWithErrors}>
            <ResourceAccordion
              label={clusterName}
              start={<ClusterTitle clusterName={clusterName} />}
              status={
                <ClusterStatus
                  totalNumberOfPods={groupedResponses.pods.length}
                  numberOfPodsWithErrors={podsWithErrors.size}
                />
              }
            >
              <Flex direction="column" gap="4">
                {groupedResponses.customResources.length > 0 && (
                  <CustomResources />
                )}
                {groupedResponses.deployments.length > 0 && (
                  <DeploymentsAccordions />
                )}
                {groupedResponses.daemonSets.length > 0 && (
                  <DaemonSetsAccordions />
                )}
                {groupedResponses.statefulsets.length > 0 && (
                  <StatefulSetsAccordions />
                )}
                {groupedResponses.ingresses.length > 0 && (
                  <IngressesAccordions />
                )}
                {groupedResponses.services.length > 0 && <ServicesAccordions />}
                {groupedResponses.configMaps.length > 0 && (
                  <ConfigmapsAccordions />
                )}
                {groupedResponses.secrets.length > 0 && <SecretsAccordions />}
                {groupedResponses.persistentVolumes.length > 0 && (
                  <PersistentVolumesAccordions />
                )}
                {groupedResponses.persistentVolumeClaims.length > 0 && (
                  <PersistentVolumeClaimsAccordions />
                )}
                {groupedResponses.cronJobs.length > 0 && <CronJobsAccordions />}
              </Flex>
            </ResourceAccordion>
          </PodNamesWithErrorsContext.Provider>
        </PodMetricsContext.Provider>
      </GroupedResponsesContext.Provider>
    </ClusterContext.Provider>
  );
};
