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
import { ReactNode, ChangeEvent, useState } from 'react';

import type { IObjectMeta } from '@kubernetes-models/apimachinery/apis/meta/v1/ObjectMeta';
import Drawer from '@material-ui/core/Drawer';
import Button from '@material-ui/core/Button';
import {
  createStyles,
  makeStyles,
  Theme,
  withStyles,
} from '@material-ui/core/styles';
import { ButtonIcon, Flex, Switch, Text } from '@backstage/ui';
import { RiCloseLine } from '@remixicon/react';
import { ManifestYaml } from './ManifestYaml';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../translation';
import styles from './KubernetesDrawer.module.css';

/**
 * The type of object that can be represented by the Drawer
 *
 * @public
 */
export interface KubernetesObject {
  kind: string;
  metadata?: IObjectMeta;
}

interface KubernetesDrawerContentProps {
  close: () => void;
  kubernetesObject: KubernetesObject;
  header?: ReactNode;
  children?: ReactNode;
}

const KubernetesDrawerContent = ({
  children,
  header,
  kubernetesObject,
  close,
}: KubernetesDrawerContentProps) => {
  const { t } = useTranslationRef(kubernetesReactTranslationRef);
  const [isYaml, setIsYaml] = useState<boolean>(false);

  return (
    <>
      <Flex direction="column" gap="4">
        <Flex justify="between" align="start">
          <Text as="h5" variant="title-small" weight="bold">
            {kubernetesObject.metadata?.name}
          </Text>
          <ButtonIcon
            variant="tertiary"
            size="medium"
            aria-label={t('kubernetesDrawer.closeDrawer')}
            onPress={() => close()}
            icon={<RiCloseLine size={20} />}
          />
        </Flex>
        {header}
        <Switch
          isSelected={isYaml}
          onChange={setIsYaml}
          name={t('kubernetesDrawer.yaml')}
          label={t('kubernetesDrawer.yaml')}
        />
      </Flex>
      <div className={styles.content}>
        {isYaml && <ManifestYaml object={kubernetesObject} />}
        {!isYaml && children}
      </div>
    </>
  );
};

/**
 * Props of KubernetesDrawer
 *
 * @public
 */
export interface KubernetesDrawerProps {
  open?: boolean;
  kubernetesObject: KubernetesObject;
  label: ReactNode;
  drawerContentsHeader?: ReactNode;
  children?: ReactNode;
}

const useDrawerStyles = makeStyles((theme: Theme) =>
  createStyles({
    paper: {
      width: '50%',
      justifyContent: 'space-between',
      padding: theme.spacing(2.5),
    },
  }),
);

const DrawerButton = withStyles({
  root: {
    padding: '6px 5px',
  },
  label: {
    textTransform: 'none',
  },
})(Button);

/**
 * Button/Drawer component for Kubernetes Objects
 *
 * @public
 */
export const KubernetesDrawer = ({
  open,
  label,
  drawerContentsHeader,
  kubernetesObject,
  children,
}: KubernetesDrawerProps) => {
  const classes = useDrawerStyles();
  const [isOpen, setIsOpen] = useState<boolean>(open ?? false);

  const toggleDrawer = (e: ChangeEvent<{}>, newValue: boolean) => {
    e.stopPropagation();
    setIsOpen(newValue);
  };

  return (
    <>
      <DrawerButton onClick={() => setIsOpen(true)}>{label}</DrawerButton>
      <Drawer
        classes={{
          paper: classes.paper,
        }}
        anchor="right"
        open={isOpen}
        onClose={(e: any) => toggleDrawer(e, false)}
        onClick={event => event.stopPropagation()}
      >
        {isOpen && (
          <KubernetesDrawerContent
            header={drawerContentsHeader}
            kubernetesObject={kubernetesObject}
            children={children}
            close={() => setIsOpen(false)}
          />
        )}
      </Drawer>
    </>
  );
};
