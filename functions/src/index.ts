import axios from "axios";
import * as functions from "firebase-functions";
import * as Joda from "js-joda";
import {
  Account,
  AccountHttp,
  Address,
  ChainHttp,
  EmptyMessage,
  NemAnnounceResult,
  NEMLibrary,
  NetworkTypes,
  PlainMessage,
  TimeWindow,
  TransactionHttp,
  TransactionTypes,
  TransferTransaction,
  XEM
} from "nem-library";
import * as qs from "querystring";
import {
  forkJoin,
} from "rxjs";
import {
  filter,
  map,
  mergeMap,
  toArray,
} from "rxjs/operators";

const CONFIG = functions.config().faucet;
const XEM_MIN = parseInt(CONFIG.xemMin, 10) || 10000000;
const XEM_MAX = parseInt(CONFIG.xemMax, 10) || 50000000;
const XEM_OPT = parseInt(CONFIG.xemOpt, 10) || 25000000;
const ENOUGH_BALANCE = parseInt(CONFIG.enoughBalance, 10) || 100000000000;
const MAX_UNCONFIRMED = parseInt(CONFIG.maxUnconfirmed, 10) || 99;
const WAIT_HEIGHT = parseInt(CONFIG.waitHeight, 10) || 0;
const RECAPTCHA_SERVER_SECRET = CONFIG.recaptchaServerSecret;
const GOOGLE_RECAPTCHA_ENABLED = !!RECAPTCHA_SERVER_SECRET;
const GOOGLE_RECAPTCHA_ENDPOINT = "https://www.google.com/recaptcha/api/siteverify";
const NETWORK: keyof NetworkTypes = CONFIG.network;
const NODE_CONFIG = [{
  domain:   CONFIG.nisAddr,
  port:     CONFIG.nisPort,
  protocol: CONFIG.nisProto
}];
NEMLibrary.bootstrap(NetworkTypes[NETWORK]);
const FAUCET_ACCOUNT = Account.createWithPrivateKey(CONFIG.privateKey);

const chainHttp = new ChainHttp(NODE_CONFIG);
const accountHttp = new AccountHttp(NODE_CONFIG);
const transactionHttp = new TransactionHttp(NODE_CONFIG);

// const filterHost = (req: functions.Request, res: functions.Response) => {
//   if (req.headers.host.indexOf("YOUR_HOST") > -1) {
//     res.status(403).json({error: "Call from invalid host."});
//     return;
//   }
// };

export const faucet = functions.https.onRequest((req: functions.Request, res: functions.Response) => {
  accountHttp.getFromAddress(FAUCET_ACCOUNT.address).subscribe(
    ((accountInfo) => {
      const publicAccount = accountInfo.publicAccount;
      res.json({
        address: publicAccount.address.plain(),
        balance: accountInfo.balance.balance,
        network: NETWORK,
        nodeUrl: `${NODE_CONFIG[0].protocol}://${NODE_CONFIG[0].domain}:${NODE_CONFIG[0].port}`,
        // publicKey: publicAccount.publicKey,
        xemMax: XEM_MAX,
        xemMin: XEM_MIN,
        xemOpt: XEM_OPT
      });
    }),
    (err) => {
      res.json({ error: err.message });
    }
  );
});

const buildMessage = (message = "", encrypt = false, publicAccount = null) => {
  if (encrypt && publicAccount === null) {
    throw new Error("PublicKey required to encrypt message.");
  }
  if (encrypt) {
    return FAUCET_ACCOUNT.encryptMessage(message, publicAccount);
  } else if (message.length > 0) {
    return PlainMessage.create(message);
  } else {
    return EmptyMessage;
  }
};

const createDelayedTimeWindow = () => {
  const currentTimeStamp = (new Date()).getTime() - 1000 * 30; // delay 30sec.
  const timeStampDateTime = Joda.LocalDateTime.ofInstant(
    Joda.Instant.ofEpochMilli(currentTimeStamp),
    Joda.ZoneId.SYSTEM
  );
  const deadlineDateTime = timeStampDateTime.plus(24, Joda.ChronoUnit.HOURS);
  return new TimeWindow(timeStampDateTime, deadlineDateTime);
};

const buildTransferTransaction = (address, transferrable, message, asMosaic = false) => {
  if (asMosaic) {
    return TransferTransaction.createWithAssets(
      createDelayedTimeWindow(),
      address,
      [transferrable],
      message
    );
  } else {
    return TransferTransaction.create(
      createDelayedTimeWindow(),
      address,
      transferrable,
      message
    );
  }
};

