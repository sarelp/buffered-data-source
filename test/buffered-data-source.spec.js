"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var buffered_data_source_1 = require("../src/buffered-data-source");
require("mocha");
var assert = require('assert');
describe('BufferedDataSource', function () {
    describe('Reading rows from BufferedDataSource', function () {
        var data = ['row0', 'row1', 'row2', 'row3', 'row4', 'row5', 'row6'];
        var TestDataSource = /** @class */ (function () {
            function TestDataSource(pageSize) {
                this.pageSize = pageSize;
            }
            TestDataSource.prototype.getPage = function (pageNumber) {
                return Promise.resolve(data.slice(this.pageSize * pageNumber, this.pageSize * (pageNumber + 1)));
            };
            return TestDataSource;
        }());
        var ds = new TestDataSource(2);
        var cds = new buffered_data_source_1.BufferedDataSource({ dataSource: ds });
        var _loop_1 = function (i) {
            it("should retrieve row " + i, function () {
                return cds.getRow(i).then(function (row) { return assert.equal(row, 'row' + i); });
            });
        };
        for (var i = 0; i < 7; i++) {
            _loop_1(i);
        }
        it('should return undefined if row is not present', function () { return cds.getRow(7).then(function (row) { return assert.equal(row, undefined); }); });
    });
    describe('Checking prefetching logic', function () {
        var TestPromiseDataSource = /** @class */ (function () {
            function TestPromiseDataSource(pageSize, totalRows) {
                this.record = [];
                this.pageSize = pageSize;
                this.totalRows = totalRows;
            }
            TestPromiseDataSource.prototype.getPage = function (pageNumber) {
                var _this = this;
                return new Promise(function (resolve) { return _this.record.push({ pageNum: pageNumber, resolver: resolve }); });
            };
            TestPromiseDataSource.prototype.resolveAll = function () {
                this.record.forEach(function (r) { return r.resolver(['page' + r.pageNum]); });
            };
            return TestPromiseDataSource;
        }());
        it('should not reread a cached page from the datasource', function () {
            var pds = new TestPromiseDataSource(2);
            var cpds = new buffered_data_source_1.BufferedDataSource({ dataSource: pds, prefetchCnt: 0 });
            var p1 = cpds.getPage(2);
            var p2 = cpds.getPage(2);
            var i = 0;
            assert.equal(pds.record[i++].pageNum, 2);
            assert.equal(pds.record.length, i);
            assert.equal(p1, p2);
        });
        it('should remove the oldest entry from the cache when the cache is full', function () {
            var pds = new TestPromiseDataSource(2);
            var cpds = new buffered_data_source_1.BufferedDataSource({ dataSource: pds, prefetchCnt: 0, cacheSize: 2 });
            var results = [];
            results.push(cpds.getPage(2));
            results.push(cpds.getPage(3));
            results.push(cpds.getPage(3));
            results.push(cpds.getPage(4));
            results.push(cpds.getPage(2));
            pds.resolveAll();
            var i = 0;
            assert.equal(pds.record[i++].pageNum, 2);
            assert.equal(pds.record[i++].pageNum, 3);
            assert.equal(pds.record[i++].pageNum, 4);
            assert.equal(pds.record[i++].pageNum, 2);
            assert.equal(pds.record.length, i);
            return Promise.all(results).then(function (values) {
                assert.equal(values[0][0], values[4][0]);
                assert.equal(values[1], values[2]);
                assert.notEqual(values[4], values[5]);
            });
        });
        it('should read ahead configed prefetchCnt', function () {
            var pds = new TestPromiseDataSource(2);
            var cpds = new buffered_data_source_1.BufferedDataSource({ dataSource: pds, prefetchCnt: 2 });
            cpds.getPage(0);
            assert.equal(pds.record.length, 3);
            assert.equal(pds.record[0].pageNum, 0);
            assert.equal(pds.record[1].pageNum, 1);
            assert.equal(pds.record[2].pageNum, 2);
        });
        it('should evict furthest row from current prefetch when evicting from cache', function () {
            var pds = new TestPromiseDataSource(2);
            var cpds = new buffered_data_source_1.BufferedDataSource({ dataSource: pds, prefetchCnt: 2, cacheSize: 3 });
            cpds.getPage(0);
            cpds.getPage(1);
            cpds.getPage(2);
            var i = 0;
            assert.equal(pds.record[0].pageNum, i++);
            assert.equal(pds.record[1].pageNum, i++);
            assert.equal(pds.record[2].pageNum, i++);
            assert.equal(pds.record[3].pageNum, i++);
            assert.equal(pds.record[4].pageNum, i++);
            assert.equal(pds.record.length, i);
        });
        it('should not try to prefetch past last page', function () {
            var pds = new TestPromiseDataSource(2, 2 * 7);
            var cpds = new buffered_data_source_1.BufferedDataSource({ dataSource: pds, prefetchCnt: 2 });
            cpds.getPage(5);
            var i = 0;
            assert.equal(pds.record[i++].pageNum, 5);
            assert.equal(pds.record[i++].pageNum, 6);
            assert.equal(pds.record.length, i);
        });
        it('should prefetch earlier pages when direction is reversed', function () {
            var pds = new TestPromiseDataSource(2);
            var cpds = new buffered_data_source_1.BufferedDataSource({ dataSource: pds, prefetchCnt: 2 });
            cpds.setDirection(-1);
            cpds.getPage(6);
            var i = 0;
            assert.equal(pds.record[i++].pageNum, 6);
            assert.equal(pds.record[i++].pageNum, 5);
            assert.equal(pds.record[i++].pageNum, 4);
            assert.equal(pds.record.length, i);
        });
        it('should not prefetch past start when direction is reversed', function () {
            var pds = new TestPromiseDataSource(2);
            var cpds = new buffered_data_source_1.BufferedDataSource({ dataSource: pds, prefetchCnt: 2 });
            cpds.setDirection(-1);
            cpds.getPage(1);
            var i = 0;
            assert.equal(pds.record[i++].pageNum, 1);
            assert.equal(pds.record[i++].pageNum, 0);
            assert.equal(pds.record.length, i);
        });
    });
});
