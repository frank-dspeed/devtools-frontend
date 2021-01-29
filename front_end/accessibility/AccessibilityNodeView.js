// Copyright 2016 The Chromium Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

import * as Common from '../common/common.js';
import * as i18n from '../i18n/i18n.js';
import * as SDK from '../sdk/sdk.js';
import * as UI from '../ui/ui.js';

import {AXAttributes, AXNativeSourceTypes, AXSourceTypes} from './AccessibilityStrings.js';
import {AccessibilitySubPane} from './AccessibilitySubPane.js';

export const UIStrings = {
  /**
  *@description Text in Accessibility Node View of the Accessibility panel
  */
  computedProperties: 'Computed Properties',
  /**
  *@description Text in Accessibility Node View of the Accessibility panel
  */
  noAccessibilityNode: 'No accessibility node',
  /**
  *@description Text in Accessibility Node View of the Accessibility panel
  */
  accessibilityNodeNotExposed: 'Accessibility node not exposed',
  /**
  *@description Text in Accessibility Node View of the Accessibility panel
  */
  invalidSource: 'Invalid source.',
  /**
  *@description Text in Accessibility Node View of the Accessibility panel
  */
  notSpecified: 'Not specified',
  /**
  *@description Text in Accessibility Node View of the Accessibility panel
  */
  noNodeWithThisId: 'No node with this ID.',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  */
  elementIsHiddenBy: 'Element is hidden by active modal dialog:\xA0',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  */
  ancestorChildrenAreAll: 'Ancestor\'s children are all presentational:\xA0',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  @example {aria-hidden} PH1
  */
  elementIsPlaceholder: 'Element is {PH1}.',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  *@example {aria-hidden} PH1
  *@example {true} PH2
  */
  placeholderIsPlaceholderOnAncestor: '{PH1} is {PH2} on ancestor:\xA0',
  /**
  *@description Text in Accessibility Node View of the Accessibility panel
  */
  elementHasEmptyAltText: 'Element has empty alt text.',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  */
  noTextContent: 'No text content.',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  */
  elementIsInert: 'Element is inert.',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  */
  elementIsInAnInertSubTree: 'Element is in an inert subtree from\xA0',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  */
  elementsInheritsPresentational: 'Element inherits presentational role from\xA0',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  */
  partOfLabelElement: 'Part of label element:\xA0',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  */
  labelFor: 'Label for\xA0',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  */
  elementIsNotRendered: 'Element is not rendered.',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  */
  elementIsNotVisible: 'Element is not visible.',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  @example {role=link} PH1
  */
  elementHasPlaceholder: 'Element has {PH1}.',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  */
  elementIsPresentational: 'Element is presentational.',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility panel
  */
  staticTextNodeIsUsed: 'Static text node is used as name for\xA0',
  /**
  *@description Reason element in Accessibility Node View of the Accessibility pane
  */
  elementNotInteresting: 'Element not interesting for accessibility.',
};
const str_ = i18n.i18n.registerUIStrings('accessibility/AccessibilityNodeView.js', UIStrings);
const i18nString = i18n.i18n.getLocalizedString.bind(undefined, str_);
export class AXNodeSubPane extends AccessibilitySubPane {
  constructor() {
    super(i18nString(UIStrings.computedProperties));

    /**
     * @protected
     * @type {?SDK.AccessibilityModel.AccessibilityNode}
     */
    this._axNode = null;

    this.contentElement.classList.add('ax-subpane');

    this._noNodeInfo = this.createInfo(i18nString(UIStrings.noAccessibilityNode));
    this._ignoredInfo = this.createInfo(i18nString(UIStrings.accessibilityNodeNotExposed), 'ax-ignored-info hidden');

    this._treeOutline = this.createTreeOutline();
    this._ignoredReasonsTree = this.createTreeOutline();

    this.element.classList.add('accessibility-computed');
    this.registerRequiredCSS('accessibility/accessibilityNode.css', {enableLegacyPatching: false});
    this._treeOutline.setFocusable(true);
  }

