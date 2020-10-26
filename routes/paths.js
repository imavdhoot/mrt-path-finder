'use strict';

let util   = require('util')
let api    = require('../api').paths;
let ERRORS = require('../utils/errors')

let paths = {
	find: function (req, res, next) {
		let body = req.body;
		if (!body.from || !body.to) {
			return next(ERRORS.MISSING_FROM_TO)
		}

		let data = {
			from: body.from.toUpperCase(),
			to: body.to.toUpperCase()
		}

		api.find(data, function(err, routes) {
			if (err) return next(err);
			res.json({ count: routes.length, routes });
		});
	},

	json: function(req, res, next) {
		res.json(req.campaign);
	}
}

module.exports = paths;
