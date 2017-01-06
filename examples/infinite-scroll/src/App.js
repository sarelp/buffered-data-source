import React, {Component} from 'react';
import {BufferedDataSource} from '../../../dist/src/buffered-data-source';
import Spinner from 'react-spin';
import {Table, Column, Cell} from 'fixed-data-table';

require('fixed-data-table/dist/fixed-data-table.min.css');

const cacheSettings = {
    prefetchCnt: 2,
    cacheSize: 6
};

class RestDataSource {
    constructor(totalCntCallback) {
        this.totalCntCallback = totalCntCallback;
        this.pageSize = 16;
    }

    getPage(pageNum) {
        return fetch(`https://jsonplaceholder.typicode.com/posts?_page=${pageNum + 1}&_limit=${this.pageSize}`)
            .then(response => {
                this.totalCntCallback(+response.headers.get('x-total-count'));
                return response.json();
            });
    }
}


class Promise extends React.Component {
    constructor(props) {
        super(props);
        this.state = {loading: true};
        this.props.promise.then(v => this.setState({loading: false, value: v}))
            .catch(error => this.setState({value: 'Error ' + error, loading: false}));
    }

    render() {
        return (
            this.state.loading ? <Spinner/>
                : <div>{this.state.value}</div>
        )
    }

}

const KeyedCell = ({rowIndex, data, col, columnKey, dataSource, ...props}) => (
    <Promise key={rowIndex} promise={dataSource.getRow(rowIndex).then(r => r[columnKey])}/>
);

const RowNumCell = ({rowIndex, data, col, ...props}) => (
    <Cell>
        {rowIndex}
    </Cell>
);


export default class App extends Component {
    constructor() {
        super();
        this.dataSource = new BufferedDataSource({dataSource: new RestDataSource(cnt => this.setState({rowsCnt: cnt})), ...cacheSettings});
        this.state = {rowsCnt: 10};
    }

    setTotalCnt(totalCnt) {
        this.setState({rowsCnt: totalCnt})
    }

    shouldComponentUpdate(nextProps, nextState) {
        return nextState.rowsCnt !== this.state.rowsCnt;
    }


    render() {
        return (
            <div className='container'>
                <Table
                    rowHeight={50}
                    headerHeight={50}
                    width={800}
                    height={500}
                    rowsCount={this.state.rowsCnt}
                >
                    <Column
                        header='Row'
                        cell={<RowNumCell/>}
                        width={100}
                    />
                    <Column
                        header='Id'
                        columnKey='id'
                        cell={<KeyedCell dataSource={this.dataSource}/>}
                        width={100}
                    />
                    <Column
                        header='User Id'
                        columnKey='userId'
                        cell={<KeyedCell dataSource={this.dataSource}/>}
                        width={100}
                    />
                    <Column
                        header='Title'
                        columnKey='title'
                        cell={<KeyedCell dataSource={this.dataSource}/>}
                        width={500}
                    />

                </Table>
            </div>
        );
    }
}