  /**
   * @param {?SDK.AccessibilityModel.AccessibilityNode} axNode
   * @override
   */
  setAXNode(axNode) {
    if (this._axNode === axNode) {
      return;
    }
    this._axNode = axNode;

    const treeOutline = this._treeOutline;
    treeOutline.removeChildren();
    const ignoredReasons = this._ignoredReasonsTree;
    ignoredReasons.removeChildren();

    if (!axNode) {
      treeOutline.element.classList.add('hidden');
      this._ignoredInfo.classList.add('hidden');
      ignoredReasons.element.classList.add('hidden');

      this._noNodeInfo.classList.remove('hidden');
      this.element.classList.add('ax-ignored-node-pane');

      return;
    }

    if (axNode.ignored()) {
      this._noNodeInfo.classList.add('hidden');
      treeOutline.element.classList.add('hidden');
      this.element.classList.add('ax-ignored-node-pane');

      this._ignoredInfo.classList.remove('hidden');
      ignoredReasons.element.classList.remove('hidden');
      /**
       * @param {!Protocol.Accessibility.AXProperty} property
       */
      function addIgnoredReason(property) {
        ignoredReasons.appendChild(new AXNodeIgnoredReasonTreeElement(
            property, /** @type {!SDK.AccessibilityModel.AccessibilityNode} */ (axNode)));
      }
      const ignoredReasonsArray = /** @type {!Array<!Protocol.Accessibility.AXProperty>} */ (axNode.ignoredReasons());
      for (const reason of ignoredReasonsArray) {
        addIgnoredReason(reason);
      }
      if (!ignoredReasons.firstChild()) {
        ignoredReasons.element.classList.add('hidden');
      }
      return;
    }
    this.element.classList.remove('ax-ignored-node-pane');

    this._ignoredInfo.classList.add('hidden');
    ignoredReasons.element.classList.add('hidden');
    this._noNodeInfo.classList.add('hidden');

    treeOutline.element.classList.remove('hidden');

    /**
     * @param {!SDK.AccessibilityModel.CoreOrProtocolAxProperty} property
     */
    function addProperty(property) {
      treeOutline.appendChild(new AXNodePropertyTreePropertyElement(
          property, /** @type {!SDK.AccessibilityModel.AccessibilityNode} */ (axNode)));
    }

    for (const property of axNode.coreProperties()) {
      addProperty(property);
    }

    const role = axNode.role();
    if (role) {
      /** @type {!SDK.AccessibilityModel.CoreOrProtocolAxProperty} */
      const roleProperty = {name: SDK.AccessibilityModel.CoreAxPropertyName.Role, value: role};
      addProperty(roleProperty);
    }
    for (const property of /** @type {!Array.<!Protocol.Accessibility.AXProperty>} */ (axNode.properties())) {
      addProperty(property);
    }

    const firstNode = treeOutline.firstChild();
    if (firstNode) {
      firstNode.select(/* omitFocus= */ true, /* selectedByUser= */ false);
    }
  }

  /**
   * @override
   * @param {?SDK.DOMModel.DOMNode} node
   */
  setNode(node) {
    super.setNode(node);
    this._axNode = null;
  }
}

export class AXNodePropertyTreeElement extends UI.TreeOutline.TreeElement {
  /**
   * @param {!SDK.AccessibilityModel.AccessibilityNode} axNode
   */
  constructor(axNode) {
    // Pass an empty title, the title gets made later in onattach.
    super('');
    this._axNode = axNode;
  }

  /**
   * @param {?Protocol.Accessibility.AXValueType} type
   * @param {string} value
   * @return {!Element}
   */
  static createSimpleValueElement(type, value) {
    let valueElement;
    const AXValueType = Protocol.Accessibility.AXValueType;
    if (!type || type === AXValueType.ValueUndefined || type === AXValueType.ComputedString) {
      valueElement = document.createElement('span');
    } else {
      valueElement = document.createElement('span');
      valueElement.classList.add('monospace');
    }
    let valueText;
    const isStringProperty = type && StringProperties.has(type);
    if (isStringProperty) {
      // Render \n as a nice unicode cr symbol.
      valueText = '"' + value.replace(/\n/g, '\u21B5') + '"';
    } else {
      valueText = String(value);
    }

    if (type && type in TypeStyles) {
      valueElement.classList.add(TypeStyles[type]);
    }

    valueElement.setTextContentTruncatedIfNeeded(valueText || '');

    UI.Tooltip.Tooltip.install(valueElement, String(value) || '');

    return valueElement;
  }

