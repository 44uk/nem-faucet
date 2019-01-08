import Vue from 'vue';
import App from './App.vue';
// import Buefy from 'buefy';
import { Input } from 'buefy/src/components/input'
import { Field } from 'buefy/src/components/field'
import { Switch } from 'buefy/src/components/switch'
import { Snackbar } from 'buefy/src/components/snackbar'
// import 'buefy/dist/buefy.css';

// Vue.use(Buefy)
Vue.component('b-field', Field);
Vue.component('b-input', Input);
Vue.component('b-switch', Switch);
Vue.prototype.$snackbar = Snackbar;

Vue.config.productionTip = false;

new Vue({ render: h => h(App) }).$mount('#app')
