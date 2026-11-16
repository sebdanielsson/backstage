/*
 * Copyright 2021 The Backstage Authors
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

import { Text } from '@backstage/ui';
import { ResourceAccordion } from '../ResourceAccordion';
import { ReactNode, useContext } from 'react';
import type { V1PersistentVolumeClaim } from '@kubernetes/client-node';
import { PersistentVolumeClaimsTable } from './PersistentVolumeClaimsTable';
import { GroupedResponsesContext } from '../../hooks';
import { StatusOK, StatusError } from '@backstage/core-components';

type PersistentVolumeClaimsAccordionsProps = {
  children?: ReactNode;
};

type PersistentVolumeClaimsAccordionProps = {
  persistentVolumeClaims: V1PersistentVolumeClaim[];
  children?: ReactNode;
};

type PersistentVolumeClaimsSummaryProps = {
  numberOfPersistentVolumeClaims: number;
  numberOfBoundClaims: number;
  numberOfLostClaims: number;
  children?: ReactNode;
};

const PersistentVolumeClaimsSummary = ({
  numberOfPersistentVolumeClaims,
  numberOfBoundClaims,
  numberOfLostClaims,
}: PersistentVolumeClaimsSummaryProps) => {
  return (
    <>
      <StatusOK>{numberOfPersistentVolumeClaims} claims</StatusOK>
      <StatusOK>{numberOfBoundClaims} bound</StatusOK>
      {numberOfLostClaims > 0 && (
        <StatusError>
          {numberOfLostClaims} claim
          {numberOfLostClaims > 1 ? 's' : ''} lost
        </StatusError>
      )}
    </>
  );
};

const PersistentVolumeClaimsAccordion = ({
  persistentVolumeClaims,
}: PersistentVolumeClaimsAccordionProps) => {
  const boundClaims = persistentVolumeClaims.filter(
    pvc => pvc.status?.phase === 'Bound',
  );
  const lostClaims = persistentVolumeClaims.filter(
    pvc => pvc.status?.phase === 'Lost',
  );

  return (
    <ResourceAccordion
      label="PersistentVolumeClaims"
      start={
        <Text variant="body-large" weight="bold">
          PersistentVolumeClaims
        </Text>
      }
      status={
        <PersistentVolumeClaimsSummary
          numberOfPersistentVolumeClaims={persistentVolumeClaims.length}
          numberOfBoundClaims={boundClaims.length}
          numberOfLostClaims={lostClaims.length}
        />
      }
    >
      <PersistentVolumeClaimsTable
        persistentVolumeClaims={persistentVolumeClaims}
      />
    </ResourceAccordion>
  );
};

export const PersistentVolumeClaimsAccordions =
  ({}: PersistentVolumeClaimsAccordionsProps) => {
    const groupedResponses = useContext(GroupedResponsesContext);

    return (
      <PersistentVolumeClaimsAccordion
        persistentVolumeClaims={groupedResponses.persistentVolumeClaims}
      />
    );
  };
