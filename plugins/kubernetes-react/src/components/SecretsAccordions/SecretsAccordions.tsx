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
import type { V1Secret } from '@kubernetes/client-node';
import { SecretsDrawer } from './SecretsDrawer.tsx';
import { GroupedResponsesContext } from '../../hooks';
import { StructuredMetadataTable } from '@backstage/core-components';

type SecretSummaryProps = {
  secret: V1Secret;
};

const SecretStatus = ({ secret }: SecretSummaryProps) => {
  return (
    <Text variant="body-medium" weight="bold">
      Data Count: {secret.data ? Object.keys(secret.data).length : 0}
    </Text>
  );
};

type SecretsCardProps = {
  secret: V1Secret;
};

const SecretCard = ({ secret }: SecretsCardProps) => {
  const metadata: any = {};

  metadata.data = secret.data;

  return (
    <StructuredMetadataTable
      metadata={{
        ...metadata,
      }}
      options={{ nestedValuesAsYaml: true }}
    />
  );
};

export type SecretsAccordionsProps = {};

type SecretsAccordionProps = {
  secret: V1Secret;
};

const SecretsAccordion = ({ secret }: SecretsAccordionProps) => {
  return (
    <ResourceAccordion
      label={secret.metadata?.name ?? 'unknown object'}
      start={<SecretsDrawer secret={secret} />}
      status={<SecretStatus secret={secret} />}
    >
      <SecretCard secret={secret} />
    </ResourceAccordion>
  );
};

export const SecretsAccordions = ({}: SecretsAccordionsProps) => {
  const groupedResponses = useContext(GroupedResponsesContext);
  return (
    <Flex gap="4" align="start">
      {groupedResponses.secrets.map((secret, i) => (
        <SecretsAccordion key={i} secret={secret} />
      ))}
    </Flex>
  );
};
