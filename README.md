# :potable_water: NEM Faucet

## :heartbeat: Demo

* [NEM Testnet Faucet - You can get Testnet XEM for development / testing.](http://test-nem-faucet.44uk.net)


## :sparkles: Deploy to Heroku

[![Deploy](https://www.herokucdn.com/deploy/button.svg)](https://heroku.com/deploy)

Need to set `NEM_PRIVATE_KEY`(PrivateKey of your faucet account) while deployment.

If you want to use ReCaptcha, set both variables `RECAPTCHA_CLIENT_SECRET` and `RECAPTCHA_SERVER_SECRET`.


## :fire: Setup

```shell
# Set these env variables
# See `.env.sample`
#  COOKIE_SECRET
#  PORT
#  NETWORK
#  NIS_PROTO
#  NIS_ADDR
#  NIS_PORT
#  NEM_PRIVATE_KEY
#  NEM_XEM_MAX
#  NEM_XEM_MIN
#  NEM_XEM_OPT
#  ENOUGH_BALANCE
#  MAX_UNCONFIRMED
#  WAIT_HEIGHT
#  RECAPTCHA_CLIENT_SECRET
#  RECAPTCHA_SERVER_SECRET

# install packages
$ npm install

# start app
$ npm start

# or for development
$ npm run dev
```


## :muscle: Powered by

* [NEM - Distributed Ledger Technology (Blockchain)](https://www.nem.io/)
* [aleixmorgadas/nem\-library\-ts: NEM Library Official Repository](https://github.com/aleixmorgadas/nem-library-ts)
* [Express - Fast, unopinionated, minimalist web framework for node.](https://github.com/expressjs/express)
* [Beauter - A simple framework for faster and beautiful responsive sites](http://beauter.outboxcraft.com/)

