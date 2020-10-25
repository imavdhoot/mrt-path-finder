let express = require('express');
let router  = express.Router();
let error   = require('./error');
let paths   = require('./paths');

/* GET home page. */
router.get('/', function(req, res, next) {
	res.render('index', { title: 'Express' });
});


router.get('/path', paths.find, error);

module.exports = router;
