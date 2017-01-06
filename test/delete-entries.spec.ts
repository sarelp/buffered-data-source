import 'mocha';
import {TestDataSource, assertRows} from './test-data-source';
import {BufferedDataSource} from '../src/buffered-data-source';

describe('Deleting entries with cached entry ensuring cache retention', () => {
  it('Should delete row', () => {
    const dataSource = new TestDataSource({pageSize: 2, totalRows: 6});
    const bd = new BufferedDataSource({dataSource: dataSource, prefetchCnt: 0, cacheSize: 6});
    bd.getPage(0);
    bd.getPage(1);
    bd.getPage(2);
    return bd.deleteRow({rowNumber: 1})
      .then(
      () => assertRows(bd, [0, 2, 3, 4, 5])
    );
  });
});

describe('Deleting entries with cached entry', () => {
  it('Should delete row', () => {
    const dataSource = new TestDataSource({pageSize: 2, totalRows: 5});
    const bd = new BufferedDataSource({dataSource: dataSource, prefetchCnt: 0});
    bd.getPage(0);
    bd.getPage(1);
    return bd.deleteRow({rowNumber: 2}).then(
      () => dataSource.assertAllRows([0, 1, 3, 4])
    ).then(
      () => assertRows(bd, [0, 1, 3, 4])
    );
  });
});

describe('Deleting entries with nothing in cache', () => {
  it('Should delete row', () => {
      const dataSource = new TestDataSource({pageSize: 2, totalRows: 5});
      const bd = new BufferedDataSource({dataSource: dataSource, prefetchCnt: 0});
      return bd.deleteRow({rowNumber: 2}).then(
        () => dataSource.assertAllRows([0, 1, 3, 4])
      ).then(
        () => assertRows(bd, [0, 1, 3, 4])
      );
  });
});