export type Page<T> = T[];

export interface DataSource<T> {
  getPage: (pageNumber: number) => Promise<Page<T>>;
  getRow?: (rowNumber: number) => Promise<T>;
  totalRows?: number | Promise<number>;
  pageSize: number;
  deleteRow?: (param: {rowNumber: number, row?: T}) => Promise<void>;
  addRow?: (param: {row: T}) => Promise<{row: T, rowNumber: number}>;
}

export interface DataSourceObservable<T> {
  observable: DataSourceEventHandler<T>;
}

export interface DataSourceEventHandler<T> {
  rowEvent: DataSourceObservableRowSources<T>;
  invalidateCache: Source<InvalidateCacheEvent>;
}

export interface DataSourceRowEventSources<T> {
  addRow: Source<AddRowEvent<T>>;
  deleteRow: Source<DeleteRowEvent>;
  updateRow: Source<UpdateRowEvent<T>>;
}

export type DataSourceObservableRowSources<T> = (rowNumber?: number) => DataSourceRowEventSources<T>;

export type Source<T> = {
  subscribe: (handler: (event: T) => void) => Source<T>;
  dispose: () => void;
};

export interface CacheEntry<T> {
  pagePromise: Promise<T[]>;
  updatedTs: number;
}

export interface BufferedDataSourceOptions<T> {
  /**
   * Number of pages in cache. Default 4
   */
  cacheSize?: number;
  dataSource: DataSource<T>;
  /**
   * Number of pages to prefetch. Default 1
   */
  prefetchCnt?: number;
  totalPages?: number;
  eventHandlers?: EventHandlers<T>;
}

export interface ObservableEvent {
  eventType: EventType;
  value: any;
}

export interface ObservableRowEvent extends ObservableEvent {
  eventType: EventType;
  value: {
    rowNumber: number;
  };
}

export interface InvalidateCacheEvent extends ObservableEvent {
  eventType: EventType;
}

export interface AddRowEvent<T> extends ObservableEvent {
  eventType: 'ADD_ROW';
  value: {
    row: T
    rowNumber: number;
  };
}

export interface DeleteRowEvent extends ObservableEvent {
  eventType: 'DELETE_ROW';
  value: {
    rowNumber: number
  };
}

export interface InvalidateRowEvent extends ObservableEvent {
  eventType: 'INVALIDATE_ROW';
  value: {
    rowNumber: number
  };
}

export interface UpdateRowEvent<T> extends ObservableEvent {
  eventType: 'UPDATE_ROW';
  value: {
    rowNumber: number;
    row: T;
  };
}

export interface UpdateRowsEvent extends ObservableEvent {
  eventType: 'UPDATE_ROWS';
  value: {};
}

export interface RefreshEvent extends ObservableEvent {
  eventType: 'REFRESH';
  value: {};
}

export interface EventHandler<E extends ObservableEvent> {
  (event: E): void;
}

export interface EventHandlers<T> {
  updateRowEventHandler: EventHandler<UpdateRowEvent<T>>;
  updateRowsEventHandler: EventHandler<UpdateRowsEvent>;
  deleteRowEventHandler: EventHandler<DeleteRowEvent>;
  addRowEventHandler: EventHandler<AddRowEvent<T>>;
}

export type EventType = 'ADD_ROW' | 'DELETE_ROW' | 'UPDATE_ROW' | 'UPDATE_ROWS' | 'INVALIDATE_ROW'| 'REFRESH' | 'INVALIDATE_CACHE';

export class ObservableHandler {
  private observers: {
    [index: string]: {
      handler: (value: ObservableEvent) => void;
      eventType: EventType;
    }
  } = {};
  private static currentIndex = 0;

  subscribe(eventType: EventType, callback: (event: ObservableEvent) => void) {
    let index = (ObservableHandler.currentIndex++).toString();
    this.observers[index] = {
      handler: callback,
      eventType: eventType
    };
    return () => delete this.observers[index];
  }

  notify(event: ObservableEvent) {
    Object.keys(this.observers).filter(e => this.observers[e].eventType === event.eventType).forEach(key => {
      if (this.observers[key]) {
        this.observers[key].handler(event);
      }
    });
  }
}

export class DataSourceEventHandlerImpl<T> implements DataSourceEventHandler<T> {
  handler = new ObservableHandler();
  private subscriber<E extends ObservableEvent>(eventType: EventType, rowNumber?: number) {
    let disposer: () => void;

    const self = {
      subscribe: (handler: (event: E) => void) => {
        disposer = this.handler.subscribe(eventType, (event: E) => {
            if (typeof event.value.rowNumber === 'undefined' || event.value.rowNumber === rowNumber || typeof rowNumber === 'undefined') {
              handler(event);
            }
          });
        return self;
      },
      dispose: () => {
        if (disposer) {
          disposer();
        }
        return self;
      }
    };
    return self;
  };

  rowEvent(rowNumber?: number) {
    return {
      addRow: this.subscriber('ADD_ROW', rowNumber),
      deleteRow: this.subscriber('DELETE_ROW', rowNumber),
      updateRow: this.subscriber('UPDATE_ROW', rowNumber)
    };
  };

