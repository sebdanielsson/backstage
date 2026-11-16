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
import { useContext } from 'react';
import type { V1Ingress } from '@kubernetes/client-node';
import { IngressDrawer } from './IngressDrawer';
import { GroupedResponsesContext } from '../../hooks';
import { StructuredMetadataTable } from '@backstage/core-components';

/**
 *
 *
 * @public
 */
export type IngressesAccordionsProps = {};

type IngressAccordionProps = {
  ingress: V1Ingress;
};

type IngressCardProps = {
  ingress: V1Ingress;
};

const IngressCard = ({ ingress }: IngressCardProps) => {
  return (
    <StructuredMetadataTable
      metadata={{
        ...ingress.spec,
      }}
      options={{
        nestedValuesAsYaml: true,
      }}
    />
  );
};

const IngressAccordion = ({ ingress }: IngressAccordionProps) => {
  return (
    <ResourceAccordion
      label={ingress.metadata?.name ?? 'unknown object'}
      start={<IngressDrawer ingress={ingress} />}
    >
      <IngressCard ingress={ingress} />
    </ResourceAccordion>
  );
};

/**
 *
 *
 * @public
 */
export const IngressesAccordions = ({}: IngressesAccordionsProps) => {
  const groupedResponses = useContext(GroupedResponsesContext);
  return (
    <Flex gap="4" align="start">
      {groupedResponses.ingresses.map((ingress, i) => (
        <IngressAccordion key={i} ingress={ingress} />
      ))}
    </Flex>
  );
};