  /**
   * @param {string} tooltip
   * @return {!Element}
   */
  static createExclamationMark(tooltip) {
    const exclamationElement =
        /** @type {!UI.UIUtils.DevToolsIconLabel} */ (document.createElement('span', {is: 'dt-icon-label'}));
    exclamationElement.type = 'smallicon-warning';
    UI.Tooltip.Tooltip.install(exclamationElement, tooltip);
    return exclamationElement;
  }

  /**
   * @param {string} name
   */
  appendNameElement(name) {
    const nameElement = document.createElement('span');
    if (name in AXAttributes) {
      // @ts-ignore TS can't cast name here but we checked it's valid.
      const attribute = AXAttributes[name];
      nameElement.textContent = attribute.name();
      UI.Tooltip.Tooltip.install(nameElement, attribute.description());
      nameElement.classList.add('ax-readable-name');
    } else {
      nameElement.textContent = name;
      nameElement.classList.add('ax-name');
      nameElement.classList.add('monospace');
    }
    this.listItemElement.appendChild(nameElement);
  }

  /**
   * @param {!Protocol.Accessibility.AXValue} value
   */
  appendValueElement(value) {
    const AXValueType = Protocol.Accessibility.AXValueType;
    if (value.type === AXValueType.Idref || value.type === AXValueType.Node || value.type === AXValueType.IdrefList ||
        value.type === AXValueType.NodeList) {
      this.appendRelatedNodeListValueElement(value);
      return;
    }
    if (value.sources) {
      const sources = value.sources;
      for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        const child = new AXValueSourceTreeElement(source, this._axNode);
        this.appendChild(child);
      }
      this.expand();
    }
    const element = AXNodePropertyTreeElement.createSimpleValueElement(value.type, String(value.value));
    this.listItemElement.appendChild(element);
  }

  /**
   * @param {!Protocol.Accessibility.AXRelatedNode} relatedNode
   * @param {number} index
   */
  appendRelatedNode(relatedNode, index) {
    const deferredNode =
        new SDK.DOMModel.DeferredDOMNode(this._axNode.accessibilityModel().target(), relatedNode.backendDOMNodeId);
    const nodeTreeElement =
        new AXRelatedNodeSourceTreeElement({deferredNode: deferredNode, idref: undefined}, relatedNode);
    this.appendChild(nodeTreeElement);
  }

  /**
   * @param {!Protocol.Accessibility.AXRelatedNode} relatedNode
   */
  appendRelatedNodeInline(relatedNode) {
    const deferredNode =
        new SDK.DOMModel.DeferredDOMNode(this._axNode.accessibilityModel().target(), relatedNode.backendDOMNodeId);
    const linkedNode = new AXRelatedNodeElement({deferredNode: deferredNode, idref: undefined}, relatedNode);
    this.listItemElement.appendChild(linkedNode.render());
  }

  /**
   * @param {!Protocol.Accessibility.AXValue} value
   */
  appendRelatedNodeListValueElement(value) {
    if (value.relatedNodes && value.relatedNodes.length === 1 && !value.value) {
      this.appendRelatedNodeInline(value.relatedNodes[0]);
      return;
    }

    if (value.relatedNodes) {
      value.relatedNodes.forEach(this.appendRelatedNode, this);
    }
    if (value.relatedNodes && value.relatedNodes.length <= 3) {
      this.expand();
    } else {
      this.collapse();
    }
  }
}

/** @type {!Object<string, string>} */
export const TypeStyles = {
  attribute: 'ax-value-string',
  boolean: 'object-value-boolean',
  booleanOrUndefined: 'object-value-boolean',
  computedString: 'ax-readable-string',
  idref: 'ax-value-string',
  idrefList: 'ax-value-string',
  integer: 'object-value-number',
  internalRole: 'ax-internal-role',
  number: 'ax-value-number',
  role: 'ax-role',
  string: 'ax-value-string',
  tristate: 'object-value-boolean',
  valueUndefined: 'ax-value-undefined'
};

