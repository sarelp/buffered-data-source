# buffered-data-source

buffered-data-source is a buffering (caching) layer for pageable datasources e.g. rest endpoints.

The implementation is written in typescript but can be used in any javascript project. It targets
es6.

Features:

- Caching of fetched rows
- Prefetching of data
- Support for inserting and deleting rows

## how to use

A datasource needs to be implemented to access the desired data end point. The BufferedDataSource then
provides the buffering/caching for the provided DataSource.

## Example

An [example react application](examples/infinite-scroll) is provided doing infinite scrolling.