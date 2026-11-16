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
import { Flex, Text } from '@backstage/ui';
import { ResourceAccordion } from '../ResourceAccordion';
import { useContext } from 'react';
import type { V1ConfigMap } from '@kubernetes/client-node';
import { ConfigmapsDrawer } from './ConfigmapsDrawer.tsx';
import { GroupedResponsesContext } from '../../hooks';
import { StructuredMetadataTable } from '@backstage/core-components';

type ConfigmapSummaryProps = {
  configmap: V1ConfigMap;
};

const ConfigmapStatus = ({ configmap }: ConfigmapSummaryProps) => {
  return (
    <Text variant="body-medium" weight="bold">
      Data Count: {configmap.data ? Object.keys(configmap.data).length : 0}
    </Text>
  );
};

type ConfigmapsCardProps = {
  configmap: V1ConfigMap;
};

const ConfigmapCard = ({ configmap }: ConfigmapsCardProps) => {
  const metadata: any = {};

  metadata.data = configmap.data;

  return (
    <StructuredMetadataTable
      metadata={{
        ...metadata,
      }}
      options={{ nestedValuesAsYaml: true }}
    />
  );
};

export type ConfigmapsAccordionsProps = {};

type ConfigmapsAccordionProps = {
  configmap: V1ConfigMap;
};

const ConfigmapsAccordion = ({ configmap }: ConfigmapsAccordionProps) => {
  return (
    <ResourceAccordion
      label={configmap.metadata?.name ?? 'unknown object'}
      start={<ConfigmapsDrawer configmap={configmap} />}
      status={<ConfigmapStatus configmap={configmap} />}
    >
      <ConfigmapCard configmap={configmap} />
    </ResourceAccordion>
  );
};

export const ConfigmapsAccordions = ({}: ConfigmapsAccordionsProps) => {
  const groupedResponses = useContext(GroupedResponsesContext);
  return (
    <Flex gap="4" align="start">
      {groupedResponses.configMaps.map((configmap, i) => (
        <ConfigmapsAccordion key={i} configmap={configmap} />
      ))}
    </Flex>
  );
};
