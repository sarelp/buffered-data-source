"use strict";
require("mocha");
var test_data_source_1 = require("./test-data-source");
var buffered_data_source_1 = require("../src/buffered-data-source");
describe('Deleting entries with cached entry ensuring cache retention', function () {
    it('Should delete row', function () {
        var dataSource = new test_data_source_1.TestDataSource({ pageSize: 2, totalRows: 6 });
        var bd = new buffered_data_source_1.BufferedDataSource({ dataSource: dataSource, prefetchCnt: 0, cacheSize: 6 });
        bd.getPage(0);
        bd.getPage(1);
        bd.getPage(2);
        return bd.deleteRow({ rowNumber: 1 })
            .then(function () { return test_data_source_1.assertRows(bd, [0, 2, 3, 4, 5]); });
    });
});
describe('Deleting entries with cached entry', function () {
    it('Should delete row', function () {
        var dataSource = new test_data_source_1.TestDataSource({ pageSize: 2, totalRows: 5 });
        var bd = new buffered_data_source_1.BufferedDataSource({ dataSource: dataSource, prefetchCnt: 0 });
        bd.getPage(0);
        bd.getPage(1);
        return bd.deleteRow({ rowNumber: 2 }).then(function () { return dataSource.assertAllRows([0, 1, 3, 4]); }).then(function () { return test_data_source_1.assertRows(bd, [0, 1, 3, 4]); });
    });
});
describe('Deleting entries with nothing in cache', function () {
    it('Should delete row', function () {
        var dataSource = new test_data_source_1.TestDataSource({ pageSize: 2, totalRows: 5 });
        var bd = new buffered_data_source_1.BufferedDataSource({ dataSource: dataSource, prefetchCnt: 0 });
        return bd.deleteRow({ rowNumber: 2 }).then(function () { return dataSource.assertAllRows([0, 1, 3, 4]); }).then(function () { return test_data_source_1.assertRows(bd, [0, 1, 3, 4]); });
    });
});
