# NEM Faucet Application

This is nem:xem distribution application runnable on Firebase.
It is for development / testing use.


## configurations

See `functions/config/faucet.json.example`.

```
# set configuration
$ firebase functions:config:set faucet="$(cat .runtimeconfig)"

# then, check them.
$ firebase functions:config:get
```

## deploying

```
$ firebase deploy --only functions,hosting
```

