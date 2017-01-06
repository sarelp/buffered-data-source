import 'mocha';
import {TestDataSource, assertRows} from './test-data-source';
import {BufferedDataSource} from '../src/buffered-data-source';

describe('Adding entries', () => {
  it('Should add row', () => {
    const dataSource = new TestDataSource({pageSize: 2, totalRows: 6});
    const bd = new BufferedDataSource({dataSource: dataSource, prefetchCnt: 0, cacheSize: 6});
    bd.getPage(0);
    bd.getPage(1);
    bd.getPage(2);
    return bd.addRow({row: '1.1'})
      .then(
        () => assertRows(bd, [0, 1.1, 1, 2, 3, 4, 5])
      );
  });
});
