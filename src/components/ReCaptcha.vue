<template lang="pug">
  .g-recaptcha(
    :data-sitekey="siteKey"
    data-callback="__g_recaptcha__callback"
    data-expired-callback="__g_recaptcha__expired_callback"
    data-error-callback="__g_recaptcha__error_callback"
  )
</template>

<script>
export default {
  props: {
    siteKey: String,
    recaptcha: String
  },
  created() {
    window.__g_recaptcha__callback = (arg) => this.onSuccess(arg)
    window.__g_recaptcha__expired_callback = (arg) => this.onExpired(arg)
  },
  methods: {
    onSuccess(code) { this.$emit("input", code) },
    onExpired() { this.$emit("input", null) }
  }
}
</script>
