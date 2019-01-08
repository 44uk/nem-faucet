<template lang="pug">
nav.navbar.is-dark
  .navbar-brand
    .navbar-item
      img(class="nem-logo" src="../assets/nem_logo.svg" width="16" height="16")
      | &ensp;&ensp;
      span(style="font-weight:bold") NEM Faucet
</template>

<style lang="stylus">
@keyframes spin {
    0% { transform: rotate(0deg) }
  100% { transform: rotate(360deg) }
}
.navbar-brand:hover .nem-logo
  animation: spin 0.25s linear infinite
</style>
