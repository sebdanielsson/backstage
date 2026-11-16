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

import { Flex } from '@backstage/ui';
import { ResourceAccordion } from '../ResourceAccordion';
import { ReactNode, useContext } from 'react';
import type { V1Pod, V1DaemonSet } from '@kubernetes/client-node';
import { PodsTable } from '../Pods';
import { DaemonSetDrawer } from './DaemonSetsDrawer';
import { getOwnedResources } from '../../utils/owner';
import {
  GroupedResponsesContext,
  PodNamesWithErrorsContext,
} from '../../hooks';
import { StatusError, StatusOK } from '@backstage/core-components';
import { READY_COLUMNS, RESOURCE_COLUMNS } from '../Pods/PodsTable';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../translation';

type DaemonSetsAccordionsProps = {
  children?: ReactNode;
};

type DaemonSetAccordionProps = {
  daemonset: V1DaemonSet;
  ownedPods: V1Pod[];
  children?: ReactNode;
};

type DaemonSetSummaryProps = {
  daemonset: V1DaemonSet;
  numberOfCurrentPods: number;
  numberOfPodsWithErrors: number;
  children?: ReactNode;
};

const DaemonSetSummary = ({
  numberOfCurrentPods,
  numberOfPodsWithErrors,
}: DaemonSetSummaryProps) => {
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

const DaemonSetAccordion = ({
  daemonset,
  ownedPods,
}: DaemonSetAccordionProps) => {
  const podNamesWithErrors = useContext(PodNamesWithErrorsContext);

  const podsWithErrors = ownedPods.filter(p =>
    podNamesWithErrors.has(p.metadata?.name ?? ''),
  );

  return (
    <ResourceAccordion
      label={daemonset.metadata?.name ?? 'unknown object'}
      start={<DaemonSetDrawer daemonset={daemonset} />}
      status={
        <DaemonSetSummary
          daemonset={daemonset}
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

export const DaemonSetsAccordions = ({}: DaemonSetsAccordionsProps) => {
  const groupedResponses = useContext(GroupedResponsesContext);

  return (
    <Flex direction="column" gap="4">
      {groupedResponses.daemonSets.map((daemonset, i) => (
        <DaemonSetAccordion
          key={i}
          ownedPods={getOwnedResources(daemonset, groupedResponses.pods)}
          daemonset={daemonset}
        />
      ))}
    </Flex>
  );
};
