/*
 * Copyright (C) 2012 Google Inc. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 *     * Redistributions of source code must retain the above copyright
 * notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above
 * copyright notice, this list of conditions and the following disclaimer
 * in the documentation and/or other materials provided with the
 * distribution.
 *     * Neither the name of Google Inc. nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

/* eslint-disable rulesdir/no_underscored_properties */

import * as Common from '../../core/common/common.js';
import * as SDK from '../../core/sdk/sdk.js';

export class IndexedDBModel extends SDK.SDKModel.SDKModel implements ProtocolProxyApi.StorageDispatcher {
  _securityOriginManager: SDK.SecurityOriginManager.SecurityOriginManager|null;
  _indexedDBAgent: ProtocolProxyApi.IndexedDBApi;
  _storageAgent: ProtocolProxyApi.StorageApi;
  _databases: Map<DatabaseId, Database>;
  _databaseNamesBySecurityOrigin: {
    [x: string]: string[],
  };
  _originsUpdated: Set<string>;
  _throttler: Common.Throttler.Throttler;
  _enabled?: boolean;

  constructor(target: SDK.SDKModel.Target) {
    super(target);
    target.registerStorageDispatcher(this);
    this._securityOriginManager = target.model(SDK.SecurityOriginManager.SecurityOriginManager);
    this._indexedDBAgent = target.indexedDBAgent();
    this._storageAgent = target.storageAgent();

    this._databases = new Map();
    this._databaseNamesBySecurityOrigin = {};

    this._originsUpdated = new Set();
    this._throttler = new Common.Throttler.Throttler(1000);
  }

  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static keyFromIDBKey(idbKey: any): Protocol.IndexedDB.Key|undefined {
    if (typeof (idbKey) === 'undefined' || idbKey === null) {
      return undefined;
    }

    let key: Protocol.IndexedDB.Key;
    switch (typeof (idbKey)) {
      case 'number':
        key = {
          type: Protocol.IndexedDB.KeyType.Number,
          number: idbKey,
        };
        break;
      case 'string':
        key = {
          type: Protocol.IndexedDB.KeyType.String,
          string: idbKey,
        };
        break;
      case 'object':
        if (idbKey instanceof Date) {
          key = {
            type: Protocol.IndexedDB.KeyType.Date,
            date: idbKey.getTime(),
          };
        } else if (Array.isArray(idbKey)) {
          const array = [];
          for (let i = 0; i < idbKey.length; ++i) {
            const nestedKey = IndexedDBModel.keyFromIDBKey(idbKey[i]);
            if (nestedKey) {
              array.push(nestedKey);
            }
          }
          key = {
            type: Protocol.IndexedDB.KeyType.Array,
            array,
          };
        } else {
          return undefined;
        }
        break;
      default:
        return undefined;
    }
    return key;
  }

  static _keyRangeFromIDBKeyRange(idbKeyRange: IDBKeyRange): Protocol.IndexedDB.KeyRange {
    return {
      lower: IndexedDBModel.keyFromIDBKey(idbKeyRange.lower),
      upper: IndexedDBModel.keyFromIDBKey(idbKeyRange.upper),
      lowerOpen: Boolean(idbKeyRange.lowerOpen),
      upperOpen: Boolean(idbKeyRange.upperOpen),
    };
  }

  static idbKeyPathFromKeyPath(keyPath: Protocol.IndexedDB.KeyPath): string|string[]|null|undefined {
    let idbKeyPath;
    switch (keyPath.type) {
      case Protocol.IndexedDB.KeyPathType.Null:
        idbKeyPath = null;
        break;
      case Protocol.IndexedDB.KeyPathType.String:
        idbKeyPath = keyPath.string;
        break;
      case Protocol.IndexedDB.KeyPathType.Array:
        idbKeyPath = keyPath.array;
        break;
    }
    return idbKeyPath;
  }

  static keyPathStringFromIDBKeyPath(idbKeyPath: string|string[]|null|undefined): string|null {
    if (typeof idbKeyPath === 'string') {
      return '"' + idbKeyPath + '"';
    }
    if (idbKeyPath instanceof Array) {
      return '["' + idbKeyPath.join('", "') + '"]';
    }
    return null;
  }

  enable(): void {
    if (this._enabled) {
      return;
    }

    this._indexedDBAgent.invoke_enable();
    if (this._securityOriginManager) {
      this._securityOriginManager.addEventListener(
          SDK.SecurityOriginManager.Events.SecurityOriginAdded, this._securityOriginAdded, this);
      this._securityOriginManager.addEventListener(
          SDK.SecurityOriginManager.Events.SecurityOriginRemoved, this._securityOriginRemoved, this);

      for (const securityOrigin of this._securityOriginManager.securityOrigins()) {
        this._addOrigin(securityOrigin);
      }
    }

    this._enabled = true;
  }

