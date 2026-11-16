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

import { Flex } from '@backstage/ui';
import { ResourceAccordion } from '../ResourceAccordion';
import { ReactNode } from 'react';
import { DefaultCustomResourceDrawer } from './DefaultCustomResourceDrawer';
import { StructuredMetadataTable } from '@backstage/core-components';

type DefaultCustomResourceAccordionsProps = {
  customResources: any[];
  customResourceName: string;
  defaultExpanded?: boolean;
  children?: ReactNode;
};

type DefaultCustomResourceAccordionProps = {
  customResource: any;
  customResourceName: string;
  defaultExpanded?: boolean;
  children?: ReactNode;
};

const DefaultCustomResourceAccordion = ({
  customResource,
  customResourceName,
  defaultExpanded,
}: DefaultCustomResourceAccordionProps) => {
  return (
    <ResourceAccordion
      label={customResource.metadata?.name ?? 'unknown object'}
      defaultExpanded={defaultExpanded}
      start={
        <DefaultCustomResourceDrawer
          customResource={customResource}
          customResourceName={customResourceName}
        />
      }
    >
      {Object.prototype.hasOwnProperty.call(customResource, 'status') && (
        <StructuredMetadataTable
          metadata={customResource.status}
          options={{ nestedValuesAsYaml: true }}
        />
      )}
    </ResourceAccordion>
  );
};

export const DefaultCustomResourceAccordions = ({
  customResources,
  customResourceName,
  defaultExpanded = false,
}: DefaultCustomResourceAccordionsProps) => {
  return (
    <Flex direction="column" gap="4">
      {customResources.map((cr, i) => (
        <DefaultCustomResourceAccordion
          key={i}
          defaultExpanded={defaultExpanded}
          customResource={cr}
          customResourceName={customResourceName}
        />
      ))}
    </Flex>
  );
};
