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
import { ReactNode, useContext } from 'react';
import type { V1Job, V1Pod } from '@kubernetes/client-node';
import { Flex, Text } from '@backstage/ui';
import { PodsTable } from '../Pods';
import { JobDrawer } from './JobsDrawer';
import { getOwnedResources } from '../../utils/owner';
import { GroupedResponsesContext } from '../../hooks';
import {
  StatusError,
  StatusOK,
  StatusPending,
} from '@backstage/core-components';
import { ResourceAccordion } from '../ResourceAccordion';

/**
 *
 *
 * @public
 */
export type JobsAccordionsProps = {
  jobs: V1Job[];
  children?: ReactNode;
};

type JobAccordionProps = {
  job: V1Job;
  ownedPods: V1Pod[];
  children?: ReactNode;
};

type JobSummaryProps = {
  job: V1Job;
  children?: ReactNode;
};

const JobStatus = ({ job }: JobSummaryProps) => {
  return (
    <>
      <div>
        {job.status?.succeeded && <StatusOK>Succeeded</StatusOK>}
        {job.status?.active && <StatusPending>Running</StatusPending>}
        {job.status?.failed && <StatusError>Failed</StatusError>}
      </div>
      <Text variant="body-medium">
        Start time: {job.status?.startTime?.toString()}
      </Text>
      {job.status?.completionTime && (
        <Text variant="body-medium">
          Completion time: {job.status.completionTime.toString()}
        </Text>
      )}
    </>
  );
};

const JobAccordion = ({ job, ownedPods }: JobAccordionProps) => {
  return (
    <ResourceAccordion
      label={job.metadata?.name ?? 'unknown object'}
      start={<JobDrawer job={job} />}
      status={<JobStatus job={job} />}
    >
      <PodsTable pods={ownedPods} />
    </ResourceAccordion>
  );
};

/**
 *
 *
 * @public
 */
export const JobsAccordions = ({ jobs }: JobsAccordionsProps) => {
  const groupedResponses = useContext(GroupedResponsesContext);

  return (
    <Flex direction="column" gap="4">
      {jobs.map((job, i) => (
        <JobAccordion
          key={i}
          ownedPods={getOwnedResources(job, groupedResponses.pods)}
          job={job}
        />
      ))}
    </Flex>
  );
};
