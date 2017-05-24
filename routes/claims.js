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
  var address = req.body.address
  var message = req.body.message
  var encrypt = req.body.encrypt
  var recaptcha = req.body['g-recaptcha-response']

  var common = nem.model.objects.create('common')('', process.env.NEM_PRIVATE_KEY);
  var transferTx = nem.model.objects.create('transferTransaction')(
    address,
    randomInRange(config.xem.min, config.xem.max),
    message
  );
  var txEntity = nem.model.transactions.prepare('transferTransaction')(
    common,
    transferTx,
    nem.model.network.data.testnet.id
  );

  var params = _.omitBy({ address: address, message: message }, _.isEmpty);
  var query  = qs.stringify(params);

  request({url: reCaptchaValidationUrl(recaptcha), json: true}, function(err, reCaptchaRes) {
    if (!err && reCaptchaRes.statusCode == 200 && reCaptchaRes.body['success']) {
      nem.model.transactions.send(common, txEntity, endpoint).then(function(nisRes) {
        var txHash = nisRes['transactionHash']['data'];
        req.flash('txHash', txHash);
        res.redirect('/?' + query);
      }).catch(function(err) {
        // TODO: display what happened.
        // console.log(err)
        req.flash('error', 'Transaction failed. Please try again.');
        res.redirect('/?' + query);
      });
    } else {
      req.flash('error', 'Failed to pass ReCaptcha. Please try again.');
      res.redirect('/?' + query);
    }
  });

  // TODO: message encryption
  // if (encrypt) {
  //   transferTx.encryptMessage = true;
  //   transferTx.recipientPubKey = fetchPubKeyByAddress(address);
  // }
});

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

function fetchPubKeyByAddress(address) {
  var nisRes = nem.com.requests.account.data(endpoint, address);
  return nisRes['account']['publicKey'];
}

module.exports = router;
