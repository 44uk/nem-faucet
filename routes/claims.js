const config = require('config');
const express = require('express');
const router = express.Router();

const request = require('request');
const async = require('async');
const nem = require('nem-sdk').default;
const qs = require('querystring');
const _ = require('lodash');
_.mixin({ isBlank: val => { return _.isEmpty(val) && !_.isNumber(val) || _.isNaN(val); } });

const endpoint = nem.model.objects.create('endpoint')(
  process.env.NIS_ADDR || nem.model.nodes.defaultTestnet,
  process.env.NIS_PORT || nem.model.nodes.defaultPort
);

const GOOGLE_RECAPTCHA_ENDPOINT = 'https://www.google.com/recaptcha/api/siteverify';
const MAX_XEM = parseInt(process.env.NEM_XEM_MAX || config.xem.max);
const MIN_XEM = parseInt(process.env.NEM_XEM_MIN || config.xem.min);
const ENOUGH_BALANCE = parseInt(process.env.ENOUGH_BALANCE || 100000000);

router.post('/', async function(req, res, next) {
  let address = req.body.address;
  let message = req.body.message;
  let encrypt = req.body.encrypt;
  let mosaic  = req.body.mosaic;
  let amount  = sanitizeAmount(req.body.amount);
  let reCaptcha = req.body['g-recaptcha-response'];
  let reCaptchaUrl = reCaptchaValidationUrl(reCaptcha);
  let params = _.omitBy({
    address: address,
    message: message,
    encrypt: encrypt,
    mosaic:  mosaic,
    amount:  amount,
  }, _.isBlank);

  let query = qs.stringify(params);
  let sanitizedAddress = address.replace(/-/g, '');

  requestReCaptchaValidation(reCaptchaUrl).then(function(reCaptchRes) {
    return Promise.all([
      nem.com.requests.account.data(endpoint, process.env.NEM_ADDRESS),
      nem.com.requests.account.data(endpoint, sanitizedAddress)
      // nem.com.requests.account.transactions.outgoing(endpoint, process.env.NEM_ADDRESS, null, null)
    ]);
  }).then(function(nisReses) {
    let srcAccount = nisReses[0];
    let distAccount = nisReses[1];
    // let outgoings = nisReses[2].data;

    if(distAccount['account']['balance'] > ENOUGH_BALANCE) {
      throw new Error(`Your account seems to have enougth balance => (${distAccount['account']['balance'].toLocaleString()})`);
    }

    // outgoings.forEach((txmdp) => {
    //   let tx = txmdp.transaction;
    //   let limit = nem.utils.helpers.createNEMTimeStamp() - 43200;
    //   if(tx.recipient === sanitizedAddress && tx.timeStamp > limit) {
    //     throw new Error(`Claiming limit exeeded. Please wait 43200`);
    //   }
    // });

    // left 1xem for fee
    let faucetBalance = (srcAccount['account']['balance'] / 1000000) - 1;
    let common = nem.model.objects.create('common')('', process.env.NEM_PRIVATE_KEY);
    let txAmount = amount || Math.min(faucetBalance, randomInRange(MIN_XEM, MAX_XEM));
    let txEntity = null;

    let transferTx = nem.model.objects.create('transferTransaction')(
      sanitizedAddress,
      mosaic ? 1 : txAmount,
      message
    );

    if (message && encrypt) {
      transferTx.messageType = 2;
      transferTx.recipientPublicKey = distAccount['account']['publicKey'];
    }

    if(mosaic) {
      let mosaicDefinitionMetaDataPair = nem.model.objects.get('mosaicDefinitionMetaDataPair');
      let mosaicAttachment = nem.model.objects.create('mosaicAttachment')('nem', 'xem', txAmount * 1000000);
      transferTx.mosaics.push(mosaicAttachment);

      txEntity = nem.model.transactions.prepare('mosaicTransferTransaction')(common, transferTx, mosaicDefinitionMetaDataPair, nem.model.network.data.testnet.id);
    } else {
      txEntity = nem.model.transactions.prepare('transferTransaction')(common, transferTx, nem.model.network.data.testnet.id);
    }

    return nem.model.transactions.send(common, txEntity, endpoint);
  }).then(function(nisRes) {
    let txHash = nisRes['transactionHash']['data'];
    req.flash('txHash', txHash);
    res.redirect('/?' + query);
  }).catch(function(err) {
    console.error(err);
    // req.flash('error', 'Transaction failed. Please try again.');
    req.flash('error', err.data ? err.data.message : err.toString());
    res.redirect('/?' + query);
  });
});

function requestReCaptchaValidation(url) {
  return new Promise(function(resolve, reject)  {
    request({url: url, json: true}, function(err, res) {
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
