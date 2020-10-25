
var util = require('util');
var env = process.env.NODE_ENV || 'dev';

module.exports = function(err, req, res, next) {
	var status = err.status || 500;
	var response = {
		error: err.message,
		code: status, // httpStatus code is passed in code
		errorCode: err.errorCode, // app error code
		title: err.title || 'Error',
		data: err.data
	};

	util.log(util.format('[%s:%s] %s : %s', status, err.errorCode || 'ERR', err.message, req.originalUrl));
	
	if (env.toLowerCase() == 'development') {
		response.stack = err.stack.split('\n');
	}

	if (status === 500) {
		util.log(util.inspect(err.stack && err.stack.split('\n')));
	}

	res.setHeader('app-err-code', response.errorCode || '');
	res.status(status).json(response);
};
