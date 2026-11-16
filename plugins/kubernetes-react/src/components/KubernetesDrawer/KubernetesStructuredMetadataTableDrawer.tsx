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

import { ReactNode, ChangeEvent, useContext, useState } from 'react';
import Button from '@material-ui/core/Button';
import Drawer from '@material-ui/core/Drawer';
import { makeStyles, createStyles, Theme } from '@material-ui/core/styles';
import {
  ButtonIcon,
  ButtonLink,
  Flex,
  Switch,
  Text,
  TextProps,
} from '@backstage/ui';
import { RiCloseLine, RiExternalLinkLine } from '@remixicon/react';
import type { V1ObjectMeta } from '@kubernetes/client-node';
import { withStyles } from '@material-ui/core/styles';
import {
  StructuredMetadataTable,
  WarningPanel,
} from '@backstage/core-components';
import { ClusterContext } from '../../hooks';
import { ClusterAttributes } from '@backstage/plugin-kubernetes-common';
import { ManifestYaml } from './ManifestYaml';
import { useApi } from '@backstage/core-plugin-api';
import { kubernetesClusterLinkFormatterApiRef } from '../../api';
import useAsync from 'react-use/esm/useAsync';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../translation';
import styles from './KubernetesStructuredMetadataTableDrawer.module.css';

const useDrawerStyles = makeStyles((theme: Theme) =>
  createStyles({
    paper: {
      width: '50%',
      justifyContent: 'space-between',
      padding: theme.spacing(2.5),
    },
  }),
);

const PodDrawerButton = withStyles({
  root: {
    padding: '6px 5px',
  },
  label: {
    textTransform: 'none',
  },
})(Button);

/**
 *
 *
 * @public
 */
export type LinkErrorPanelProps = {
  cluster: ClusterAttributes;
  errorMessage?: string;
  children?: ReactNode;
};

/**
 *
 *
 * @public
 */
export const LinkErrorPanel = ({
  cluster,
  errorMessage,
}: LinkErrorPanelProps) => {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  return (
    <WarningPanel
      title={t('linkErrorPanel.title')}
      message={t('linkErrorPanel.message', {
        clusterName: cluster.name,
        dashboardApp: cluster.dashboardApp || 'standard',
      })}
    >
      {errorMessage && (
        <Text as="p" variant="body-medium">
          {t('linkErrorPanel.errorsLabel')} {errorMessage}
        </Text>
      )}
    </WarningPanel>
  );
};

/**
 *
 *
 * @public
 */
export interface KubernetesDrawerable {
  metadata?: V1ObjectMeta;
}

interface KubernetesStructuredMetadataTableDrawerContentProps<
  T extends KubernetesDrawerable,
> {
  close: () => void;
  object: T;
  renderObject: (obj: T) => object;
  kind: string;
}

function replaceNullsWithUndefined(someObj: any) {
  const replacer = (_: any, value: any) =>
    String(value) === 'null' || String(value) === 'undefined'
      ? undefined
      : value;

  return JSON.parse(JSON.stringify(someObj, replacer));
}

const KubernetesStructuredMetadataTableDrawerContent = <
  T extends KubernetesDrawerable,
>({
  close,
  object,
  renderObject,
  kind,
}: KubernetesStructuredMetadataTableDrawerContentProps<T>) => {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  const [isYaml, setIsYaml] = useState<boolean>(false);

  const formatter = useApi(kubernetesClusterLinkFormatterApiRef);
  const cluster = useContext(ClusterContext);
  const { value: clusterLink, error } = useAsync(
    async () =>
      formatter.formatClusterLink({
        dashboardUrl: cluster.dashboardUrl,
        dashboardApp: cluster.dashboardApp,
        dashboardParameters: cluster.dashboardParameters,
        object,
        kind,
      }),
    [cluster, object, kind, formatter],
  );

  return (
    <>
      <Flex direction="column" gap="4">
        <Flex justify="between" align="start">
          <Text as="h5" variant="title-small" weight="bold">
            {object.metadata?.name ?? t('kubernetesDrawer.unknownName')}
          </Text>
          <ButtonIcon
            variant="tertiary"
            size="medium"
            aria-label={t('kubernetesDrawer.closeDrawer')}
            onPress={close}
            icon={<RiCloseLine size={20} />}
          />
        </Flex>
        <Text variant="body-large" color="secondary">
          {kind}
        </Text>
        <Switch
          isSelected={isYaml}
          onChange={setIsYaml}
          name={t('kubernetesDrawer.yaml')}
          label={t('kubernetesDrawer.yaml')}
        />
      </Flex>
      {error && (
        <div className={styles.errorMessage}>
          <LinkErrorPanel
            cluster={cluster}
            errorMessage={error.message || error.toString()}
          />
        </div>
      )}
      <div className={styles.options}>
        <div>
          {clusterLink && (
            <ButtonLink
              variant="secondary"
              size="small"
              href={clusterLink}
              target="_blank"
              rel="noopener"
              iconEnd={<RiExternalLinkLine size={16} />}
            >
              Open Kubernetes Dashboard
            </ButtonLink>
          )}
        </div>
      </div>
      <div className={styles.content}>
        {isYaml && <ManifestYaml object={object} />}
        {!isYaml && (
          <StructuredMetadataTable
            metadata={renderObject(replaceNullsWithUndefined(object))}
            options={{ nestedValuesAsYaml: true }}
          />
        )}
      </div>
    </>
  );
};

const buttonTextProps: Record<
  'h5' | 'subtitle2',
  Pick<TextProps, 'variant' | 'weight'>
> = {
  h5: { variant: 'title-small', weight: 'bold' },
  subtitle2: { variant: 'body-medium', weight: 'bold' },
};

/**
 *
 * @public
 */
export interface KubernetesStructuredMetadataTableDrawerProps<
  T extends KubernetesDrawerable,
> {
  object: T;
  renderObject: (obj: T) => object;
  buttonVariant?: 'h5' | 'subtitle2';
  kind: string;
  expanded?: boolean;
  children?: ReactNode;
}

/**
 *
 * @public
 */
export const KubernetesStructuredMetadataTableDrawer = <
  T extends KubernetesDrawerable,
>({
  object,
  renderObject,
  kind,
  buttonVariant = 'subtitle2',
  expanded = false,
  children,
}: KubernetesStructuredMetadataTableDrawerProps<T>) => {
  const [isOpen, setIsOpen] = useState(expanded);
  const classes = useDrawerStyles();

  const toggleDrawer = (e: ChangeEvent<{}>, newValue: boolean) => {
    e.stopPropagation();
    setIsOpen(newValue);
  };

  return (
    <>
      <PodDrawerButton
        onClick={e => toggleDrawer(e, true)}
        onFocus={event => event.stopPropagation()}
      >
        {children === undefined ? (
          <Text {...buttonTextProps[buttonVariant]}>
            {object.metadata?.name ?? 'unknown object'}
          </Text>
        ) : (
          children
        )}
      </PodDrawerButton>
      <Drawer
        classes={{
          paper: classes.paper,
        }}
        anchor="right"
        open={isOpen}
        onClose={(e: any) => toggleDrawer(e, false)}
        onClick={event => event.stopPropagation()}
      >
        <KubernetesStructuredMetadataTableDrawerContent
          kind={kind}
          close={() => setIsOpen(false)}
          object={object}
          renderObject={renderObject}
        />
      </Drawer>
    </>
  );
};
