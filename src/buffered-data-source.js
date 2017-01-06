"use strict";
var ObservableHandler = (function () {
    function ObservableHandler() {
        this.observers = {};
    }
    ObservableHandler.prototype.subscribe = function (eventType, callback) {
        var _this = this;
        var index = (ObservableHandler.currentIndex++).toString();
        this.observers[index] = {
            handler: callback,
            eventType: eventType
        };
        return function () { return delete _this.observers[index]; };
    };
    ObservableHandler.prototype.notify = function (event) {
        var _this = this;
        Object.keys(this.observers).filter(function (e) { return _this.observers[e].eventType === event.eventType; }).forEach(function (key) {
            if (_this.observers[key]) {
                _this.observers[key].handler(event);
            }
        });
    };
    return ObservableHandler;
}());
ObservableHandler.currentIndex = 0;
exports.ObservableHandler = ObservableHandler;
var DataSourceEventHandlerImpl = (function () {
    function DataSourceEventHandlerImpl() {
        this.handler = new ObservableHandler();
        this.invalidateCache = this.subscriber('INVALIDATE_CACHE');
    }
    DataSourceEventHandlerImpl.prototype.subscriber = function (eventType, rowNumber) {
        var _this = this;
        var disposer;
        var self = {
            subscribe: function (handler) {
                disposer = _this.handler.subscribe(eventType, function (event) {
                    if (typeof event.value.rowNumber === 'undefined' || event.value.rowNumber === rowNumber || typeof rowNumber === 'undefined') {
                        handler(event);
                    }
                });
                return self;
            },
            dispose: function () {
                if (disposer) {
                    disposer();
                }
                return self;
            }
        };
        return self;
    };
    ;
    DataSourceEventHandlerImpl.prototype.rowEvent = function (rowNumber) {
        return {
            addRow: this.subscriber('ADD_ROW', rowNumber),
            deleteRow: this.subscriber('DELETE_ROW', rowNumber),
            updateRow: this.subscriber('UPDATE_ROW', rowNumber)
        };
    };
    ;
    return DataSourceEventHandlerImpl;
}());
exports.DataSourceEventHandlerImpl = DataSourceEventHandlerImpl;
var BufferedDataSource = (function () {
    function BufferedDataSource(options) {
        this.pageCache = {};
        this.cntCacheEntries = 0;
        this.lastRowNumber = -1;
        this.lruEntries = [];
        this.direction = 1;
        this.observable = new DataSourceEventHandlerImpl();
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
    BufferedDataSource.prototype.setDirection = function (direction) {
        this.direction = direction;
    };
    BufferedDataSource.prototype.getRow = function (rowNum) {
        var _this = this;
        // Optimisation specially for components which iterate through a number of columns
        // retrieving the same row
        if (rowNum !== this.lastRowNumber) {
            this.lastRow = this.getPage(this.toPageNum(rowNum)).then(function (page) { return page[rowNum % _this.pageSize]; });
            this.lastRowNumber = rowNum;
        }
        return this.lastRow;
    };
    BufferedDataSource.prototype.getPage = function (pageNumber) {
        return this.internalGetPage(pageNumber, false);
    };
    BufferedDataSource.prototype.internalGetPage = function (pageNumber, isPrefetching) {
        var _this = this;
        var cacheEntry = this.pageCache[pageNumber];
        var result;
        if (cacheEntry) {
            cacheEntry.updatedTs = Date.now();
            var lruIndex = this.lruEntries.indexOf(pageNumber);
            if (lruIndex !== 0) {
                this.lruEntries.splice(lruIndex, 1);
                this.lruEntries.unshift(pageNumber);
            }
            result = cacheEntry.pagePromise;
        }
        else {
            result = this.fetch(pageNumber);
        }
        if (!isPrefetching) {
            if (this.direction === 1) {
                if (this.options.dataSource.totalRows === undefined) {
                    this.prefetchForward(pageNumber, Number.MAX_VALUE);
                }
                else if (typeof this.options.dataSource.totalRows === 'number') {
                    this.prefetchForward(pageNumber, this.options.dataSource.totalRows);
                }
                else {
                    this.options.dataSource.totalRows.then(function (t) { return _this.prefetchForward(pageNumber, t); });
                }
            }
            else {
                for (var i = pageNumber - 1; i >= pageNumber - this.prefetchCnt && i >= 0; i--) {
                    this.internalGetPage(i, true);
                }
            }
        }
        return result;
    };
    BufferedDataSource.prototype.prefetchForward = function (pageNumber, end) {
        var endPage = Math.ceil(end / this.pageSize);
        for (var i = pageNumber + 1; i <= pageNumber + this.prefetchCnt && i < endPage; i++) {
            this.internalGetPage(i, true);
        }
    };
    BufferedDataSource.prototype.invalidateCache = function () {
        this.pageCache = {};
        this.cntCacheEntries = 0;
        this.lastRowNumber = -1;
        this.observable.handler.notify({
            eventType: 'INVALIDATE_CACHE',
            value: {}
        });
    };
    BufferedDataSource.prototype.invalidatePageEntry = function (pageNum) {
        delete this.pageCache[pageNum];
        var index = this.lruEntries.indexOf(pageNum);
        if (index > -1) {
            this.lruEntries.splice(index, 1);
        }
        if (this.lastRowNumber >= pageNum * this.pageSize && this.lastRowNumber < (pageNum + 1) * this.pageSize) {
            this.lastRowNumber = -1;
        }
        var baseNum = pageNum * this.pageSize;
        for (var i = 0; i < this.pageSize; i++) {
            this.notifyInvalidateRow(baseNum + i);
        }
    };
    BufferedDataSource.prototype.addNewPage = function (pageNum, pagePromise) {
        if (this.cntCacheEntries < this.cacheSize) {
            this.cntCacheEntries++;
            this.lruEntries.unshift(pageNum);
        }
        else {
            var removedPageNo = this.lruEntries.pop();
            this.lruEntries.unshift(pageNum);
            delete this.pageCache[removedPageNo];
        }
        this.pageCache[pageNum] = {
            pagePromise: pagePromise,
            updatedTs: Date.now()
        };
    };
    BufferedDataSource.prototype.fetch = function (pageNum) {
        var pagePromise = this.options.dataSource.getPage(pageNum);
        this.addNewPage(pageNum, pagePromise);
        return pagePromise;
    };
    BufferedDataSource.prototype.toPageNum = function (rowNum) {
        return Math.floor(rowNum / this.pageSize);
    };
    Object.defineProperty(BufferedDataSource.prototype, "totalRows", {
        get: function () {
            return this.options.dataSource.totalRows;
        },
        enumerable: true,
        configurable: true
    });
    BufferedDataSource.prototype.notifyDeleteRow = function (rowNumber) {
        this.observable.handler.notify({
            eventType: 'DELETE_ROW',
            value: {
                rowNumber: rowNumber
            }
        });
    };
    BufferedDataSource.prototype.notifyInvalidateRow = function (rowNumber) {
        this.observable.handler.notify({
            eventType: 'INVALIDATE_ROW',
            value: {
                rowNumber: rowNumber
            }
        });
    };
    BufferedDataSource.prototype.notifyUpdateRow = function (rowNumber, row) {
        this.observable.handler.notify({
            eventType: 'UPDATE_ROW',
            value: {
                rowNumber: rowNumber,
                row: row
            }
        });
    };
    BufferedDataSource.prototype.updateRow = function (param) {
        var _this = this;
        var pageNum = this.toPageNum(param.rowNumber);
        var pagePromise = this.pageCache[pageNum];
        if (pagePromise) {
            pagePromise.pagePromise.then(function (page) {
                page[param.rowNumber % _this.pageSize] = param.row;
                _this.notifyUpdateRow(param.rowNumber, param.row);
            });
        }
    };
    BufferedDataSource.prototype.deleteRow = function (param) {
        var _this = this;
        if (this.lastRowNumber >= param.rowNumber) {
            this.lastRowNumber = -1;
        }
        return this.options.dataSource.deleteRow(param)
            .then(function () { return _this.deleteRowFromCache(param.rowNumber); })
            .then(function () { return _this.notifyDeleteRow(param.rowNumber); });
    };
    BufferedDataSource.prototype.invalidateCacheFromPageNumber = function (pageNumber) {
        var _this = this;
        Object.keys(this.pageCache)
            .map(function (key) { return Number(key); })
            .filter(function (key) { return key >= pageNumber; })
            .forEach(function (key) { return _this.invalidatePageEntry(key); });
    };
    BufferedDataSource.prototype.deleteRowFromCache = function (rowNumber) {
        var _this = this;
        var pageNumber = this.toPageNum(rowNumber);
        var entry = this.pageCache[pageNumber];
        var firstRowPromise;
        if (entry) {
            firstRowPromise = entry.pagePromise.then(function (page) { return page[0]; });
        }
        else {
            firstRowPromise = Promise.resolve(null);
        }
        if (!entry || !this.pageCache[pageNumber + 1]) {
            this.invalidateCacheFromPageNumber(pageNumber);
        }
        else {
            var nextPageFirstRow_1 = (pageNumber + 1) * this.pageSize;
            entry.pagePromise = entry.pagePromise.then(function (page) {
                page.splice(rowNumber % _this.pageSize, 1);
                if (page.length === _this.pageSize - 1) {
                    return _this.deleteRowFromCache(nextPageFirstRow_1)
                        .then(function (row) {
                        if (row) {
                            page.push(row);
                        }
                        return page;
                    });
                }
                else {
                    return page;
                }
            }).then(function (page) {
                for (var i = rowNumber + 1; i < (pageNumber + 1) * _this.pageSize; i++) {
                    _this.notifyUpdateRow(rowNumber, page[rowNumber % _this.pageSize]);
                }
                return page;
            });
        }
        return firstRowPromise;
    };
    BufferedDataSource.prototype.notifyAddRow = function (value) {
        this.observable.handler.notify({
            eventType: 'ADD_ROW',
            value: value
        });
    };
    BufferedDataSource.prototype.addRow = function (param) {
        var _this = this;
        if (param.noUpdateDataSource) {
            if (this.totalRows.then) {
                this.totalRows.then(function (totalRows) {
                    _this.addRowToCache(totalRows, param.row);
                    _this.notifyAddRow({ row: param.row, rowNumber: totalRows });
                });
            }
            else {
                this.addRowToCache(this.totalRows, param.row);
                this.notifyAddRow({ row: param.row, rowNumber: this.totalRows });
            }
        }
        else {
            var result_1 = this.options.dataSource.addRow(param);
            return result_1.then(function (r) {
                return _this.addRowToCache(r.rowNumber, r.row)
                    .then(function () {
                    _this.notifyAddRow(r);
                    return result_1;
                });
            });
        }
    };
    BufferedDataSource.prototype.addRowToCache = function (rowNumber, row) {
        var _this = this;
        var pageNumber = this.toPageNum(rowNumber);
        var entry = this.pageCache[pageNumber];
        if (entry) {
            var nextPageFirstRow_2 = (pageNumber + 1) * this.pageSize;
            this.pageCache[pageNumber].pagePromise =
                entry.pagePromise.then(function (page) {
                    page.splice(rowNumber % _this.pageSize, 0, row);
                    if (page.length > _this.pageSize) {
                        return _this.addRowToCache(nextPageFirstRow_2, page.pop()).then(function () { return page; });
                    }
                    else {
                        return page;
                    }
                });
            return this.pageCache[pageNumber].pagePromise.then(function (page) {
                for (var i = rowNumber + 1; i < nextPageFirstRow_2; i++) {
                    _this.notifyUpdateRow(rowNumber, page[rowNumber % _this.pageSize]);
                }
            });
        }
        else {
            this.invalidateCacheFromPageNumber(pageNumber);
            return Promise.resolve();
        }
    };
    return BufferedDataSource;
}());
exports.BufferedDataSource = BufferedDataSource;
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = BufferedDataSource;
