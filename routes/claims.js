const config = require('config');
const express = require('express');
const router = express.Router();

const request = require('request');
const async = require('async');
const nem = require('nem-sdk').default;
const qs = require('querystring');
const _ = require('lodash');

const endpoint = nem.model.objects.create('endpoint')(
  nem.model.nodes.defaultTestnet,
  nem.model.nodes.defaultPort
);

const GOOGLE_RECAPTCHA_ENDPOINT = 'https://www.google.com/recaptcha/api/siteverify'

router.post('/', async function(req, res, next) {
  var address = req.body.address;
  var message = req.body.message;
  var encrypt = req.body.encrypt;
  var reCaptcha = req.body['g-recaptcha-response'];
  var reCaptchaUrl = reCaptchaValidationUrl(reCaptcha);
  var params = _.omitBy({
    address: address,
    message: message,
    encrypt: encrypt
  }, _.isEmpty);
  var query  = qs.stringify(params);
  var sanitized_address = address.replace(/-/g, '');

  requestReCaptchaValidation(reCaptchaUrl).then(function(reCaptchRes) {
    return nem.com.requests.account.data(endpoint, sanitized_address);
  }).then(function(nisRes) {
    var common = nem.model.objects.create('common')('', process.env.NEM_PRIVATE_KEY);
    var transferTx = nem.model.objects.create('transferTransaction')(
      sanitized_address,
      randomInRange(config.xem.min, config.xem.max),
      message
    );

    if (encrypt) {
      transferTx.encryptMessage = true;
      transferTx.recipientPubKey = nisRes['account']['publicKey'];
    }

    var txEntity = nem.model.transactions.prepare('transferTransaction')(
      common,
      transferTx,
      nem.model.network.data.testnet.id
    );

    return nem.model.transactions.send(common, txEntity, endpoint);
  }).then(function(nisRes) {
    var txHash = nisRes['transactionHash']['data'];
    req.flash('txHash', txHash);
    res.redirect('/?' + query);
  }).catch(function(err) {
    // TODO: display what happened.
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

module.exports = router;
