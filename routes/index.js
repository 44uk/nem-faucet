const config = require('config');
const express = require('express');
const router = express.Router();
const nem = require('nem-sdk').default;

const endpoint = nem.model.objects.create('endpoint')(
  process.env.NIS_ADDR || nem.model.nodes.defaultTestnet,
  process.env.NIS_PORT || nem.model.nodes.defaultPort
);

const MAX_XEM = process.env.NEM_XEM_MAX || config.xem.max;
const MIN_XEM = process.env.NEM_XEM_MIN || config.xem.min;

router.get('/', function(req, res, next) {
  var address = req.query.address;
  var message = req.query.message;
  var encrypt = req.query.encrypt;
  var mosaic  = req.query.mosaic;
  var amount  = req.query.amount;

  nem.com.requests.account.data(endpoint, process.env.NEM_ADDRESS).then(function(nisRes) {
    res.render('index', {
      txHash: req.flash('txHash'),
      error: req.flash('error'),
      xemMax: MAX_XEM,
      xemMin: MIN_XEM,
      address: address,
      message: message,
      encrypt: encrypt,
      mosaic: mosaic,
      amount: amount,
      faucetAddress: nisRes['account']['address'],
      faucetBalance: nisRes['account']['balance'],
      recaptcha_secret: process.env.RECAPTCHA_CLIENT_SECRET
    });
  })
  .catch(next);
});

module.exports = router;