  clearForOrigin(origin: string): void {
    if (!this._enabled || !this._databaseNamesBySecurityOrigin[origin]) {
      return;
    }

    this._removeOrigin(origin);
    this._addOrigin(origin);
  }

  async deleteDatabase(databaseId: DatabaseId): Promise<void> {
    if (!this._enabled) {
      return;
    }
    await this._indexedDBAgent.invoke_deleteDatabase(
        {securityOrigin: databaseId.securityOrigin, databaseName: databaseId.name});
    this._loadDatabaseNames(databaseId.securityOrigin);
  }

  async refreshDatabaseNames(): Promise<void> {
    for (const securityOrigin in this._databaseNamesBySecurityOrigin) {
      await this._loadDatabaseNames(securityOrigin);
    }
    this.dispatchEventToListeners(Events.DatabaseNamesRefreshed);
  }

  refreshDatabase(databaseId: DatabaseId): void {
    this._loadDatabase(databaseId, true);
  }

  async clearObjectStore(databaseId: DatabaseId, objectStoreName: string): Promise<void> {
    await this._indexedDBAgent.invoke_clearObjectStore(
        {securityOrigin: databaseId.securityOrigin, databaseName: databaseId.name, objectStoreName});
  }

  async deleteEntries(databaseId: DatabaseId, objectStoreName: string, idbKeyRange: IDBKeyRange): Promise<void> {
    const keyRange = IndexedDBModel._keyRangeFromIDBKeyRange(idbKeyRange);
    await this._indexedDBAgent.invoke_deleteObjectStoreEntries(
        {securityOrigin: databaseId.securityOrigin, databaseName: databaseId.name, objectStoreName, keyRange});
  }

  _securityOriginAdded(event: Common.EventTarget.EventTargetEvent): void {
    const securityOrigin = (event.data as string);
    this._addOrigin(securityOrigin);
  }

  _securityOriginRemoved(event: Common.EventTarget.EventTargetEvent): void {
    const securityOrigin = (event.data as string);
    this._removeOrigin(securityOrigin);
  }

  _addOrigin(securityOrigin: string): void {
    console.assert(!this._databaseNamesBySecurityOrigin[securityOrigin]);
    this._databaseNamesBySecurityOrigin[securityOrigin] = [];
    this._loadDatabaseNames(securityOrigin);
    if (this._isValidSecurityOrigin(securityOrigin)) {
      this._storageAgent.invoke_trackIndexedDBForOrigin({origin: securityOrigin});
    }
  }

  _removeOrigin(securityOrigin: string): void {
    console.assert(Boolean(this._databaseNamesBySecurityOrigin[securityOrigin]));
    for (let i = 0; i < this._databaseNamesBySecurityOrigin[securityOrigin].length; ++i) {
      this._databaseRemoved(securityOrigin, this._databaseNamesBySecurityOrigin[securityOrigin][i]);
    }
    delete this._databaseNamesBySecurityOrigin[securityOrigin];
    if (this._isValidSecurityOrigin(securityOrigin)) {
      this._storageAgent.invoke_untrackIndexedDBForOrigin({origin: securityOrigin});
    }
  }

  _isValidSecurityOrigin(securityOrigin: string): boolean {
    const parsedURL = Common.ParsedURL.ParsedURL.fromString(securityOrigin);
    return parsedURL !== null && parsedURL.scheme.startsWith('http');
  }

  _updateOriginDatabaseNames(securityOrigin: string, databaseNames: string[]): void {
    const newDatabaseNames = new Set<string>(databaseNames);
    const oldDatabaseNames = new Set<string>(this._databaseNamesBySecurityOrigin[securityOrigin]);

    this._databaseNamesBySecurityOrigin[securityOrigin] = databaseNames;

    for (const databaseName of oldDatabaseNames) {
      if (!newDatabaseNames.has(databaseName)) {
        this._databaseRemoved(securityOrigin, databaseName);
      }
    }
    for (const databaseName of newDatabaseNames) {
      if (!oldDatabaseNames.has(databaseName)) {
        this._databaseAdded(securityOrigin, databaseName);
      }
    }
  }

  databases(): DatabaseId[] {
    const result = [];
    for (const securityOrigin in this._databaseNamesBySecurityOrigin) {
      const databaseNames = this._databaseNamesBySecurityOrigin[securityOrigin];
      for (let i = 0; i < databaseNames.length; ++i) {
        result.push(new DatabaseId(securityOrigin, databaseNames[i]));
      }
    }
    return result;
  }

  _databaseAdded(securityOrigin: string, databaseName: string): void {
    const databaseId = new DatabaseId(securityOrigin, databaseName);
    this.dispatchEventToListeners(Events.DatabaseAdded, {model: this, databaseId: databaseId});
  }

