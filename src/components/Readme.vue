<template lang="pug">
section.section
  .container.is-fluid
    h3.title Readme
    ul
      li This is "{{network}}" XEM faucet connected to
        | &nbsp;
        a(:href="nodeUrl" target="_blank") {{nodeUrl}}
        | .
      li You can get XEM randomly from {{xemMin}} to {{xemMax}}.
      li This is an experimental server, the spec can be change without notice.
      li Please send back XEM when you need no longer need.
      li Good luck! NEM development!
</template>

<script>
export default {
  props: {
    nodeUrl: String,
    network: String,
    xemMin: Number,
    xemMax: Number
  }
}
</script>