/** @type {!Set.<!Protocol.Accessibility.AXValueType>} */
export const StringProperties = new Set([
  Protocol.Accessibility.AXValueType.String, Protocol.Accessibility.AXValueType.ComputedString,
  Protocol.Accessibility.AXValueType.IdrefList, Protocol.Accessibility.AXValueType.Idref
]);

export class AXNodePropertyTreePropertyElement extends AXNodePropertyTreeElement {
  /**
   * @param {!SDK.AccessibilityModel.CoreOrProtocolAxProperty} property
   * @param {!SDK.AccessibilityModel.AccessibilityNode} axNode
   */
  constructor(property, axNode) {
    super(axNode);

    this._property = property;
    this.toggleOnClick = true;

    this.listItemElement.classList.add('property');
  }

  /**
   * @override
   */
  onattach() {
    this._update();
  }

  _update() {
    this.listItemElement.removeChildren();

    this.appendNameElement(this._property.name);

    this.listItemElement.createChild('span', 'separator').textContent = ':\xA0';

    this.appendValueElement(this._property.value);
  }
}

export class AXValueSourceTreeElement extends AXNodePropertyTreeElement {
  /**
   * @param {!Protocol.Accessibility.AXValueSource} source
   * @param {!SDK.AccessibilityModel.AccessibilityNode} axNode
   */
  constructor(source, axNode) {
    super(axNode);
    this._source = source;
  }

  /**
   * @override
   */
  onattach() {
    this._update();
  }

  /**
   * @param {!Protocol.Accessibility.AXRelatedNode} relatedNode
   * @param {string} idref
   */
  appendRelatedNodeWithIdref(relatedNode, idref) {
    const deferredNode =
        new SDK.DOMModel.DeferredDOMNode(this._axNode.accessibilityModel().target(), relatedNode.backendDOMNodeId);
    const nodeTreeElement = new AXRelatedNodeSourceTreeElement({deferredNode: deferredNode, idref: idref}, relatedNode);
    this.appendChild(nodeTreeElement);
  }

  /**
   * @param {!Protocol.Accessibility.AXValue} value
   */
  appendIDRefValueElement(value) {
    if (value.value === null) {
      return;
    }

    const relatedNodes = value.relatedNodes || [];

    // Content attribute is empty, but if the relationship was set via the IDL
    // then there may be related nodes.
    if (value.value === '') {
      for (const node of relatedNodes) {
        const idref = node.idref || '';
        this.appendRelatedNodeWithIdref(node, idref);
      }
      return;
    }

    const idrefs = value.value.trim().split(/\s+/);
    for (const idref of idrefs) {
      const matchingNode = relatedNodes.find(node => node.idref === idref);

      // If there is exactly one related node, it is rendered on the same line
      // of the label. If there are more, they are each rendered on their own
      // line below the label.
      // TODO(aboxhall): exclamation mark if not idreflist type
      if (matchingNode) {
        this.appendRelatedNodeWithIdref(matchingNode, idref);
      } else if (idrefs.length === 1) {
        this.listItemElement.appendChild(new AXRelatedNodeElement({deferredNode: undefined, idref: idref}).render());
      } else {
        this.appendChild(new AXRelatedNodeSourceTreeElement({deferredNode: undefined, idref: idref}));
      }
    }
  }

  /**
   * @param {!Protocol.Accessibility.AXValue} value
   * @override
   */
  appendRelatedNodeListValueElement(value) {
    const relatedNodes = value.relatedNodes;
    const numNodes = relatedNodes ? relatedNodes.length : 0;

    if (value.type === Protocol.Accessibility.AXValueType.IdrefList ||
        value.type === Protocol.Accessibility.AXValueType.Idref) {
      this.appendIDRefValueElement(value);
    } else {
      super.appendRelatedNodeListValueElement(value);
    }


    if (numNodes <= 3) {
      this.expand();
    } else {
      this.collapse();
    }
  }

