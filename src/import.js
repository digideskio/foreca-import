import fs from 'fs'
import path from 'path'
import _ from 'underscore'
import s from 'underscore.string'
import request from 'request'
import mysql from 'mysql'
import parallel from 'node-parallel'

// Configuration
var timeout = 60 * 1000 // milliseconds

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

// Client and insert function
var client = mysql.createConnection({
	host: 'mariadb',
	user: env('MYSQL_USER'),
	password: env('MYSQL_PASSWORD'),
	database: env('MYSQL_FORECAST_DATABASE')
})
var insert = (items, done) => {
	var table = `${items[0].type}_${items[0].id}`
	var failed = 0
	var p = parallel()

	log('Processing %d items for %s..', items.length, table)

	_.each(items, (item) => {
		p.add((done) => {
			if (item.type === 'hourly') item.timestamp += 'Z'
			var timestamp = new Date(item.timestamp).getTime() / 1000
			delete item.timestamp

			delete item.type
			delete item.id

			var query = 'REPLACE INTO ?? SET ?, `timestamp` = FROM_UNIXTIME(?)'

			client.query(query, [table, item, timestamp], (err) => {
				if (err) {
					log('Error:', err)
					failed += 1
				}

				done()
			})
		})
	})

	p.done(() => {
		log('Done processing %s (%d failures).', table, failed)
		done()
	})
}

// Fetch import data, parse it, and process it
var p = parallel().timeout(timeout)

_.chain(Object.keys(process.env)).filter((key) => key.match(/^[A-Z]+_FEED_URL$/)).each((key) => {
	var { err, url, columns, type } = getConfiguration(key)

	if (err) return log('Couldn\'t determine configuration for %s: %s', key, err)

	p.add((done) => {
		request(url, (err, res) => {
			if (err) return log('Couldn\'t import %s: %s', obscureUrl(url), err)

			// Archive raw input
			fs.writeFile(path.resolve(__dirname, '..', 'archive', `${now}.${type}.csv`), res.body)

			/**
			 * Format:
			 *
			 * <id station 1>#<val 1>;<val 2>;<val 3>#<val 1>;<val 2>;<val 3>(<#...>)\n
			 * <id station 2>#<val 1>;<val 2>;<val 3>#<val 1>;<val 2>;<val 3>(<#...>)
			 */
			var p = parallel()

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
				.each((items) => {
					p.add((done) => { insert(items, done) })
				})

			p.done(done)
		})
	})
})

p.done((err) => {
	// Disconnect client
	client.destroy()

	if (err) return log('Error:', err)

	log('Done.')
})