  invalidateCache = this.subscriber('INVALIDATE_CACHE');
}

export class BufferedDataSource<T> implements DataSource<T>, DataSourceObservable<T> {
  private pageCache: {[pageNum: number]: CacheEntry<T>} = {};
  cntCacheEntries = 0;
  options: BufferedDataSourceOptions<T>;
  lastRow: Promise<T>;
  lastRowNumber: number = -1;
  lruEntries: number[] = [];
  pageSize: number;
  cacheSize: number;
  prefetchCnt: number;
  direction: 1|-1 = 1;
  eventHandlers: EventHandlers<T>;
  observable = new DataSourceEventHandlerImpl<T>();

  constructor(options: BufferedDataSourceOptions<T>) {
    this.options = options;
    this.pageCache = [];
    this.pageSize = options.dataSource.pageSize;
    this.prefetchCnt = options.prefetchCnt === undefined ? 1 : options.prefetchCnt;
    this.cacheSize = (options.cacheSize === undefined ? 4 : options.cacheSize) + this.prefetchCnt;
    this.eventHandlers = options.eventHandlers;

    if (this.prefetchCnt >= this.cacheSize) {
      throw new Error('prefetchCnt should be less than cacheSize to prefent');
    }
  }

  setDirection(direction: 1|-1) {
    this.direction = direction;
  }

  getRow(rowNum: number): Promise<T> {
    // Optimisation specially for components which iterate through a number of columns
    // retrieving the same row
    if (rowNum !== this.lastRowNumber) {
      this.lastRow = this.getPage(this.toPageNum(rowNum)).then(page => page[rowNum % this.pageSize]);
      this.lastRowNumber = rowNum;
    }
    return this.lastRow;
  }

  getPage(pageNumber: number) {
    return this.internalGetPage(pageNumber, false);
  }

  private internalGetPage(pageNumber: number, isPrefetching: boolean): Promise<Page<T>> {
    let cacheEntry = this.pageCache[pageNumber];
    let result: Promise<Page<T>>;
    if (cacheEntry) {
      cacheEntry.updatedTs = Date.now();
      let lruIndex = this.lruEntries.indexOf(pageNumber);
      if (lruIndex !== 0) {
        this.lruEntries.splice(lruIndex, 1);
        this.lruEntries.unshift(pageNumber);
      }
      result = cacheEntry.pagePromise;
    } else {
      result = this.fetch(pageNumber);
    }

    if (!isPrefetching) {
      if (this.direction === 1) {
        if (this.options.dataSource.totalRows === undefined) {
          this.prefetchForward(pageNumber, Number.MAX_VALUE);
        } else if (typeof this.options.dataSource.totalRows === 'number') {
          this.prefetchForward(pageNumber, this.options.dataSource.totalRows);
        } else {
          this.options.dataSource.totalRows.then(t => this.prefetchForward(pageNumber, t));
        }

      } else {
        for (let i = pageNumber - 1; i >= pageNumber - this.prefetchCnt && i >= 0; i--) {
          this.internalGetPage(i, true);
        }
      }
    }

    return result;
  }

  private prefetchForward(pageNumber: number, end: number) {
    const endPage = Math.ceil(end / this.pageSize);
    for (let i = pageNumber + 1; i <= pageNumber + this.prefetchCnt && i < endPage; i++) {
      this.internalGetPage(i, true);
    }
  }

  invalidateCache() {
    this.pageCache = {};
    this.cntCacheEntries = 0;
    this.lastRowNumber = -1;
    this.observable.handler.notify({
      eventType: 'INVALIDATE_CACHE',
      value: {}
    });
  }

  invalidatePageEntry(pageNum: number) {
    delete this.pageCache[pageNum];
    let index = this.lruEntries.indexOf(pageNum);
    if (index > -1) {
      this.lruEntries.splice(index, 1);
    }
    if (this.lastRowNumber >= pageNum * this.pageSize && this.lastRowNumber < (pageNum + 1) * this.pageSize) {
      this.lastRowNumber = -1;
    }
    const baseNum = pageNum * this.pageSize;
    for (let i = 0; i < this.pageSize; i++) {
      this.notifyInvalidateRow(baseNum + i);
    }
  }

  private addNewPage(pageNum: number, pagePromise: Promise<Page<T>>) {
    if (this.cntCacheEntries < this.cacheSize) {
      this.cntCacheEntries++;
      this.lruEntries.unshift(pageNum);
    } else {
      let removedPageNo = this.lruEntries.pop();
      this.lruEntries.unshift(pageNum);
      delete this.pageCache[removedPageNo];
    }
    this.pageCache[pageNum] = {
      pagePromise: pagePromise,
      updatedTs: Date.now()
    };
  }

  private fetch(pageNum: number): Promise<Page<T>> {
    let pagePromise = this.options.dataSource.getPage(pageNum);
    this.addNewPage(pageNum, pagePromise);
    return pagePromise;
  }

