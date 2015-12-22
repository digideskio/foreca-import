import fs from 'fs'
//import util from 'util'
import path from 'path'
import dotenv from 'dotenv'
import _ from 'underscore'
import s from 'underscore.string'
import request from 'request'
import influx from 'influx'
import couchdb from 'node-couchdb'

dotenv.load()

// Helper functions
var env = (key, fallback = '') => (typeof process.env[key] !== 'undefined' ? process.env[key] : fallback)
var log = (msg, ...args) => { console.log('[' + new Date() + '] ' + msg, ...args) }
var getConfiguration = (key) => {
	// Given HOURLY_FEED_URL, this function retrieves HOURLY_FEED_COLUMNS (also parsed) and HOURLY_FEED_TYPE
	var prefix = key.replace(/_URL$/, '')
	var url = env(key)
	var columns = env(prefix + '_COLUMNS', '').split(',')
	var type = env(prefix + '_TYPE')

	if ( ! url) return { err: 'Invalid URL for ' + key }
	if ( ! columns.length) return { err: 'Invalid columns for ' + key }
	if ( ! type) return { err: 'Invalid type for ' + key }

	return { url, columns, type }
}
var obscureUrl = (url) => url.replace(/pass=[^&]*/, 'pass=***')
var parseTypes = (values) => _.map(values, (value) => {
	// Convert string to float or integer
	if ( ! value.match(/^[0-9\.]+$/)) return value
	if (value.indexOf('.') !== -1) return parseFloat(value)
	return parseInt(value)
})
var now = Date.now()

// Clients and insert function
var influxClient = influx({
	host: env('INFLUXDB_HOST', 'localhost'),
	port: env('INFLUXDB_PORT', 8086),
	protocol: env('INFLUXDB_PROTOCOL', 'http'),
	username: env('INFLUXDB_USERNAME', 'root'),
	password: env('INFLUXDB_PASSWORD', 'root'),
	database: env('INFLUXDB_DATABASE', 'foreca'),
})
var couchClient = new couchdb(env('COUCHDB_HOST', 'localhost'), env('COUCHDB_PORT', 5984))
var couchDbName = env('COUCHDB_DBNAME', 'foreca')
var insert = (items) => {
	var ids = []

	items = _.map(items, (item) => {
		// Determine id, type, and time
		var { id, type } = item
		var time = new Date(item.time)

		// Validate timestamp
		if (isNaN(time.getTime())) {
			return log('Invalid time for point %s (%s): ', id, type, item)
		}

		item.time = time

		// Add import timestamp
		item.importTime = now

		// Archive
		couchClient.insert(couchDbName, item, (err) => {
			if (err) return log('Error archiving point %s (%s): %s', id, type, err)
			// Do nothing
		})

		// Format timestamp
		item.time = item.time.getTime() // Milliseconds

		// > Convert to nanosecond string
		//   This solves a bug in InfluxDB (related to https://goo.gl/5SrKKn)
		item.time += '000000'

		// Use ID and type as tags
		delete item.id
		delete item.type

		ids.push(`${id} (${type})`)

		// Format as [values, tags]
		return [item, { id, type }]
	})

	// Insert or overwrite points
	influxClient.writePoints(env('INFLUXDB_SERIE', 'Foreca'), items, { precision: 'ns' }, (err) => {
		if (err) return log('Error inserting records: ', err)

		log('Inserted %d points for %s.', items.length, _.unique(ids).join(', '))
	})
}

// Fetch import data, parse it, and process it
_.chain(Object.keys(process.env)).filter((key) => key.match(/^[A-Z]+_FEED_URL$/)).each((key) => {
	var { err, url, columns, type } = getConfiguration(key)

	if (err) return log('Couldn\'t determine configuration for %s: %s', key, err)

	request(url, (err, res) => {
		if (err) return log('Couldn\'t import %s: %s', obscureUrl(url), err)

		// Archive raw input
		fs.writeFile(path.resolve(__dirname, '..', 'archive', `${now}.${type}.txt`), res.body)

		/**
		 * Format:
		 *
		 * <id station 1>#<val 1>;<val 2>;<val 3>#<val 1>;<val 2>;<val 3>(<#...>)\n
		 * <id station 2>#<val 1>;<val 2>;<val 3>#<val 1>;<val 2>;<val 3>(<#...>)
		 */
		_.chain(res.body.split('\n'))
			.map(s.trim)
			.filter()
			.map((line) => line.split('#'))
			.map((values) => {
				var id = values.shift()

				return _.chain(values)
					.map((item) => _.object(columns, parseTypes(item.split(/;\s*/))))
					.each((item) => {
						item.id = id
						item.type = type
					})
					.value()
			})
			//.tap(util.inspect)
			.each(insert)
	})
})
