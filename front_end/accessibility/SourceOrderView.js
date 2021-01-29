// Copyright 2020 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Host from '../host/host.js';
import * as i18n from '../i18n/i18n.js';
import * as SDK from '../sdk/sdk.js';  // eslint-disable-line no-unused-vars
import * as UI from '../ui/ui.js';

import {AccessibilitySubPane} from './AccessibilitySubPane.js';

export const UIStrings = {
  /**
  *@description Text in Source Order Viewer of the Accessibility panel
  */
  sourceOrderViewer: 'Source Order Viewer',
  /**
  *@description Text in Source Order Viewer of the Accessibility panel shown when the selected node has no child elements
  */
  noSourceOrderInformation: 'No source order information available',
  /**
  *@description Text in Source Order Viewer of the Accessibility panel shown when the selected node has many child elements
  */
  thereMayBeADelayInDisplaying: 'There may be a delay in displaying source order for elements with many children',
  /**
  *@description Checkbox label in Source Order Viewer of the Accessibility panel
  */
  showSourceOrder: 'Show source order',
};
const str_ = i18n.i18n.registerUIStrings('accessibility/SourceOrderView.js', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
const MAX_CHILD_ELEMENTS_THRESHOLD = 300;

export class SourceOrderPane extends AccessibilitySubPane {
  constructor() {
    super(i18nString(UIStrings.sourceOrderViewer));

    this._noNodeInfo = this.createInfo(i18nString(UIStrings.noSourceOrderInformation));
    this._warning = this.createInfo(i18nString(UIStrings.thereMayBeADelayInDisplaying));
    this._warning.id = 'source-order-warning';
    this._checked = false;
    this._checkboxLabel =
        UI.UIUtils.CheckboxLabel.create(/* title */ i18nString(UIStrings.showSourceOrder), /* checked */ false);
    this._checkboxElement = this._checkboxLabel.checkboxElement;

    this._checkboxLabel.classList.add('source-order-checkbox');
    this._checkboxElement.addEventListener('click', this._checkboxClicked.bind(this), false);
    this.element.appendChild(this._checkboxLabel);

    /** @type {?SDK.DOMModel.DOMNode} */
    this._node = null;
    this._overlayModel = null;
  }

  /**
   * @param {?SDK.DOMModel.DOMNode} node
   * @returns {!Promise.<?>}
   */
  async setNodeAsync(node) {
    if (!this._checkboxLabel.classList.contains('hidden')) {
      this._checked = this._checkboxElement.checked;
    }
    this._checkboxElement.checked = false;
    this._checkboxClicked();
    super.setNode(node);
    if (!this._node) {
      this._overlayModel = null;
      return;
    }

    let foundSourceOrder = false;
    const childCount = this._node.childNodeCount();
    if (childCount > 0) {
      if (!this._node.children()) {
        await this._node.getSubtree(1, false);
      }
      const children = /** @type {!Array<!SDK.DOMModel.DOMNode>} */ (this._node.children());
      foundSourceOrder = children.some(child => child.nodeType() === Node.ELEMENT_NODE);
    }

    this._noNodeInfo.classList.toggle('hidden', foundSourceOrder);
    this._warning.classList.toggle('hidden', childCount < MAX_CHILD_ELEMENTS_THRESHOLD);
    this._checkboxLabel.classList.toggle('hidden', !foundSourceOrder);
    if (foundSourceOrder) {
      this._overlayModel = this._node.domModel().overlayModel();
      this._checkboxElement.checked = this._checked;
      this._checkboxClicked();
    } else {
      this._overlayModel = null;
    }
  }

  _checkboxClicked() {
    if (!this._node || !this._overlayModel) {
      return;
    }

    if (this._checkboxElement.checked) {
      Host.userMetrics.actionTaken(Host.UserMetrics.Action.SourceOrderViewActivated);
      this._overlayModel.highlightSourceOrderInOverlay(this._node);
    } else {
      this._overlayModel.hideSourceOrderInOverlay();
    }
  }
}
