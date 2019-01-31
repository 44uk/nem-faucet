const config = require('config');
const express = require('express');
const nem = require('nem-library');

const MAX_XEM = parseInt(process.env.NEM_XEM_MAX || config.xem.max);
const MIN_XEM = parseInt(process.env.NEM_XEM_MIN || config.xem.min);
const OPT_XEM = parseInt(
  process.env.NEM_XEM_OPT || ~~((MAX_XEM + MIN_XEM) / 2)
);
const NODE_CONFIG = [
  {
    protocol: process.env.NIS_PROTO,
    domain: process.env.NIS_ADDR,
    port: process.env.NIS_PORT
  }
];
const NODE_URL = `${NODE_CONFIG[0]['protocol']}://${NODE_CONFIG[0]['domain']}:${
  NODE_CONFIG[0]['port']
}`;
const FAUCET_ACCOUNT = nem.Account.createWithPrivateKey(
  process.env.NEM_PRIVATE_KEY
);

const router = express.Router();
const accountHttp = new nem.AccountHttp(NODE_CONFIG);

router.get('/', async (req, res, next) => {
  const address = req.query.address;
  const message = req.query.message;
  const amount = req.query.amount;
  const encrypt = req.query.encrypt;
  const mosaic = req.query.mosaic;
  accountHttp.getFromAddress(FAUCET_ACCOUNT.address).subscribe(
    accountInfo => {
      const faucetBalance = accountInfo.balance.balance;
      const drained = faucetBalance < MIN_XEM * 1000000;
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
        network: process.env.NETWORK,
        nodeUrl: NODE_URL,
        faucetAddress: FAUCET_ACCOUNT.address.pretty(),
        faucetBalance: faucetBalance / 1000000,
        recaptcha_secret: process.env.RECAPTCHA_CLIENT_SECRET
      });
    },
    err => next(err)
  );
});

module.exports = router;