  /**
   * @param {!Protocol.Accessibility.AXValueSource} source
   */
  appendSourceNameElement(source) {
    const nameElement = document.createElement('span');
    const AXValueSourceType = Protocol.Accessibility.AXValueSourceType;
    const type = source.type;
    switch (type) {
      case AXValueSourceType.Attribute:
      case AXValueSourceType.Placeholder:
      case AXValueSourceType.RelatedElement:
        if (source.nativeSource) {
          const nativeSource = source.nativeSource;
          nameElement.textContent = AXNativeSourceTypes[nativeSource].name();
          UI.Tooltip.Tooltip.install(nameElement, AXNativeSourceTypes[nativeSource].description());
          nameElement.classList.add('ax-readable-name');
          break;
        }
        nameElement.textContent = source.attribute || null;
        nameElement.classList.add('ax-name');
        nameElement.classList.add('monospace');
        break;
      default:
        if (type in AXSourceTypes) {
          nameElement.textContent = AXSourceTypes[type].name();
          UI.Tooltip.Tooltip.install(nameElement, AXSourceTypes[type].description());
          nameElement.classList.add('ax-readable-name');
        } else {
          console.warn(type, 'not in AXSourceTypes');
          nameElement.textContent = type;
        }
    }
    this.listItemElement.appendChild(nameElement);
  }

  _update() {
    this.listItemElement.removeChildren();

    if (this._source.invalid) {
      const exclamationMark = AXNodePropertyTreeElement.createExclamationMark(i18nString(UIStrings.invalidSource));
      this.listItemElement.appendChild(exclamationMark);
      this.listItemElement.classList.add('ax-value-source-invalid');
    } else if (this._source.superseded) {
      this.listItemElement.classList.add('ax-value-source-unused');
    }

    this.appendSourceNameElement(this._source);

    this.listItemElement.createChild('span', 'separator').textContent = ':\xA0';

    if (this._source.attributeValue) {
      this.appendValueElement(this._source.attributeValue);
      UI.UIUtils.createTextChild(this.listItemElement, '\xA0');
    } else if (this._source.nativeSourceValue) {
      this.appendValueElement(this._source.nativeSourceValue);
      UI.UIUtils.createTextChild(this.listItemElement, '\xA0');
      if (this._source.value) {
        this.appendValueElement(this._source.value);
      }
    } else if (this._source.value) {
      this.appendValueElement(this._source.value);
    } else {
      const valueElement = AXNodePropertyTreeElement.createSimpleValueElement(
          Protocol.Accessibility.AXValueType.ValueUndefined, i18nString(UIStrings.notSpecified));
      this.listItemElement.appendChild(valueElement);
      this.listItemElement.classList.add('ax-value-source-unused');
    }

    if (this._source.value && this._source.superseded) {
      this.listItemElement.classList.add('ax-value-source-superseded');
    }
  }
}

export class AXRelatedNodeSourceTreeElement extends UI.TreeOutline.TreeElement {
  /**
   * @param {{deferredNode: (!SDK.DOMModel.DeferredDOMNode|undefined), idref: (string|undefined)}} node
   * @param {!Protocol.Accessibility.AXRelatedNode=} value
   */
  constructor(node, value) {
    super('');

    this._value = value;
    this._axRelatedNodeElement = new AXRelatedNodeElement(node, value);
    this.selectable = true;
  }

  /**
   * @override
   */
  onattach() {
    this.listItemElement.appendChild(this._axRelatedNodeElement.render());
    if (!this._value) {
      return;
    }

    if (this._value.text) {
      this.listItemElement.appendChild(AXNodePropertyTreeElement.createSimpleValueElement(
          Protocol.Accessibility.AXValueType.ComputedString, this._value.text));
    }
  }

  /**
   * @override
   */
  onenter() {
    this._axRelatedNodeElement.revealNode();
    return true;
  }
}

export class AXRelatedNodeElement {
  /**
   * @param {{deferredNode: (!SDK.DOMModel.DeferredDOMNode|undefined), idref: (string|undefined)}} node
   * @param {!Protocol.Accessibility.AXRelatedNode=} value
   */
  constructor(node, value) {
    this._deferredNode = node.deferredNode;
    this._idref = node.idref;
    this._value = value;
  }

