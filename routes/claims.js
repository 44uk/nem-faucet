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

router.post('/', async function(req, res, next) {
  var address = req.body.address;
  var message = req.body.message;
  var encrypt = req.body.encrypt;
  var mosaic  = req.body.mosaic;
  var amount  = sanitizeAmount(req.body.amount);
  var reCaptcha = req.body['g-recaptcha-response'];
  var reCaptchaUrl = reCaptchaValidationUrl(reCaptcha);
  var params = _.omitBy({
    address: address,
    message: message,
    encrypt: encrypt,
    mosaic:  mosaic,
    amount:  amount,
  }, _.isBlank);

  var query = qs.stringify(params);
  var sanitizedAddress = address.replace(/-/g, '');

  requestReCaptchaValidation(reCaptchaUrl).then(function(reCaptchRes) {
    return nem.com.requests.account.data(endpoint, sanitizedAddress);
  }).then(function(nisRes) {
    var common = nem.model.objects.create('common')('', process.env.NEM_PRIVATE_KEY);
    var txAmount = mosaic ? 1 : amount || randomInRange(MIN_XEM, MAX_XEM);
    var txEntity = null;

    var transferTx = nem.model.objects.create('transferTransaction')(
      sanitizedAddress,
      txAmount,
      message
    );

    if (message && encrypt) {
      transferTx.messageType = 2;
      transferTx.recipientPublicKey = nisRes['account']['publicKey'];
    }

    if(mosaic) {
      var mosaicDefinitionMetaDataPair = nem.model.objects.get('mosaicDefinitionMetaDataPair');
      var mosaicAttachment = nem.model.objects.create('mosaicAttachment')(
        'nem', 'xem',
        (amount || randomInRange(MIN_XEM, MAX_XEM)) * 1000000
      );
      transferTx.mosaics.push(mosaicAttachment);

      txEntity = nem.model.transactions.prepare('mosaicTransferTransaction')(common, transferTx, mosaicDefinitionMetaDataPair, nem.model.network.data.testnet.id);
    } else {
      txEntity = nem.model.transactions.prepare('transferTransaction')(common, transferTx, nem.model.network.data.testnet.id);
    }

    return nem.model.transactions.send(common, txEntity, endpoint);
  }).then(function(nisRes) {
    var txHash = nisRes['transactionHash']['data'];
    req.flash('txHash', txHash);
    res.redirect('/?' + query);
  }).catch(function(err) {
    // TODO: display what happened.
    console.error(err);
    req.flash('error', 'Transaction failed. Please try again.');
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
  var q = qs.stringify({
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
