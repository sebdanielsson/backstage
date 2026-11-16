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
import { Container, Skeleton, Text } from '@backstage/ui';
import { RiAlertFill, RiInformationFill } from '@remixicon/react';
import { DateTime } from 'luxon';

import { useEvents } from './useEvents';
import { DismissableBanner } from '@backstage/core-components';
import { Event } from 'kubernetes-models/v1';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../../translation';
import styles from './Events.module.css';

/**
 * Props for Events
 *
 * @public
 */
export interface EventsContentProps {
  warningEventsOnly?: boolean;
  events: Event[];
}

const getAvatarByType = (type?: string) => {
  const label = `${type ?? ''} event`;
  return (
    <div className={styles.avatar} role="img" aria-label={label} title={label}>
      {type === 'Warning' ? (
        <RiAlertFill size={24} aria-hidden />
      ) : (
        <RiInformationFill size={24} aria-hidden />
      )}
    </div>
  );
};

/**
 * Shows given Kubernetes events
 *
 * @public
 */
export const EventsContent = ({
  events,
  warningEventsOnly,
}: EventsContentProps) => {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  if (events.length === 0) {
    return (
      <Text as="p" variant="body-large">
        {t('events.noEventsFound')}
      </Text>
    );
  }

  return (
    <Container>
      <ul className={styles.list}>
        {events
          .filter(event => {
            if (warningEventsOnly) {
              return event.type === 'Warning';
            }
            return true;
          })
          .map((event, index) => {
            const timeAgo = event.metadata.creationTimestamp
              ? DateTime.fromISO(event.metadata.creationTimestamp).toRelative({
                  locale: 'en',
                })
              : 'unknown';
            return (
              <li
                key={`${event.metadata.name}-${index}`}
                className={styles.item}
              >
                {getAvatarByType(event.type)}
                <div>
                  <Text as="p" variant="body-large">
                    {`First event ${timeAgo} (count: ${event.count})`}
                  </Text>
                  <Text as="p" variant="body-medium" color="secondary">
                    {`${event.reason}: ${event.message}`}
                  </Text>
                </div>
              </li>
            );
          })}
      </ul>
    </Container>
  );
};

/**
 * Props for Events
 *
 * @public
 */
export interface EventsProps {
  involvedObjectName: string;
  namespace: string;
  clusterName: string;
  warningEventsOnly?: boolean;
}

/**
 * Retrieves and shows Kubernetes events for the given object
 *
 * @public
 */
export const Events = ({
  involvedObjectName,
  namespace,
  clusterName,
  warningEventsOnly,
}: EventsProps) => {
  const { value, error, loading } = useEvents({
    involvedObjectName,
    namespace,
    clusterName,
  });

  return (
    <>
      {error && (
        <DismissableBanner
          {...{
            message: error.message,
            variant: 'error',
            fixed: false,
          }}
          id="events"
        />
      )}
      {loading && <Skeleton width="100%" height="100%" />}
      {!loading && value !== undefined && (
        <EventsContent warningEventsOnly={warningEventsOnly} events={value} />
      )}
    </>
  );
};
