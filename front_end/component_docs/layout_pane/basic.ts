// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as ComponentHelpers from '../../component_helpers/component_helpers.js';
import * as Elements from '../../elements/elements.js';

ComponentHelpers.ComponentServerSetup.setup().then(() => renderComponent());

const renderComponent = (): void => {
  const component = new Elements.LayoutPane.LayoutPane();

  document.getElementById('container')?.appendChild(component);

  component.data = {
    gridElements: [
      {
        id: 1,
        name: 'div',
        domId: 'foo',
        color: 'blue',
        enabled: false,
        reveal: (): void => {},
        setColor: (): void => {},
        toggle: (): void => {},
        highlight: (): void => {},
        hideHighlight: (): void => {},
      },
      {
        id: 2,
        name: 'div',
        domClasses: ['for', 'bar', 'some-very-long-class-name-very-very-very-very-very-long'],
        enabled: true,
        color: 'blue',
        reveal: (): void => {},
        setColor: (): void => {},
        toggle: (): void => {},
        highlight: (): void => {},
        hideHighlight: (): void => {},
      },
    ],
    settings: [
      {
        name: 'showGridTracks',
        type: Elements.LayoutPaneUtils.SettingType.BOOLEAN,
        value: false,
        title: 'Show grid tracks',
        options: [
          {
            title: 'Show grid tracks',
            value: true,
          },
          {
            title: 'Do not show grid tracks',
            value: false,
          },
        ],
      },
      {
        name: 'showGridBorders',
        type: Elements.LayoutPaneUtils.SettingType.ENUM,
        value: 'both',
        title: 'Show grid borders',
        options: [
          {
            title: 'Show grid borders',
            value: 'both',
          },
          {
            title: 'Do not show grid borders',
            value: 'none',
          },
        ],
      },
    ],
  };
};