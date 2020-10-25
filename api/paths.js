const moment = require('moment')
const csv    = require('csv-parser');
const fs     = require('fs');
const util   = require('util')

const consts = require('./constants')

let LINES    = {}
let STATIONS = {}
let STATION_NAMES = {}
let INTERCHANGES = {}

module.exports = {
	init: function init() {
		// reaading from CSV file
		fs.createReadStream(consts.stationsFile)
		.pipe(csv())
		.on('data', (row) => {
			let station = row['Station Code']
			let stationName = (row['Station Name'] || '').toUpperCase()
			let stationDate = moment(row['Opening Date'])
			if (!station) {
				util.log('[init]Station code missing %j', row);
			} else if (moment() < stationDate) {
				util.log('[init]Station not opened yet', row);
			} else {

				let line = station.slice(0,2)
				if (!LINES[line]) {
					LINES[line] = []
				}
				if (!LINES[line].includes(station)) {
					LINES[line].push(station)
					STATIONS[station] = {
						name: stationName,
						opening: row['Opening Date']
					}

					if (!STATION_NAMES[stationName]) {
						STATION_NAMES[stationName] = []
					}

					// handling interchange stations
					if (STATION_NAMES[stationName].length) {
						let oldStation = STATION_NAMES[stationName]
						let oldLine = oldStation.slice(0,2)
						if (!INTERCHANGES[oldLine]) {
							INTERCHANGES[oldLine] = []
						}
						INTERCHANGES[oldLine].push(oldStation)

						if (!INTERCHANGES[line]) {
							INTERCHANGES[line] = []
						}
						INTERCHANGES[line].push(station) 

					}
					STATION_NAMES[stationName].push(station)
				} else {
					util.log('[init]duplicate Station code %j', station);
				}
			}
		})
		.on('end', () => {
			// sorting the line stations accorindg to station Codes
			Object.keys(LINES).forEach(lineCode => {
				LINES[lineCode].sort((a, b)=> {
					let aNumber = parseInt(a.slice(2))
					let bNumber = parseInt(b.slice(2))
					return aNumber - bNumber
				})
			})
			// console.log('#### sorted LINES %j', LINES)
			// console.log('####  stations %j', STATIONS)
			console.log('####  station Names %j', STATION_NAMES)
			// console.log('#### INTERCHANGES %j', INTERCHANGES)
			util.log('Initilized the STATIONS & LINES');
		});
	},

	find: function(data, cb) {

		if (!STATION_NAMES[data.from]) {
			return cb({message: 'invalid Source station', status: 400})
		}
		if (!STATION_NAMES[data.to]) {
			return cb({message: 'invalid Destination station', status: 400})
		}

		let routes = getRoutes(data.from, data.to)

		return cb(null, routes)
	}
}


function getRoutes(src, dest) {
	let onSameLine = false
	let line, routes = []
	let srcStations = STATION_NAMES[src]
	let destStations = STATION_NAMES[dest]

	destStations.forEach(ds => {
		let destLine = ds.slice(0,2)

		let sameLine = srcStations.some( sc => LINES[destLine].includes(sc))

		if (sameLine) {
			onSameLine = true
			line = destLine
			routes.push({
				line: line,
				from: src,
				fromName: src,
				to: dest,
				toName: dest,
			})
		}
	})


	// src and dst are on same line
	if (onSameLine) {
		return routes
	}

	// src and dst are may on different lines


}