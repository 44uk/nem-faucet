<template lang="pug">
#app
  Navbar

  main.section
    form(@submit.prevent="claim")
      .container.is-fluid
        .columns
          .column.is-8
            b-field(label="Recipient")
              b-input(v-model="form.recipient"
                required
                pattern="^T[ABCD].+"
                title="TEST_NET address start with a capital T"
                placeholder="TEST_NET address start with a capital T"
                maxlength="46"
              )
          .column.is-4
            ReCaptcha(v-model="form.recaptcha"
              :siteKey="recaptchaClientSecret"
            )

        .columns
          .column.is-8
            b-field(label="Message")
              b-input(v-model="form.message"
                maxlength="1023"
                placeholder="(Optional)"
              )
          .column.is-4
            b-field(label="Submit")
              button(type="submit" class="button is-primary is-fullwidth" :disabled="waiting")
                span CLAIM!

        .columns
          .column.is-8
            b-field(label="Amount")
              b-input(v-model.number="form.amount" type="number"
                :placeholder="amountPlaceholder"
                min="0"
                :max="xemOpt | relativeXem"
                step="0.05"
                :disabled="drained"
              )
          .column.is-4
            div(style="display:flex;height:100%")
              b-switch(v-model.boolean="form.encrypted") Encrypt message
              b-switch(v-model.boolean="form.asMosaic") Version2 (as Mosaic)

      .container.is-fluid
        .columns
          .column.is-8
            b-field(label="Faucet Address")
              b-input(:value="faucetAddress" readonly)
          .column.is-4
            b-field(label="Faucet Balance")
              b-input(:value="faucetBalance | relativeXem" readonly)

  Readme(
    :nodeUrl="nodeUrl"
    :network="network"
    :xemMin="xemMin | relativeXem"
    :xemMax="xemMax | relativeXem"
  )

  Footer
</template>

<script>
import axios from 'axios';
import qs from 'querystring'
import Navbar from './components/Navbar';
import ReCaptcha from './components/ReCaptcha';
import Readme from './components/Readme';
import Footer from './components/Footer';

const RECAPTCHA_CLIENT_SECRET = process.env.VUE_APP_RECAPTCHA_CLIENT_SECRET;

export default {
  name: "app",
  components: {
    Navbar,
    ReCaptcha,
    Readme,
    Footer
  },
  data() {
    return {
      form: {
        recipient: null,
        message: null,
        amount: null,
        encrypted: false,
        asMosaic: false,
        recaptcha: null,
      },
      recaptchaClientSecret: RECAPTCHA_CLIENT_SECRET,
      amountPlaceholder: null,
      network: null,
      nodeUrl: null,
      xemMin: null,
      xemMax: null,
      xemOpt: null,
      faucetAddress: null,
      faucetBalance: null,
      waiting: false,
      drained: false
    }
  },
  filters: {
    relativeXem(absXem) { return absXem / 1000000 }
  },
  async created() {
    const params = qs.parse(window.location.search.substring(1));
    this.form.recipient = params.recipient;
    this.form.message = params.message;
    this.form.amount = params.amount;
    this.form.encrypted = !!params.encrypted;
    this.form.asMosaic = !!params.asMosaic;
    const response = await axios.get("/faucet").catch(err => err)
    // console.log(response)
    // if (response) {
      // TODO: error handling
    // }
    const faucet = response.data;
    this.network = faucet.network;
    this.nodeUrl = faucet.nodeUrl;
    this.xemMin = faucet.xemMin,
    this.xemMax = faucet.xemMax,
    this.xemOpt = faucet.xemOpt,
    this.faucetAddress = faucet.address;
    this.faucetBalance = faucet.balance;
    this.amountPlaceholder = `(Up to ${ this.xemOpt }. Optional, if you want fixed amount)`;
  },
  methods: {
    claim() {
      const params = this.form;
      this.waiting = true;
      this.info(`Send your declaration.`);
      axios.post("/claim", params)
        .then(response => {
          this.success(`Transaction Hash: ${response.data.transactionHash}`);
        })
        .catch(err => {
          const msg = err.response.data && err.response.data.error || err.response.statusTest;
          this.failed(`Message from server: ${msg}`);
        })
        .finally(() => {
          this.waiting = false;
          window.grecaptcha.reset();
        })
      ;
    },
    info(message) {
      this.$snackbar.open({
        type: 'is-info',
        message,
        queue: false
      })
    },
    success(message) {
      this.$snackbar.open({
        type: 'is-success',
        message,
        queue: false,
        duration: 5000
      })
    },
    warning(message) {
      this.$snackbar.open({
        type: 'is-warning',
        message,
        queue: false,
        duration: 5000
      })
    },
    failed(message) {
      this.$snackbar.open({
        type: 'is-danger',
        message,
        queue: false,
        duration: 5000
      })
    }
  }
}
</script>

<style lang="sass">
@charset "utf-8";
@import "~bulma/sass/utilities/_all";
$body-family: 'Roboto','Raleway','HelveticaNeue','Helvetica Neue',Helvetica,Arial,sans-serif
$section-padding: 1.5rem 1.5rem;
@import "~bulma";
@import "~buefy/src/scss/buefy";
@import "./assets/overwrite";
</style>