  toPageNum(rowNum: number) {
    return Math.floor(rowNum / this.pageSize);
  }

  get totalRows() {
    return this.options.dataSource.totalRows;
  }

  private notifyDeleteRow(rowNumber: number) {
    this.observable.handler.notify({
      eventType: 'DELETE_ROW',
      value: {
        rowNumber: rowNumber
      }
    });
  }

  private notifyInvalidateRow(rowNumber: number) {
    this.observable.handler.notify({
      eventType: 'INVALIDATE_ROW',
      value: {
        rowNumber: rowNumber
      }
    });
  }

  private notifyUpdateRow(rowNumber: number, row: T) {
    this.observable.handler.notify({
      eventType: 'UPDATE_ROW',
      value: {
        rowNumber: rowNumber,
        row: row
      }
    });
  }

  updateRow(param: {rowNumber: number, row: T}) {
    const pageNum = this.toPageNum(param.rowNumber);
    const pagePromise = this.pageCache[pageNum];
    if (pagePromise) {
      pagePromise.pagePromise.then(page => {
        page[param.rowNumber % this.pageSize] = param.row;
        this.notifyUpdateRow(param.rowNumber, param.row);
      });
    }
  }

  deleteRow(param: {rowNumber: number, row?: T}): Promise<void> {
    if (this.lastRowNumber >= param.rowNumber) {
      this.lastRowNumber = -1;
    }
    return this.options.dataSource.deleteRow(param)
      .then(() => this.deleteRowFromCache(param.rowNumber))
      .then(() => this.notifyDeleteRow(param.rowNumber));
  }

  private invalidateCacheFromPageNumber(pageNumber: number) {
    Object.keys(this.pageCache)
      .map(key => Number(key))
      .filter(key => key >= pageNumber)
      .forEach(key => this.invalidatePageEntry(key))
    ;
  }

  private deleteRowFromCache(rowNumber: number): Promise<T> {
    const pageNumber = this.toPageNum(rowNumber);
    const entry = this.pageCache[pageNumber];
    let firstRowPromise: Promise<T>;
    if (entry) {
      firstRowPromise = entry.pagePromise.then(page => page[0]);
    } else {
      firstRowPromise = Promise.resolve(null);
    }

    if (!entry || !this.pageCache[pageNumber + 1]) {
      this.invalidateCacheFromPageNumber(pageNumber);
    } else {
      const nextPageFirstRow = (pageNumber + 1) * this.pageSize;
      entry.pagePromise = entry.pagePromise.then(page => {
        page.splice(rowNumber % this.pageSize, 1);
        if (page.length === this.pageSize - 1) {
          return this.deleteRowFromCache(nextPageFirstRow)
            .then(row => {
              if (row) {
                page.push(row);
              }
              return page;
            });
        } else {
          return page;
        }
      }).then(page => {
        for (let i = rowNumber + 1; i < (pageNumber + 1) * this.pageSize; i++) {
          this.notifyUpdateRow(rowNumber, page[rowNumber % this.pageSize]);
        }
        return page;
      });
    }
    return firstRowPromise;
  }

  private notifyAddRow(value: {row: T, rowNumber: number}) {
    this.observable.handler.notify({
      eventType: 'ADD_ROW',
      value: value
    });
  }

  public addRow(param: {row: T, noUpdateDataSource?: boolean}) {
    if (param.noUpdateDataSource) {
      if ((this.totalRows as Promise<number>).then) {
        (this.totalRows as Promise<number>).then(totalRows => {
          this.addRowToCache(totalRows, param.row);
          this.notifyAddRow({row: param.row, rowNumber: totalRows});
        });
      } else {
        this.addRowToCache(this.totalRows as number, param.row);
        this.notifyAddRow({row: param.row, rowNumber: this.totalRows as number});
      }
    } else {
      const result = this.options.dataSource.addRow(param);
      return result.then(r =>
        this.addRowToCache(r.rowNumber, r.row)
          .then(() => {
            this.notifyAddRow(r);
            return result;
          })
      );
    }
  }

  private addRowToCache(rowNumber: number, row: T): Promise<void> {
    const pageNumber = this.toPageNum(rowNumber);
    const entry = this.pageCache[pageNumber];
    if (entry) {
      const nextPageFirstRow = (pageNumber + 1) * this.pageSize;
      this.pageCache[pageNumber].pagePromise =
        entry.pagePromise.then(page => {
          page.splice(rowNumber % this.pageSize, 0, row);
          if (page.length > this.pageSize) {
            return this.addRowToCache(nextPageFirstRow, page.pop()).then(() => page);
          } else {
            return page;
          }
        });
      return this.pageCache[pageNumber].pagePromise.then((page) => {
        for (let i = rowNumber + 1; i < nextPageFirstRow; i++) {
          this.notifyUpdateRow(rowNumber, page[rowNumber % this.pageSize]);
        }
      });
    } else {
      this.invalidateCacheFromPageNumber(pageNumber);
      return Promise.resolve();
    }
  }
}

export default BufferedDataSource;