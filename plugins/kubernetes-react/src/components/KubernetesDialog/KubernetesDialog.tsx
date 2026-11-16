/*
 * Copyright 2024 The Backstage Authors
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

import Dialog from '@material-ui/core/Dialog';
import DialogContent from '@material-ui/core/DialogContent';
import DialogTitle from '@material-ui/core/DialogTitle';
import { createStyles, makeStyles } from '@material-ui/core/styles';
import { Button, ButtonIcon, Flex, Text } from '@backstage/ui';
import { RiCloseLine } from '@remixicon/react';
import { isValidElement, ReactNode, useState } from 'react';
import { useTranslationRef } from '@backstage/core-plugin-api/alpha';
import { kubernetesReactTranslationRef } from '../../translation';

const useStyles = makeStyles(() =>
  createStyles({
    dialogPaper: { minHeight: 'calc(100% - 64px)' },
    dialogContent: { flexBasis: 0 },
  }),
);

export interface KubernetesDialogProps {
  buttonAriaLabel: string;
  buttonIcon: ReactNode;
  buttonText: string;
  children?: ReactNode;
  disabled?: boolean;
  title: string;
}

/**
 * Dialog component for use in the Kubernetes plugin
 *
 * @public
 */
export const KubernetesDialog = ({
  buttonAriaLabel,
  buttonIcon,
  buttonText,
  children,
  disabled,
  title,
}: KubernetesDialogProps) => {
  const classes = useStyles();
  const { t } = useTranslationRef(kubernetesReactTranslationRef);

  const [open, setOpen] = useState(false);
  const openDialog = () => {
    setOpen(true);
  };
  const closeDialog = () => {
    setOpen(false);
  };

  return (
    <>
      <Dialog
        maxWidth="xl"
        fullWidth
        open={open}
        onClose={closeDialog}
        PaperProps={{ className: classes.dialogPaper }}
      >
        <DialogTitle id="dialog-title" disableTypography>
          <Flex justify="between" align="center">
            <Text as="h2" variant="title-x-small" weight="bold">
              {title}
            </Text>
            <ButtonIcon
              variant="tertiary"
              size="medium"
              aria-label={t('kubernetesDialog.closeAriaLabel')}
              onPress={closeDialog}
              icon={<RiCloseLine size={20} />}
            />
          </Flex>
        </DialogTitle>
        <DialogContent className={classes.dialogContent}>
          {children}
        </DialogContent>
      </Dialog>
      <Button
        variant="secondary"
        size="medium"
        aria-label={buttonAriaLabel}
        isDisabled={disabled}
        onPress={openDialog}
        iconStart={isValidElement(buttonIcon) ? buttonIcon : undefined}
      >
        {buttonText}
      </Button>
    </>
  );
};