const requestReCaptchaValidation = async (url: string) => {
  const result = await axios.get(url).catch((_) => _);
  return result.status === 200 && result.data.success;
};

const reCaptchaValidationUrl = (response) => {
  const q = qs.stringify({
    response,
    secret: RECAPTCHA_SERVER_SECRET
  });
  return GOOGLE_RECAPTCHA_ENDPOINT + "?" + q;
};

const randomInRange = (from: number, to: number, base?: number) => {
  const value = ~~(Math.random() * (from - to + 1) + to);
  return base ? Math.round(value / 10 ** base) * 10 ** base : value;
};

const sanitizeAmount = (param: string) => {
  const amount = parseFloat(param) * 1000000;
  if (amount > XEM_MAX) {
    return XEM_MAX;
  } else if (amount < 0) {
    return 0;
  } else {
    return amount;
  }
};

export const claim = functions.https.onRequest(async (req: functions.Request, res: functions.Response) => {
  if (req.method !== "POST") {
    res.status(400).json({error: "Only allowed POST method."});
    return;
  }

  if (GOOGLE_RECAPTCHA_ENABLED) {
    const reCaptchaUrl = reCaptchaValidationUrl(req.body.recaptcha);
    const reCaptchaRes = await requestReCaptchaValidation(reCaptchaUrl).catch((_) => false);
    if (! reCaptchaRes) {
      res.status(400).json({error: "Failed reCaptcha."});
      return;
    }
  }

  const claimerAddress = new Address(req.body.recipient);
  const lastBlock = await chainHttp.getBlockchainLastBlock().toPromise().catch((err) => err);
  const currentHeight = lastBlock.height;
  forkJoin([
    accountHttp.getFromAddress(claimerAddress).pipe(
      map((account) => {
        if (account.balance.balance > ENOUGH_BALANCE) {
          throw new Error("Your account already has enough balance.");
        }
        return account;
      }),
    ),
    accountHttp.getFromAddress(FAUCET_ACCOUNT.address).pipe(
      map((account) => {
        if (account.balance.balance < 50000) {
          throw new Error("The faucet has been drained.");
        }
        return account;
      }),
    ),
    accountHttp.outgoingTransactions(FAUCET_ACCOUNT.address, {pageSize: 100}).pipe(
      mergeMap((_) => _),
      filter((tx) => tx.type === TransactionTypes.TRANSFER),
      map((_) => _ as TransferTransaction),
      filter((tx) => {
        return currentHeight - tx.getTransactionInfo().height < WAIT_HEIGHT
          && tx.recipient.equals(claimerAddress)
          && ! tx.signer.address.equals(FAUCET_ACCOUNT.address);
      }),
      toArray(),
      map((txes) => {
        if (txes.length > 0) { throw new Error("Too many claiming."); }
        return true;
      }),
    ),
    accountHttp.unconfirmedTransactions(FAUCET_ACCOUNT.address).pipe(
      mergeMap((_) => _),
      filter((tx) => tx.type === TransactionTypes.TRANSFER),
      map((_) => _ as TransferTransaction),
      filter((tx) => tx.recipient.equals(claimerAddress)),
      toArray(),
      map((txes) => {
        if (txes.length > MAX_UNCONFIRMED) { throw new Error("Too many unconfirmed claiming."); }
        return true;
      }),
    ),
  ]).pipe(
    mergeMap((results: any[]) => {
      const claimerAccount = results[0];
      const faucetAccount  = results[1];
      const outgoings   = results[2];
      const unconfirmed = results[3];

      if (!(outgoings && unconfirmed)) {
        throw new Error("Something wrong with outgoing or unconfirmed checking.");
      }

      // left 1xem for fee
      const faucetBalance = (faucetAccount.balance.balance) - 1000000;
      const amount = sanitizeAmount(req.body.amount)
        || Math.min(faucetBalance, randomInRange(XEM_MIN, XEM_MAX, 3));

      const message = buildMessage(
        req.body.message,
        req.body.encrypted,
        claimerAccount.publicAccount
      );

      const transferTx = buildTransferTransaction(
        claimerAddress,
        XEM.fromAbsolute(amount),
        message,
        req.body.asMosaic
      );
      const signedTx = FAUCET_ACCOUNT.signTransaction(transferTx);
      return transactionHttp.announceTransaction(signedTx);
    })
  ).subscribe(
    (result: NemAnnounceResult) => {
      const transactionHash = result.transactionHash.data;
      res.status(200).json({ transactionHash });
    },
    (err) => {
      console.error(err);
      res.status(400).json({ error: err.message });
    },
  );
});