  _databaseRemoved(securityOrigin: string, databaseName: string): void {
    const databaseId = new DatabaseId(securityOrigin, databaseName);
    this.dispatchEventToListeners(Events.DatabaseRemoved, {model: this, databaseId: databaseId});
  }

  async _loadDatabaseNames(securityOrigin: string): Promise<string[]> {
    const {databaseNames} = await this._indexedDBAgent.invoke_requestDatabaseNames({securityOrigin});
    if (!databaseNames) {
      return [];
    }
    if (!this._databaseNamesBySecurityOrigin[securityOrigin]) {
      return [];
    }
    this._updateOriginDatabaseNames(securityOrigin, databaseNames);
    return databaseNames;
  }

  async _loadDatabase(databaseId: DatabaseId, entriesUpdated: boolean): Promise<void> {
    const {databaseWithObjectStores} = await this._indexedDBAgent.invoke_requestDatabase(
        {securityOrigin: databaseId.securityOrigin, databaseName: databaseId.name});

    if (!databaseWithObjectStores) {
      return;
    }
    if (!this._databaseNamesBySecurityOrigin[databaseId.securityOrigin]) {
      return;
    }

    const databaseModel = new Database(databaseId, databaseWithObjectStores.version);
    this._databases.set(databaseId, databaseModel);
    for (const objectStore of databaseWithObjectStores.objectStores) {
      const objectStoreIDBKeyPath = IndexedDBModel.idbKeyPathFromKeyPath(objectStore.keyPath);
      const objectStoreModel = new ObjectStore(objectStore.name, objectStoreIDBKeyPath, objectStore.autoIncrement);
      for (let j = 0; j < objectStore.indexes.length; ++j) {
        const index = objectStore.indexes[j];
        const indexIDBKeyPath = IndexedDBModel.idbKeyPathFromKeyPath(index.keyPath);
        const indexModel = new Index(index.name, indexIDBKeyPath, index.unique, index.multiEntry);
        objectStoreModel.indexes.set(indexModel.name, indexModel);
      }
      databaseModel.objectStores.set(objectStoreModel.name, objectStoreModel);
    }

    this.dispatchEventToListeners(
        Events.DatabaseLoaded, {model: this, database: databaseModel, entriesUpdated: entriesUpdated});
  }

  loadObjectStoreData(
      databaseId: DatabaseId, objectStoreName: string, idbKeyRange: IDBKeyRange|null, skipCount: number,
      pageSize: number, callback: (arg0: Array<Entry>, arg1: boolean) => void): void {
    this._requestData(databaseId, databaseId.name, objectStoreName, '', idbKeyRange, skipCount, pageSize, callback);
  }

  loadIndexData(
      databaseId: DatabaseId, objectStoreName: string, indexName: string, idbKeyRange: IDBKeyRange|null,
      skipCount: number, pageSize: number, callback: (arg0: Array<Entry>, arg1: boolean) => void): void {
    this._requestData(
        databaseId, databaseId.name, objectStoreName, indexName, idbKeyRange, skipCount, pageSize, callback);
  }

  async _requestData(
      databaseId: DatabaseId, databaseName: string, objectStoreName: string, indexName: string,
      idbKeyRange: IDBKeyRange|null, skipCount: number, pageSize: number,
      callback: (arg0: Array<Entry>, arg1: boolean) => void): Promise<void> {
    const keyRange = idbKeyRange ? IndexedDBModel._keyRangeFromIDBKeyRange(idbKeyRange) : undefined;

    const response = await this._indexedDBAgent.invoke_requestData({
      securityOrigin: databaseId.securityOrigin,
      databaseName,
      objectStoreName,
      indexName,
      skipCount,
      pageSize,
      keyRange,
    });

    if (response.getError()) {
      console.error('IndexedDBAgent error: ' + response.getError());
      return;
    }

    const runtimeModel = this.target().model(SDK.RuntimeModel.RuntimeModel);
    if (!runtimeModel || !this._databaseNamesBySecurityOrigin[databaseId.securityOrigin]) {
      return;
    }
    const dataEntries = response.objectStoreDataEntries;
    const entries = [];
    for (const dataEntry of dataEntries) {
      const key = runtimeModel.createRemoteObject(dataEntry.key);
      const primaryKey = runtimeModel.createRemoteObject(dataEntry.primaryKey);
      const value = runtimeModel.createRemoteObject(dataEntry.value);
      entries.push(new Entry(key, primaryKey, value));
    }
    callback(entries, response.hasMore);
  }

