import {DataSource, BufferedDataSource, Page} from '../src/buffered-data-source';
import 'mocha';
const assert = require('assert');

describe('BufferedDataSource', () => {

    describe('Reading rows from BufferedDataSource', () => {

        const data = ['row0', 'row1', 'row2', 'row3', 'row4', 'row5', 'row6'];

        class TestDataSource implements DataSource<string> {
            pageSize: number;

            constructor(pageSize: number) {
                this.pageSize = pageSize;
            }

            getPage(pageNumber: number) {
                return Promise.resolve(data.slice(this.pageSize * pageNumber, this.pageSize * (pageNumber + 1)));
            }
        }

        let ds = new TestDataSource(2);
        let cds = new BufferedDataSource({dataSource: ds});

        for (let i = 0; i < 7; i++) {
            it(`should retrieve row ${i}`, () => {
                return cds.getRow(i).then(row => assert.equal(row, 'row' + i));
            });
        }

        it('should return undefined if row is not present',
            () => cds.getRow(7).then(row => assert.equal(row, undefined))
        );
    });

    describe('Checking prefetching logic', () => {
        class TestPromiseDataSource implements DataSource<string> {
            pageSize: number;
            record: {pageNum: number, resolver: (value: string[]) => void }[] = [];
            totalRows: number;

            constructor(pageSize: number, totalRows?: number) {
                this.pageSize = pageSize;
                this.totalRows = totalRows;
            }

            getPage(pageNumber: number): Promise<string[]> {
                return new Promise(resolve => this.record.push({pageNum: pageNumber, resolver: resolve}));
            }

            resolveAll() {
                this.record.forEach(r => r.resolver(['page' + r.pageNum]));
            }
        }

        it('should not reread a cached page from the datasource', () => {
            let pds = new TestPromiseDataSource(2);
            let cpds = new BufferedDataSource({dataSource: pds, prefetchCnt: 0});
            let p1 = cpds.getPage(2);
            let p2 = cpds.getPage(2);

            let i = 0;
            assert.equal(pds.record[i++].pageNum, 2);
            assert.equal(pds.record.length, i);
            assert.equal(p1, p2);
        });

        it('should remove the oldest entry from the cache when the cache is full', () => {
            let pds = new TestPromiseDataSource(2);
            let cpds = new BufferedDataSource({dataSource: pds, prefetchCnt: 0, cacheSize: 2});
            let results: Promise<Page<string>>[] = [];
            results.push(cpds.getPage(2));
            results.push(cpds.getPage(3));
            results.push(cpds.getPage(3));
            results.push(cpds.getPage(4));
            results.push(cpds.getPage(2));

            pds.resolveAll();
            let i = 0;
            assert.equal(pds.record[i++].pageNum, 2);
            assert.equal(pds.record[i++].pageNum, 3);
            assert.equal(pds.record[i++].pageNum, 4);
            assert.equal(pds.record[i++].pageNum, 2);
            assert.equal(pds.record.length, i);
            return Promise.all(results).then(values => {
                assert.equal(values[0][0], values[4][0]);
                assert.equal(values[1], values[2]);
                assert.notEqual(values[4], values[5]);
            });
        });

        it('should read ahead configed prefetchCnt', () => {
            let pds = new TestPromiseDataSource(2);
            let cpds = new BufferedDataSource({dataSource: pds, prefetchCnt: 2});
            cpds.getPage(0);
            assert.equal(pds.record.length, 3);
            assert.equal(pds.record[0].pageNum, 0);
            assert.equal(pds.record[1].pageNum, 1);
            assert.equal(pds.record[2].pageNum, 2);
        });

        it('should evict furthest row from current prefetch when evicting from cache', () => {
            let pds = new TestPromiseDataSource(2);
            let cpds = new BufferedDataSource({dataSource: pds, prefetchCnt: 2, cacheSize: 3});
            cpds.getPage(0);
            cpds.getPage(1);
            cpds.getPage(2);
            let i = 0;

            assert.equal(pds.record[0].pageNum, i++);
            assert.equal(pds.record[1].pageNum, i++);
            assert.equal(pds.record[2].pageNum, i++);
            assert.equal(pds.record[3].pageNum, i++);
            assert.equal(pds.record[4].pageNum, i++);
            assert.equal(pds.record.length, i);
        });

        it('should not try to prefetch past last page', () => {
            let pds = new TestPromiseDataSource(2, 2 * 7);
            let cpds = new BufferedDataSource({dataSource: pds, prefetchCnt: 2});
            cpds.getPage(5);
            let i = 0;
            assert.equal(pds.record[i++].pageNum, 5);
            assert.equal(pds.record[i++].pageNum, 6);
            assert.equal(pds.record.length, i);
        });

        it('should prefetch earlier pages when direction is reversed', () => {
            let pds = new TestPromiseDataSource(2);
            let cpds = new BufferedDataSource({dataSource: pds, prefetchCnt: 2});
            cpds.setDirection(-1);

            cpds.getPage(6);

            let i = 0;
            assert.equal(pds.record[i++].pageNum, 6);
            assert.equal(pds.record[i++].pageNum, 5);
            assert.equal(pds.record[i++].pageNum, 4);
            assert.equal(pds.record.length, i);
        });
        it('should not prefetch past start when direction is reversed', () => {
            let pds = new TestPromiseDataSource(2);
            let cpds = new BufferedDataSource({dataSource: pds, prefetchCnt: 2});
            cpds.setDirection(-1);

            cpds.getPage(1);

            let i = 0;
            assert.equal(pds.record[i++].pageNum, 1);
            assert.equal(pds.record[i++].pageNum, 0);
            assert.equal(pds.record.length, i);
        });
    });
});
