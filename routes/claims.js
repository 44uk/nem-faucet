const config = require('config');
const express = require('express');
const request = require('request');
const joda = require('js-joda');
const nem = require('nem-library');
const rx = require('rxjs');
const qs = require('querystring');
const _ = require('lodash');
_.mixin({ isBlank: val => _.isEmpty(val) && !_.isNumber(val) || _.isNaN(val) });

const GOOGLE_RECAPTCHA_ENDPOINT = 'https://www.google.com/recaptcha/api/siteverify';
const GOOGLE_RECAPTCHA_ENABLED = !_.isBlank(process.env.RECAPTCHA_SERVER_SECRET);
const MAX_XEM = parseInt(process.env.NEM_XEM_MAX || config.xem.max);
const MIN_XEM = parseInt(process.env.NEM_XEM_MIN || config.xem.min);
const ENOUGH_BALANCE = parseInt(process.env.ENOUGH_BALANCE || 100000000000);
const MAX_UNCONFIRMED = parseInt(process.env.MAX_UNCONFIRMED || 99);
const WAIT_HEIGHT = parseInt(process.env.WAIT_HEIGHT || 0);
const NODE_CONFIG = [{
  protocol: process.env.NIS_PROTO,
  domain: process.env.NIS_ADDR,
  port: process.env.NIS_PORT
}];
const FAUCET_ACCOUNT = nem.Account.createWithPrivateKey(process.env.NEM_PRIVATE_KEY);

const router = express.Router();
const accountHttp = new nem.AccountHttp(NODE_CONFIG);
const chainHttp = new nem.ChainHttp(NODE_CONFIG);
const transactionHttp = new nem.TransactionHttp(NODE_CONFIG);

router.post('/', async (req, res, next) => {
  const params = _.omitBy({
    address: req.body.address,
    message: req.body.message,
    encrypt: req.body.encrypt,
    mosaic:  req.body.mosaic,
    amount:  req.body.amount
  }, _.isBlank);
  const reCaptcha = req.body['g-recaptcha-response'];
  const reCaptchaUrl = reCaptchaValidationUrl(reCaptcha);

  const query = qs.stringify(params);
  const claimerAddress = new nem.Address(params.address);

  if(GOOGLE_RECAPTCHA_ENABLED) {
    const reCaptchaRes = await requestReCaptchaValidation(reCaptchaUrl).catch(_ => false);
    if(!reCaptchaRes) {
      req.flash('error', 'Failed ReCaptcha. Please try again.');
      res.redirect(`/?${query}`);
      return;
    }
  }

  const lastBlock = await chainHttp.getBlockchainLastBlock().toPromise().catch(err => err);
  const currentHeight = lastBlock.height;

  rx.Observable.forkJoin(
    accountHttp.getFromAddress(claimerAddress),
    accountHttp.getFromAddress(FAUCET_ACCOUNT.address),
    accountHttp.outgoingTransactions(FAUCET_ACCOUNT.address)
      .flatMap(_ => _)
      .filter(tx => tx.recipient.address == claimerAddress.address && currentHeight - tx.transactionInfo.height < WAIT_HEIGHT)
      .toArray(),
    accountHttp.unconfirmedTransactions(FAUCET_ACCOUNT.address)
      .flatMap(_ => _)
      .filter(tx => tx.recipient.address == claimerAddress.address)
      .toArray()
  ).flatMap(results => {
    claimerAccount = results[0];
    faucetAccount  = results[1];
    outgoings   = results[2];
    unconfirmed = results[3];

    if(claimerAccount.balance !== null && claimerAccount.balance.balance >= ENOUGH_BALANCE) {
      console.debug(`claimer balance => %d`, claimerAccount.balance.balance)
      throw new Error(`Your account already have enougth balance => (${claimerAccount.balance.balance})`);
    }

    if(outgoings.length > 0) {
      console.debug(`outgoing length => %d`, outgoings.length)
      throw new Error(`Too many claiming. Please wait ${WAIT_HEIGHT} more blocks confirmed.`);
    }

    if(unconfirmed.length > MAX_UNCONFIRMED) {
      console.debug(`unconfirmed length => %d`, unconfirmed.length)
      throw new Error(`Too many unconfirmed claiming. Please wait for ${MAX_UNCONFIRMED} confirming.`);
    }

    if(claimerAccount.balance.balance >= ENOUGH_BALANCE) {
      throw new Error(`Your account already have enougth balance => (${claimerAccount.balance.balance.toLocaleString()})`);
    }

    // left 1xem for fee
    const faucetBalance = (faucetAccount.balance.balance / 1000000) - 1;
    const txAmount = sanitizeAmount(params.amount) || Math.min(faucetBalance, randomInRange(MIN_XEM, MAX_XEM));

    const message = buildMessage(
      params.message,
      params.encrypt,
      claimerAccount.publicAccount
    );
    const transferTx = buildTransferTransaction(
      claimerAddress,
      new nem.XEM(txAmount),
      message,
      params.mosaic
    );
    const signedTx = FAUCET_ACCOUNT.signTransaction(transferTx);
    return transactionHttp.announceTransaction(signedTx);
  }).subscribe(
    nemAnnounceResult => {
      let txHash = nemAnnounceResult.transactionHash.data;
      req.flash('txHash', txHash);
      res.redirect(`/?${query}`);
    },
    err => {
      console.error(err);
      req.flash('error', err.data ? err.data.message : err.toString());
      res.redirect(`/?${query}`);
    }
  )
});

function buildMessage(message, encrypt = false, publicAccount = null) {
  if (encrypt && publicAccount === null) {
    throw new Error('Public Key required to encrypt message.');
  }
  if (encrypt) {
    return FAUCET_ACCOUNT.encryptMessage(message, publicAccount);
  } else if (_.isBlank(message)) {
    return nem.EmptyMessage;
  } else {
    return nem.PlainMessage.create(message);
  }
}

function createDelayedTimeWindow() {
  const currentTimeStamp = (new Date()).getTime() - 1000 * 30; // delay 30sec.
  const timeStampDateTime = joda.LocalDateTime.ofInstant(
    joda.Instant.ofEpochMilli(currentTimeStamp),
    joda.ZoneId.SYSTEM
  );
  const deadlineDateTime = timeStampDateTime.plus(24, joda.ChronoUnit.HOURS);
  return new nem.TimeWindow(timeStampDateTime, deadlineDateTime);
};

function buildTransferTransaction(address, transferrable, message, asMosaic = false) {
  if (asMosaic) {
    return nem.TransferTransaction.createWithMosaics(
      createDelayedTimeWindow(),
      address,
      [transferrable],
      message
    )
  } else {
    return nem.TransferTransaction.create(
      createDelayedTimeWindow(),
      address,
      transferrable,
      message
    )
  }
}

function requestReCaptchaValidation(url) {
  return new Promise((resolve, reject) => {
    request({url: url, json: true}, (err, res) => {
      if (!err && res.statusCode == 200 && res.body['success']) {
        resolve(res.body['success']);
      } else {
        reject(err);
      }
    });
  });
}

function reCaptchaValidationUrl(response) {
  let q = qs.stringify({
    secret: process.env.RECAPTCHA_SERVER_SECRET,
    response: response
  });
  return GOOGLE_RECAPTCHA_ENDPOINT + '?' + q;
}

function randomInRange(from, to) {
  return ~~(Math.random() * (from - to + 1) + to);
}

function sanitizeAmount(amount) {
  amount = parseFloat(amount);
  if(amount > MAX_XEM) {
    return MAX_XEM;
  } else if(amount < 0) {
    return 0;
  } else {
    return amount;
  }
}

module.exports = router;
