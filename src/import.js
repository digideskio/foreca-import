import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'
import _ from 'underscore'
import s from 'underscore.string'
import request from 'request'
import influx from 'influx'

dotenv.load()

// Helper functions
var env = (key, fallback = '') => (typeof process.env[key] !== 'undefined' ? process.env[key] : fallback)
var log = (msg, ...args) => { console.log('[' + new Date() + '] ' + msg, ...args) }
var getConfiguration = (key) => {
	var prefix = key.replace(/_URL$/, '')
	var url = env(key)
	var columns = env(prefix + '_COLUMNS', '').split(',')
	var type = env(prefix + '_TYPE')

	if ( ! url) return { err: 'Invalid URL for ' + key }
	if ( ! columns.length) return { err: 'Invalid columns for ' + key }
	if ( ! type) return { err: 'Invalid type for ' + key }

	return { url, columns, type }
}
var hasUrlAndColumns = (key) => (key.match(/_FEED_URL$/) && !! env(createColumnKey(key)))
var obscureUrl = (url) => url.replace(/pass=[^&]*/, 'pass=***')
var parseTypes = (values) => _.map(values, (value) => {
	if ( ! value.match(/^[0-9\.]+$/)) return value
	if (value.indexOf('.') !== -1) return parseFloat(value)
	return parseInt(value)
})
var now = Date.now()

// Client and insert function
var client = influx({
	host: env('INFLUXDB_HOST', 'localhost'),
	port: env('INFLUXDB_PORT', 8086),
	protocol: env('INFLUXDB_PROTOCOL', 'http'),
	username: env('INFLUXDB_USERNAME', 'root'),
	password: env('INFLUXDB_PASSWORD', 'root'),
	database: env('INFLUXDB_DATABASE', 'foreca'),
})
var insert = (items) => {
	var ids = []

	items = _.map(items, (item) => {
		// Determine timestamp
		item.time = (new Date(item.time)).getTime() || Date.now() // Milliseconds
		var offset = Math.round((item.time - now) / 1000) // Remaining seconds

		// Convert to nanosecond string
		// This solves a bug in InfluxDB (related to https://goo.gl/5SrKKn)
		item.time += '000000'

		// Add offset as nanoseconds
		// This (negligable) offset prevents overwriting other data points.
		//   And therefore allows duplicate entries.
		// Disallow negative offsets.
		//   This occurs when a measurement is added for the current day.
		//   Fix negative offset: place it between 864000 (10 days * 24 * 3600) and 999999.
		// Adding the offset does not work, only the hundreths of nanoseconds are kept.
		//   This has to do with the JavaScript Number type floating point precision.
		//   So append it as a string instead.
		var nanos = offset
		if (nanos < 1) nanos = 86400 + Math.abs(offset)
		item.time = item.time.substr(0, item.time.length - nanos.toString().length) + nanos

		// Use ID and type as tags
		var { id, type } = item
		delete item.id
		delete item.type

		ids.push(`${id} (${type})`)

		// Add import timestamp
		item.importTime = now

		// Format as [values, tags]
		return [item, { id, type }]
	})

	client.writePoints(env('INFLUXDB_SERIE', 'Foreca'), items, { precision: 'ns' }, (err, res) => {
		if (err) return log('Error inserting records: ', err)

		log('Inserted %d points for %s.', items.length, _.unique(ids).join(', '))
	})
}

// Fetch import data, parse it, and process it
_.chain(Object.keys(process.env)).filter((key) => key.match(/_URL$/)).each((key) => {
	var { err, url, columns, type } = getConfiguration(key)

	if (err) return log('Couldn\'t determine configuration for %s: %s', key, err)

	request(url, (err, res) => {
		if (err) return log('Couldn\'t import %s: %s', obscureUrl(url), err)

		fs.writeFile(path.resolve(__dirname, '..', 'archive', `${now}.${type}.txt`), res.body)

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
			//.tap(log)
			.each(insert)
	})
})
