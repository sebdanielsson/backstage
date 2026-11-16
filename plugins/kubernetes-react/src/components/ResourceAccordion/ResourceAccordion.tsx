/*
 * Copyright 2026 The Backstage Authors
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

import { ReactNode, useState } from 'react';
import {
  Accordion,
  AccordionPanel,
  AccordionTrigger,
  VisuallyHidden,
} from '@backstage/ui';
import styles from './ResourceAccordion.module.css';

/** @internal */
export interface ResourceAccordionProps {
  /** Accessible name of the row, such as the name of the resource */
  label: string;
  /**
   * Content at the start of the row, such as the drawer buttons of the
   * resource. It is not part of the trigger, so it can hold its own buttons.
   */
  start?: ReactNode;
  /** Status content at the end of the row, inside the trigger */
  status?: ReactNode;
  /** Whether the row starts expanded */
  defaultExpanded?: boolean;
  /** Panel content, rendered only while the row is expanded */
  children?: ReactNode;
}

/**
 * A resource row that expands to show details.
 *
 * The trigger spans the whole row, and the start content is placed on top of
 * it rather than inside it, since drawer buttons can't be nested in the
 * trigger button.
 *
 * @internal
 */
export const ResourceAccordion = ({
  label,
  start,
  status,
  defaultExpanded = false,
  children,
}: ResourceAccordionProps) => {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <Accordion
      className={styles.root}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    >
      {start && <div className={styles.start}>{start}</div>}
      <AccordionTrigger className={styles.trigger}>
        {/*
          Names the trigger together with the status. The separator keeps the
          hidden text from matching the visible name exactly.
        */}
        <VisuallyHidden>{`${label}, `}</VisuallyHidden>
        <div className={styles.status}>{status}</div>
      </AccordionTrigger>
      <AccordionPanel className={styles.panel}>
        {isExpanded && children}
      </AccordionPanel>
    </Accordion>
  );
};
