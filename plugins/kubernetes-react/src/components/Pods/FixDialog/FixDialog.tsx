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
import { useState } from 'react';
import Dialog from '@material-ui/core/Dialog';
import DialogActions from '@material-ui/core/DialogActions';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import { Button, ButtonIcon, ButtonLink, Flex, Text } from '@backstage/ui';
import {
  RiCloseLine,
  RiExternalLinkLine,
  RiQuestionFill,
} from '@remixicon/react';
import { Pod } from 'kubernetes-models/v1/Pod';
import { DetectedError } from '@backstage/plugin-kubernetes-common';
import { PodLogs } from '../PodLogs';
import { Events } from '../Events';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../../translation';
import styles from './FixDialog.module.css';

/**
 * Props for FixDialog
 *
 * @public
 */
export interface FixDialogProps {
  open?: boolean;
  clusterName: string;
  pod: Pod;
  error: DetectedError;
}

/**
 * A dialog for fixing detected Kubernetes errors
 *
 * @public
 */
export function FixDialog({ open, pod, error, clusterName }: FixDialogProps) {
  const [isOpen, setOpen] = useState(!!open);
  const { t } = useTranslationRef(kubernetesReactTranslationRef);

  const pf = error.proposedFix;

  const dialogContent = () => {
    return (
      <Flex direction="column" gap="4">
        <div>
          <Text as="h6" variant="title-x-small" weight="bold">
            {t('fixDialog.detectedError')}
          </Text>
          <Text as="p" variant="body-large">
            {error.message}
          </Text>
        </div>
        <div>
          <Text as="h6" variant="title-x-small" weight="bold">
            {t('fixDialog.causeExplanation')}
          </Text>
          <Text as="p" variant="body-large">
            {error.proposedFix?.rootCauseExplanation ?? t('podsTable.unknown')}
          </Text>
        </div>
        <div>
          <Text as="h6" variant="title-x-small" weight="bold">
            {t('fixDialog.fix')}
          </Text>
          <ul className={styles.list}>
            {(error.proposedFix?.actions ?? []).map((fix, i) => {
              return (
                <li
                  key={`${
                    pod.metadata?.name ?? t('podsTable.unknown')
                  }-pf-${i}`}
                  className={styles.item}
                >
                  <Text variant="body-large">{fix}</Text>
                </li>
              );
            })}
          </ul>
        </div>
        {pf && pf.type === 'logs' && (
          <>
            <Text as="h6" variant="title-x-small" weight="bold">
              {t('fixDialog.crashLogs')}
            </Text>
            <div className={styles.details}>
              <PodLogs
                previous
                containerScope={{
                  podName: pod.metadata?.name ?? t('podsTable.unknown'),
                  podNamespace:
                    pod.metadata?.namespace ?? t('podsTable.unknown'),
                  cluster: { name: clusterName },
                  containerName: pf.container,
                }}
              />
            </div>
          </>
        )}
        {pf && pf.type === 'events' && (
          <>
            <Text as="h6" variant="title-x-small" weight="bold">
              {t('fixDialog.events')}
            </Text>
            <div className={styles.details}>
              <Events
                warningEventsOnly
                involvedObjectName={pod.metadata?.name ?? ''}
                namespace={pod.metadata?.namespace ?? ''}
                clusterName={clusterName}
              />
            </div>
          </>
        )}
      </Flex>
    );
  };

  return (
    <>
      <Button
        variant="secondary"
        size="medium"
        aria-label={t('fixDialog.ariaLabels.fixIssue')}
        onPress={() => setOpen(true)}
        iconStart={<RiQuestionFill size={20} />}
      >
        {t('fixDialog.helpButton')}
      </Button>
      <Dialog
        maxWidth="xl"
        fullWidth
        open={isOpen}
        onClose={() => setOpen(false)}
      >
        <DialogTitle id="dialog-title" disableTypography>
          <Flex justify="between" align="center">
            <Text as="h2" variant="title-x-small" weight="bold">
              {t('fixDialog.title', {
                podName: pod.metadata?.name ?? '',
                errorType: error.type,
              })}
            </Text>
            <ButtonIcon
              variant="tertiary"
              size="medium"
              aria-label={t('fixDialog.ariaLabels.close')}
              onPress={() => setOpen(false)}
              icon={<RiCloseLine size={20} />}
            />
          </Flex>
        </DialogTitle>
        <DialogContent>{dialogContent()}</DialogContent>
        <DialogActions>
          {pf && pf.type === 'docs' && (
            <ButtonLink
              variant="secondary"
              size="medium"
              href={pf.docsLink}
              target="_blank"
              rel="noopener"
              iconStart={<RiExternalLinkLine size={20} />}
            >
              {t('fixDialog.openDocs')}
            </ButtonLink>
          )}
        </DialogActions>
      </Dialog>
    </>
  );
}
