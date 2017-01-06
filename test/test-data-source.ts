import {DataSource} from '../src/buffered-data-source';
const assert = require('assert');

export interface TestDataSourceOptions {
  pageSize: number;
  totalRows: number;
}

export class TestDataSource implements DataSource<string> {
  options: TestDataSourceOptions;
  rows: string[] = [];
  deletePromises: {[key: number]: Promise<string>} = {};
  addPromises: {[key: number]: Promise<{row: string, rowNumber: number}>} = {};
  get totalRows() {
    return this.rows.length;
  }

  constructor(options: TestDataSourceOptions) {
    this.options = options;
    for (let i = 0; i < this.options.totalRows; i++) {
      this.rows.push(i.toString());
    }
    this.pageSize = options.pageSize;
  }

  getPage(pageNumber: number) {
    return Promise.resolve(this.rows.slice(pageNumber * this.options.pageSize, (pageNumber + 1) * this.options.pageSize));
  }

  pageSize: number;

  deleteRow(param: {rowNumber: number, row: string}) {
    if (!this.deletePromises[param.rowNumber]) {
      this.deletePromises[param.rowNumber] = Promise.resolve(param.row);
    }
    return this.deletePromises[param.rowNumber].then(() => {
      this.rows.splice(param.rowNumber, 1);
    });
  }

  addRow(param: {row: string}) {
    const {row} = param;
    const rowNum = Math.floor(Number(row));
    const rowPromise = this.addPromises[rowNum] || Promise.resolve({rowNumber: rowNum, row: row});
    this.rows.splice(rowNum, 0, row);
    return rowPromise;
  }

  assertAllRows(rows: number[]) {
    assert(this.rows.length, rows.length);
    rows.forEach((row, index) => assert.equal(this.rows[index], row.toString()));
  }
}

export function assertRows(dataSource: DataSource<string>, rows: number[]) {
  assert.equal(rows.length, dataSource.totalRows);
  return Promise.all(
    rows.map((row, index) =>
      dataSource.getRow(index)
      .then(r => assert.equal(r, row.toString()))
    )
  );
}