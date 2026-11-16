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
import { ReactNode, useContext } from 'react';
import type { V1CronJob, V1Job } from '@kubernetes/client-node';
import { JobsAccordions } from '../JobsAccordions';
import { CronJobDrawer } from './CronJobsDrawer';
import { getOwnedResources } from '../../utils/owner';
import { GroupedResponsesContext } from '../../hooks';
import { StatusError, StatusOK } from '@backstage/core-components';
import { humanizeCron } from '../../utils/crons';

/**
 *
 *
 * @public
 */
export type CronJobsAccordionsProps = {
  children?: ReactNode;
};

type CronJobAccordionProps = {
  cronJob: V1CronJob;
  ownedJobs: V1Job[];
  children?: ReactNode;
};

type CronJobSummaryProps = {
  cronJob: V1CronJob;
  children?: ReactNode;
};

const CronJobSummary = ({ cronJob }: CronJobSummaryProps) => {
  return (
    <>
      {cronJob.spec?.suspend ? (
        <StatusError>Suspended</StatusError>
      ) : (
        <StatusOK>Active</StatusOK>
      )}
      <Text variant="body-large">
        Schedule:{' '}
        {cronJob.spec?.schedule
          ? `${cronJob.spec.schedule} (${humanizeCron(cronJob.spec.schedule)})`
          : 'N/A'}
      </Text>
    </>
  );
};

const CronJobAccordion = ({ cronJob, ownedJobs }: CronJobAccordionProps) => {
  return (
    <ResourceAccordion
      label={cronJob.metadata?.name ?? 'unknown object'}
      start={<CronJobDrawer cronJob={cronJob} />}
      status={<CronJobSummary cronJob={cronJob} />}
    >
      <JobsAccordions jobs={ownedJobs.reverse()} />
    </ResourceAccordion>
  );
};

/**
 *
 *
 * @public
 */
export const CronJobsAccordions = ({}: CronJobsAccordionsProps) => {
  const groupedResponses = useContext(GroupedResponsesContext);

  return (
    <Flex direction="column" gap="4">
      {groupedResponses.cronJobs.map((cronJob, i) => (
        <CronJobAccordion
          key={i}
          ownedJobs={getOwnedResources(cronJob, groupedResponses.jobs)}
          cronJob={cronJob}
        />
      ))}
    </Flex>
  );
};
