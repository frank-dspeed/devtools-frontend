// Copyright (c) 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// @ts-nocheck
// TODO(crbug.com/1011811): Enable TypeScript compiler checks

import * as Common from '../common/common.js';
import * as SDK from '../sdk/sdk.js';
import * as UI from '../ui/ui.js';

import {ElementsPanel} from './ElementsPanel.js';
import {createLayoutPane, LayoutElement} from './LayoutPane_bridge.js';  // eslint-disable-line no-unused-vars

/**
 * @param {!Array<!SDK.DOMModel.DOMNode>} nodes
 * @return {!Array<!LayoutElement>}
 */
const gridNodesToElements = nodes => {
  return nodes.map(node => {
    const className = node.getAttribute('class');
    return {
      id: node.id,
      name: node.localName(),
      domId: node.getAttribute('id'),
      domClasses: className ? className.split(/\s+/) : null,
      enabled: node.domModel().overlayModel().isHighlightedGridInPersistentOverlay(node.id),
      reveal: () => {
        ElementsPanel.instance().revealAndSelectNode(node, true, true);
      },
      toggle: value => {
        if (value) {
          node.domModel().overlayModel().highlightGridInPersistentOverlay(node.id);
        } else {
          node.domModel().overlayModel().hideGridInPersistentOverlay(node.id);
        }
      }
    };
  });
};

/**
 * @unrestricted
 */
export class LayoutSidebarPane extends UI.ThrottledWidget.ThrottledWidget {
  constructor() {
    super(true /* isWebComponent */);
    this._layoutPane = createLayoutPane();
    this.contentElement.appendChild(this._layoutPane);
    this._settings = ['showGridLines', 'showGridLineNumbers', 'showGridGaps', 'showGridAreas', 'showGridTrackSizes'];
    this._boundOnSettingChanged = this.onSettingChanged.bind(this);
    this._domModels = [];
  }

  /**
   * @param {!SDK.DOMModel.DOMModel} domModel
   */
  modelAdded(domModel) {
    const overlayModel = domModel.overlayModel();
    overlayModel.addEventListener(SDK.OverlayModel.Events.PersistentGridOverlayCleared, this.update, this);
    overlayModel.addEventListener(SDK.OverlayModel.Events.PersistentGridOverlayStateChanged, this.update, this);
    this._domModels.push(domModel);
  }

  /**
   * @param {!SDK.DOMModel.DOMModel} domModel
   */
  modelRemoved(domModel) {
    const overlayModel = domModel.overlayModel();
    overlayModel.removeEventListener(SDK.OverlayModel.Events.PersistentGridOverlayCleared, this.update, this);
    overlayModel.removeEventListener(SDK.OverlayModel.Events.PersistentGridOverlayStateChanged, this.update, this);
    this._domModels = this._domModels.filter(model => model !== domModel);
  }

  async _fetchGridNodes() {
    const nodes = [];
    for (const domModel of this._domModels) {
      const nodeIds = await domModel.getNodesByStyle(
          [{name: 'display', value: 'grid'}, {name: 'display', value: 'inline-grid'}], true /* pierce */);

      nodes.push(...nodeIds.map(id => domModel.nodeForId(id)).filter(node => node !== null));
    }
    return nodes;
  }

  _mapSettings() {
    return this._settings
        .map(settingName => {
          const setting = Common.Settings.Settings.instance().moduleSetting(settingName);
          const ext = setting.extension();
          if (!ext) {
            return null;
          }
          const descriptor = ext.descriptor();
          return {
            type: descriptor.settingType,
            name: descriptor.settingName,
            title: descriptor.title,
            value: setting.get(),
            options: descriptor.options.map(opt => ({
                                              title: opt.text,
                                              value: opt.value,
                                            }))
          };
        })
        .filter(descriptor => descriptor !== null);
  }

  /**
   * @override
   * @protected
   * @return {!Promise<void>}
   */
  async doUpdate() {
    this._layoutPane.data = {
      gridElements: gridNodesToElements(await this._fetchGridNodes()),
      settings: this._mapSettings(),
    };
  }

  /**
   * @param {*} event
   */
  onSettingChanged(event) {
    Common.Settings.Settings.instance().moduleSetting(event.data.setting).set(event.data.value);
  }

  /**
   * @override
   */
  wasShown() {
    for (const setting of this._settings) {
      Common.Settings.Settings.instance().moduleSetting(setting).addChangeListener(this.update, this);
    }
    this._layoutPane.addEventListener('setting-changed', this._boundOnSettingChanged);
    for (const domModel of this._domModels) {
      this.modelRemoved(domModel);
    }
    this._domModels = [];
    SDK.SDKModel.TargetManager.instance().observeModels(SDK.DOMModel.DOMModel, this);
    UI.Context.Context.instance().addFlavorChangeListener(SDK.DOMModel.DOMNode, this.update, this);
    this.update();
  }

  /**
   * @override
   */
  willHide() {
    for (const setting of this._settings) {
      Common.Settings.Settings.instance().moduleSetting(setting).removeChangeListener(this.update, this);
    }
    this._layoutPane.removeEventListener('setting-changed', this._boundOnSettingChanged);
    SDK.SDKModel.TargetManager.instance().unobserveModels(SDK.DOMModel.DOMModel, this);
    UI.Context.Context.instance().removeFlavorChangeListener(SDK.DOMModel.DOMNode, this.update, this);
  }
}