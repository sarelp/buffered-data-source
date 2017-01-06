"use strict";
var assert = require('assert');
var TestDataSource = (function () {
    function TestDataSource(options) {
        this.rows = [];
        this.deletePromises = {};
        this.addPromises = {};
        this.options = options;
        for (var i = 0; i < this.options.totalRows; i++) {
            this.rows.push(i.toString());
        }
        this.pageSize = options.pageSize;
    }
    Object.defineProperty(TestDataSource.prototype, "totalRows", {
        get: function () {
            return this.rows.length;
        },
        enumerable: true,
        configurable: true
    });
    TestDataSource.prototype.getPage = function (pageNumber) {
        return Promise.resolve(this.rows.slice(pageNumber * this.options.pageSize, (pageNumber + 1) * this.options.pageSize));
    };
    TestDataSource.prototype.deleteRow = function (param) {
        var _this = this;
        if (!this.deletePromises[param.rowNumber]) {
            this.deletePromises[param.rowNumber] = Promise.resolve(param.row);
        }
        return this.deletePromises[param.rowNumber].then(function () {
            _this.rows.splice(param.rowNumber, 1);
        });
    };
    TestDataSource.prototype.addRow = function (param) {
        var row = param.row;
        var rowNum = Math.floor(Number(row));
        var rowPromise = this.addPromises[rowNum] || Promise.resolve({ rowNumber: rowNum, row: row });
        this.rows.splice(rowNum, 0, row);
        return rowPromise;
    };
    TestDataSource.prototype.assertAllRows = function (rows) {
        var _this = this;
        assert(this.rows.length, rows.length);
        rows.forEach(function (row, index) { return assert.equal(_this.rows[index], row.toString()); });
    };
    return TestDataSource;
}());
exports.TestDataSource = TestDataSource;
function assertRows(dataSource, rows) {
    assert.equal(rows.length, dataSource.totalRows);
    return Promise.all(rows.map(function (row, index) {
        return dataSource.getRow(index)
            .then(function (r) { return assert.equal(r, row.toString()); });
    }));
}
exports.assertRows = assertRows;
