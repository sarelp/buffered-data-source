"use strict";
require("mocha");
var test_data_source_1 = require("./test-data-source");
var buffered_data_source_1 = require("../src/buffered-data-source");
describe('Adding entries', function () {
    it('Should add row', function () {
        var dataSource = new test_data_source_1.TestDataSource({ pageSize: 2, totalRows: 6 });
        var bd = new buffered_data_source_1.BufferedDataSource({ dataSource: dataSource, prefetchCnt: 0, cacheSize: 6 });
        bd.getPage(0);
        bd.getPage(1);
        bd.getPage(2);
        return bd.addRow({ row: '1.1' })
            .then(function () { return test_data_source_1.assertRows(bd, [0, 1.1, 1, 2, 3, 4, 5]); });
    });
});