  async getMetadata(databaseId: DatabaseId, objectStore: ObjectStore): Promise<ObjectStoreMetadata|null> {
    const databaseOrigin = databaseId.securityOrigin;
    const databaseName = databaseId.name;
    const objectStoreName = objectStore.name;
    const response =
        await this._indexedDBAgent.invoke_getMetadata({securityOrigin: databaseOrigin, databaseName, objectStoreName});

    if (response.getError()) {
      console.error('IndexedDBAgent error: ' + response.getError());
      return null;
    }
    return {entriesCount: response.entriesCount, keyGeneratorValue: response.keyGeneratorValue};
  }

  async _refreshDatabaseList(securityOrigin: string): Promise<void> {
    const databaseNames = await this._loadDatabaseNames(securityOrigin);
    for (const databaseName of databaseNames) {
      this._loadDatabase(new DatabaseId(securityOrigin, databaseName), false);
    }
  }

  indexedDBListUpdated({origin: securityOrigin}: Protocol.Storage.IndexedDBListUpdatedEvent): void {
    this._originsUpdated.add(securityOrigin);

    this._throttler.schedule(() => {
      const promises = Array.from(this._originsUpdated, securityOrigin => {
        this._refreshDatabaseList(securityOrigin);
      });
      this._originsUpdated.clear();
      return Promise.all(promises);
    });
  }

  indexedDBContentUpdated({origin: securityOrigin, databaseName, objectStoreName}:
                              Protocol.Storage.IndexedDBContentUpdatedEvent): void {
    const databaseId = new DatabaseId(securityOrigin, databaseName);
    this.dispatchEventToListeners(
        Events.IndexedDBContentUpdated, {databaseId: databaseId, objectStoreName: objectStoreName, model: this});
  }

  cacheStorageListUpdated(_event: Protocol.Storage.CacheStorageListUpdatedEvent): void {
  }

  cacheStorageContentUpdated(_event: Protocol.Storage.CacheStorageContentUpdatedEvent): void {
  }
}

SDK.SDKModel.SDKModel.register(IndexedDBModel, {capabilities: SDK.SDKModel.Capability.Storage, autostart: false});

// TODO(crbug.com/1167717): Make this a const enum again
// eslint-disable-next-line rulesdir/const_enum
export enum Events {
  DatabaseAdded = 'DatabaseAdded',
  DatabaseRemoved = 'DatabaseRemoved',
  DatabaseLoaded = 'DatabaseLoaded',
  DatabaseNamesRefreshed = 'DatabaseNamesRefreshed',
  IndexedDBContentUpdated = 'IndexedDBContentUpdated',
}


export class Entry {
  key: SDK.RemoteObject.RemoteObject;
  primaryKey: SDK.RemoteObject.RemoteObject;
  value: SDK.RemoteObject.RemoteObject;

  constructor(
      key: SDK.RemoteObject.RemoteObject, primaryKey: SDK.RemoteObject.RemoteObject,
      value: SDK.RemoteObject.RemoteObject) {
    this.key = key;
    this.primaryKey = primaryKey;
    this.value = value;
  }
}

export class DatabaseId {
  securityOrigin: string;
  name: string;
  constructor(securityOrigin: string, name: string) {
    this.securityOrigin = securityOrigin;
    this.name = name;
  }

  equals(databaseId: DatabaseId): boolean {
    return this.name === databaseId.name && this.securityOrigin === databaseId.securityOrigin;
  }
}

export class Database {
  databaseId: DatabaseId;
  version: number;
  objectStores: Map<string, ObjectStore>;
  constructor(databaseId: DatabaseId, version: number) {
    this.databaseId = databaseId;
    this.version = version;
    this.objectStores = new Map();
  }
}

export class ObjectStore {
  name: string;
  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keyPath: any;
  autoIncrement: boolean;
  indexes: Map<string, Index>;

  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(name: string, keyPath: any, autoIncrement: boolean) {
    this.name = name;
    this.keyPath = keyPath;
    this.autoIncrement = autoIncrement;
    this.indexes = new Map();
  }

  get keyPathString(): string {
    // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
    // @ts-expect-error
    return IndexedDBModel.keyPathStringFromIDBKeyPath((this.keyPath as string));
  }
}

export class Index {
  name: string;
  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  keyPath: any;
  unique: boolean;
  multiEntry: boolean;
  // TODO(crbug.com/1172300) Ignored during the jsdoc to ts migration)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(name: string, keyPath: any, unique: boolean, multiEntry: boolean) {
    this.name = name;
    this.keyPath = keyPath;
    this.unique = unique;
    this.multiEntry = multiEntry;
  }

  get keyPathString(): string {
    return IndexedDBModel.keyPathStringFromIDBKeyPath((this.keyPath as string)) as string;
  }
}
export interface ObjectStoreMetadata {
  entriesCount: number;
  keyGeneratorValue: number;
}
