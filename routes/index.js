const config = require('config');
const express = require('express');
const router = express.Router();
const nem = require('nem-sdk').default;

const MAX_XEM = parseInt(process.env.NEM_XEM_MAX || config.xem.max);
const MIN_XEM = parseInt(process.env.NEM_XEM_MIN || config.xem.min);
const OPT_XEM = parseInt(process.env.NEM_XEM_OPT || ~~((MAX_XEM + MIN_XEM) / 2));
const NETWORK = (process.env.NETWORK || 'testnet');

const endpoint = nem.model.objects.create('endpoint')(
  process.env.NIS_ADDR || nem.model.nodes.defaultTestnet,
  process.env.NIS_PORT || nem.model.nodes.defaultPort
);

router.get('/', (req, res, next) => {
  let address = req.query.address;
  let message = req.query.message;
  let encrypt = req.query.encrypt;
  let mosaic  = req.query.mosaic;
  let amount  = req.query.amount;
  let drained = false;

  nem.com.requests.account.data(endpoint, process.env.NEM_ADDRESS).then(function(nisRes) {
    drained = nisRes['account']['balance'] < MIN_XEM * 1000000;

    res.render('index', {
      txHash: req.flash('txHash'),
      error: req.flash('error'),
      xemMax: MAX_XEM,
      xemMin: MIN_XEM,
      xemOpt: OPT_XEM,
      address: address,
      message: message,
      encrypt: encrypt,
      mosaic: mosaic,
      amount: amount,
      drained: drained,
      faucetAddress: nisRes['account']['address'],
      faucetBalance: nisRes['account']['balance'],
      recaptcha_secret: process.env.RECAPTCHA_CLIENT_SECRET
    });
  })
  .catch(next);
});

module.exports = router;