  /**
   * @return {!Element}
   */
  render() {
    const element = document.createElement('span');

    if (this._deferredNode) {
      const valueElement = document.createElement('span');
      element.appendChild(valueElement);
      this._deferredNode.resolvePromise().then(node => {
        Common.Linkifier.Linkifier.linkify(node, {tooltip: undefined, preventKeyboardFocus: true})
            .then(linkfied => valueElement.appendChild(linkfied));
      });
    } else if (this._idref) {
      element.classList.add('invalid');
      const valueElement = AXNodePropertyTreeElement.createExclamationMark(i18nString(UIStrings.noNodeWithThisId));
      UI.UIUtils.createTextChild(valueElement, this._idref);
      element.appendChild(valueElement);
    }

    return element;
  }

  /**
   * Attempts to cause the node referred to by the related node to be selected in the tree.
   */
  revealNode() {
    if (this._deferredNode) {
      this._deferredNode.resolvePromise().then(node => Common.Revealer.reveal(node));
    }
  }
}

export class AXNodeIgnoredReasonTreeElement extends AXNodePropertyTreeElement {
  /**
   * @param {!Protocol.Accessibility.AXProperty} property
   * @param {!SDK.AccessibilityModel.AccessibilityNode} axNode
   */
  constructor(property, axNode) {
    super(axNode);
    this._property = property;
    this._axNode = axNode;
    this.toggleOnClick = true;
    this.selectable = false;
  }

  /**
   * @param {?string} reason
   * @param {?SDK.AccessibilityModel.AccessibilityNode} axNode
   * @return {?Element}
   */
  static createReasonElement(reason, axNode) {
    let reasonElement = null;
    switch (reason) {
      case 'activeModalDialog':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.elementIsHiddenBy, {});
        break;
      case 'ancestorIsLeafNode':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.ancestorChildrenAreAll, {});
        break;
      case 'ariaHiddenElement': {
        const ariaHiddenSpan = document.createElement('span', {is: 'source-code'}).textContent = 'aria-hidden';
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.elementIsPlaceholder, {PH1: ariaHiddenSpan});
        break;
      }
      case 'ariaHiddenSubtree': {
        const ariaHiddenSpan = document.createElement('span', {is: 'source-code'}).textContent = 'aria-hidden';
        const trueSpan = document.createElement('span', {is: 'source-code'}).textContent = 'true';
        reasonElement = i18n.i18n.getFormatLocalizedString(
            str_, UIStrings.placeholderIsPlaceholderOnAncestor, {PH1: ariaHiddenSpan, PH2: trueSpan});
        break;
      }
      case 'emptyAlt':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.elementHasEmptyAltText, {});
        break;
      case 'emptyText':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.noTextContent, {});
        break;
      case 'inertElement':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.elementIsInert, {});
        break;
      case 'inertSubtree':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.elementIsInAnInertSubTree, {});
        break;
      case 'inheritsPresentation':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.elementsInheritsPresentational, {});
        break;
      case 'labelContainer':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.partOfLabelElement, {});
        break;
      case 'labelFor':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.labelFor, {});
        break;
      case 'notRendered':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.elementIsNotRendered, {});
        break;
      case 'notVisible':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.elementIsNotVisible, {});
        break;
      case 'presentationalRole': {
        const role = axNode && axNode.role() || '';
        const rolePresentationSpan = document.createElement('span', {is: 'source-code'}).textContent = 'role=' + role;
        reasonElement =
            i18n.i18n.getFormatLocalizedString(str_, UIStrings.elementHasPlaceholder, {PH1: rolePresentationSpan});
        break;
      }
      case 'probablyPresentational':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.elementIsPresentational, {});
        break;
      case 'staticTextUsedAsNameFor':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.staticTextNodeIsUsed, {});
        break;
      case 'uninteresting':
        reasonElement = i18n.i18n.getFormatLocalizedString(str_, UIStrings.elementNotInteresting, {});
        break;
    }
    if (reasonElement) {
      reasonElement.classList.add('ax-reason');
    }
    return reasonElement;
  }

  /**
   * @override
   */
  onattach() {
    this.listItemElement.removeChildren();

    this._reasonElement = AXNodeIgnoredReasonTreeElement.createReasonElement(this._property.name, this._axNode);
    if (this._reasonElement) {
      this.listItemElement.appendChild(this._reasonElement);
    }

    const value = this._property.value;
    if (value.type === Protocol.Accessibility.AXValueType.Idref) {
      this.appendRelatedNodeListValueElement(value);
    }
  }
}
