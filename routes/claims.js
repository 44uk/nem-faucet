const config = require('config');
const express = require('express');
const request = require('request');
const joda = require('js-joda');
const nem = require('nem-library');
const rx = require('rxjs');
const op = require('rxjs/operators')
const qs = require('querystring');
const _ = require('lodash');
_.mixin({ isBlank: val => _.isEmpty(val) && !_.isNumber(val) || _.isNaN(val) });

const GOOGLE_RECAPTCHA_ENDPOINT = 'https://www.google.com/recaptcha/api/siteverify';
const GOOGLE_RECAPTCHA_ENABLED = !_.isBlank(process.env.RECAPTCHA_SERVER_SECRET);
const XEM_MAX = parseInt(process.env.NEM_XEM_MAX || config.xem.max);
const XEM_MIN = parseInt(process.env.NEM_XEM_MIN || config.xem.min);
const ENOUGH_BALANCE = parseInt(process.env.ENOUGH_BALANCE || 100);
const MAX_UNCONFIRMED = parseInt(process.env.MAX_UNCONFIRMED || 99);
const WAIT_HEIGHT = parseInt(process.env.WAIT_HEIGHT || 0);
const NODE_CONFIG = [{
  protocol: process.env.NIS_PROTO,
  domain: process.env.NIS_ADDR,
  port: process.env.NIS_PORT
}];
const FAUCET_ACCOUNT = nem.Account.createWithPrivateKey(process.env.NEM_PRIVATE_KEY)

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

  rx.forkJoin([
    accountHttp.getFromAddress(claimerAddress).pipe(
      op.map(account => {
        if (account.balance.balance > ENOUGH_BALANCE * 1000000) {
          throw new Error("Your account already has enough balance.");
        }
        return account;
      }),
    ),
    accountHttp.getFromAddress(FAUCET_ACCOUNT.address).pipe(
      op.map(account => {
        if (account.balance.balance < 50000) {
          throw new Error("The faucet has been drained.");
        }
        return account;
      }),
    ),
    accountHttp.outgoingTransactions(FAUCET_ACCOUNT.address, {pageSize: 100}).pipe(
      op.mergeMap(_ => _),
      op.filter((tx) => tx.type === nem.TransactionTypes.TRANSFER),
      op.map(_ => _),
      op.filter(tx => {
        return currentHeight - tx.getTransactionInfo().height < WAIT_HEIGHT
          && tx.recipient.equals(claimerAddress)
          && ! tx.signer.address.equals(FAUCET_ACCOUNT.address);
      }),
      op.toArray(),
      op.map(txes => {
        if (txes.length > 0) { throw new Error("Too many claiming."); }
        return true;
      }),
    ),
    accountHttp.unconfirmedTransactions(FAUCET_ACCOUNT.address).pipe(
      op.mergeMap(_ => _),
      op.filter(tx => tx.type === nem.TransactionTypes.TRANSFER),
      op.map(_ => _),
      op.filter(tx => tx.recipient.equals(claimerAddress)),
      op.toArray(),
      op.map(txes => {
        if (txes.length > MAX_UNCONFIRMED) { throw new Error("Too many unconfirmed claiming."); }
        return true;
      }),
    )
  ]).pipe(
    op.mergeMap(results => {
      const claimerAccount = results[0];
      const faucetAccount  = results[1];
      const outgoings   = results[2];
      const unconfirmed = results[3];

      if (!(outgoings && unconfirmed)) {
        throw new Error("Something wrong with outgoing or unconfirmed checking.");
      }

      // left 1xem for fee
      const faucetBalance = (faucetAccount.balance.balance) - 1000000;
      const amount = sanitizeAmount(req.body.amount)
        || Math.min(faucetBalance, randomInRange(XEM_MIN, XEM_MAX, 3));

      const message = buildMessage(
        req.body.message,
        req.body.encrypt,
        claimerAccount.publicAccount
      );

      const transferTx = buildTransferTransaction(
        claimerAddress,
        nem.XEM.fromRelative(amount),
        message,
        req.body.asMosaic
      );
      const signedTx = FAUCET_ACCOUNT.signTransaction(transferTx);
      return transactionHttp.announceTransaction(signedTx);
    })
  ).subscribe(
    result => {
      const txHash = result.transactionHash.data;
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

/**
 * Create valid transaction without using NetworkTime.
 * This is work around.
 */
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
  const q = qs.stringify({
    secret: process.env.RECAPTCHA_SERVER_SECRET,
    response: response
  });
  return `${GOOGLE_RECAPTCHA_ENDPOINT}?${q}`;
}

function randomInRange(from, to) {
  return ~~(Math.random() * (from - to + 1) + to);
}

function sanitizeAmount(amount) {
  amount = parseFloat(amount);
  if(amount > XEM_MAX) {
    return XEM_MAX;
  } else if(amount < 0) {
    return 0;
  } else {
    return amount;
  }
}

module.exports = router;
