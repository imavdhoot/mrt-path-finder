const moment = require('moment')
const csv    = require('csv-parser');
const fs     = require('fs');
const util   = require('util')

const consts = require('./constants')
const ERRORS = require('../utils/errors')

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
				util.log('[init]Station not opened yet >>> %j', row);
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
						let oldStations = STATION_NAMES[stationName]

						oldStations.forEach(ot => {
							let oldLine = ot.slice(0,2)
							if (!INTERCHANGES[oldLine]) {
								INTERCHANGES[oldLine] = []
							}
							INTERCHANGES[oldLine].push(ot)
						})

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
			// console.log('####  station Names %j', STATION_NAMES)
			// console.log('#### INTERCHANGES %j', INTERCHANGES)
			util.log('Initilized the STATIONS & LINES');
		});
	},

	find: function(data, cb) {

		// validation
		if (!STATION_NAMES[data.from]) {
			return cb(ERRORS.SRC_INVALID)
		}
		if (!STATION_NAMES[data.to]) {
			return cb(ERRORS.DEST_INVALID)
		}
		util.log(`[api:find] trying to find route origin FROM:: ${data.from} origin TO:: ${data.to}`)
		let routes = getRoutes(data.from, data.to, [], [])
		
		// no routes found
		if (!routes.length) {
			return cb(ERRORS.NO_ROUTES)
		}

		util.log(`[api:find] ORIGIN from ${data.from} ORIGIN to ${data.to} total possible routes found: ${routes.length}`)
		
		// re-order and select best routes
		let orderedRoutes = orderRoutes(routes)

		// explain the route steps
		let explainedRoutes = explainRoutes(orderedRoutes, data.from, data.to)
		
		// return back the response
		return cb(null, explainedRoutes)
	}
}


function getRoutes(src, dest, routes, visitedLines) {
	let line
	let onSameLine = false
	let srcStations = STATION_NAMES[src]
	let destStations = STATION_NAMES[dest]

	srcStations = srcStations.filter(sc => !visitedLines.includes(sc.slice(0,2)))

	util.log(`[getRoutes] trying to find from:: ${src} to:: ${dest}`)
	destStations.forEach(ds => {
		let destLine = ds.slice(0,2)

		let sameLine = srcStations.some( sc => LINES[destLine].includes(sc))

		if (sameLine) {
			onSameLine = true
			let srcSt = srcStations.find(sc => sc.indexOf(destLine) !== -1)
			let destSt = destStations.find(dc => dc.indexOf(destLine) !== -1)

			let newRoute = []
			newRoute.push({
				line: destLine,
				from: srcSt,
				fromName: src,
				to: destSt,
				toName: dest,
				stops: Math.abs(LINES[destLine].indexOf(srcSt) - LINES[destLine].indexOf(destSt))
			})

			routes.push(newRoute)
		}
	})


	// src and dst are on same line
	if (onSameLine) {
		return routes
	}

	util.log(`[getRoutes] ${dest}::${destStations} not on this line of ${src}. fetching from connected lines`)

	for (const sc of srcStations) {
		let srcLine = sc.slice(0,2)
		let interStations = INTERCHANGES[srcLine]

		if (interStations.length) {
			interStations = interStations.sort((a, b) => {
				let scId = sc.slice(2)
				let aId = parseInt(a.slice(2))
				let bId = parseInt(b.slice(2))
				return (Math.abs(scId - aId) - Math.abs(scId - bId))
			}).filter(it => STATIONS[sc].name !== STATIONS[it].name)

			for (const intSt of interStations) {
				util.log(`[getRoutes] trying from interchange ${STATIONS[intSt].name}::${intSt}`)
				let intStop = {
					line: srcLine,
					from: sc,
					fromName: STATIONS[sc].name,
					to: intSt,
					toName: STATIONS[intSt].name,
					stops: Math.abs(LINES[srcLine].indexOf(sc) - LINES[srcLine].indexOf(intSt))
				}

				let interRoutes = []

				let interLines = [].concat(visitedLines)
				if (!interLines.includes(srcLine))	interLines.push(srcLine)

				visitedLines.push(srcLine)
				let fetchedRoutes = getRoutes(STATIONS[intSt].name, dest, [], interLines)
				if (fetchedRoutes && fetchedRoutes.length)	{

					fetchedRoutes.forEach(fr => {
						let foundRoute = [intStop].concat(fr)
						routes.push([...foundRoute])
					})
				}

			}

		}
	}

	return routes.length ? routes : undefined
}

function routeReducer(acc, value) {
	return acc + value.stops
}


function orderRoutes(routes) {
	routes.sort((a, b) => {
		let weightA = a.reduce(routeReducer, 0)
		let weightB = b.reduce(routeReducer, 0)
		return weightA - weightB
	})
	return routes.slice(0, consts.ROUTE_SELECT)
}

function explainRoutes(routes, src, dest) {

	let exr = []
	routes.forEach(route => {
		let er = {
			title: `Route from ${src} to ${dest}`,
			stops: route.reduce(routeReducer, 0),
			steps: [],
			meta: JSON.stringify(route)
		}

		let steps = []
		route.forEach((step, idx) => {
			// changing lines at interchange
			let lastStep = route[idx - 1]
			if (lastStep && lastStep.toName == step.fromName) {
				steps.push(`change from ${lastStep.line} line to ${step.line} line at ${step.fromName}`)
			}

			let text = `take ${step.line} line from ${step.fromName} towards ${step.toName}`
			steps.push(text)
			steps.push(`ride ${step.stops} stops on ${step.line} line to reach ${step.toName}`)
			
		})

		er.steps = steps
		exr.push(er)
	})
	return exr
}