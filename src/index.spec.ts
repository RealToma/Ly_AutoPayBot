import {
  PanelType,
  changeUserLineCred,
  createUserLine,
  deleteUserLine,
  getLineInfoByUsername,
  getOwnerCredits,
  getPackageAdditionDetail,
  getPackageDetail,
  getPackages,
  getUserLineStatus,
  renewUserLine,
  validatePanelInfo,
} from "./helper/panel_client";
import { createPaymentLink, sendMoney, validatePaymentInfo } from "./helper/payment/paypal";
import * as Stripe from "./helper/payment/stripe";
import express from "express";
import paypal from "paypal-rest-sdk";
import { logger } from "./helper/logger";
import bcrypt from "bcrypt";
import { ServiceMode } from "./common/types";

const testZapX = {
  panelType: PanelType.ZAPX,
  // serviceCode: 0,
  // serviceName: "test service",
  // price: 10,
  // isValide: true,
  // isPurchaseEnabled: true,
  // isRenewEnabled: true,
  url: "https://ppvplug.mypanel.cc",
  username: "Johnbud2022",
  password: "ARYCVJ67A",
  // customItemName: "",
  // isValid: true,
  // serviceMode: ServiceMode.None,
  // plans: [],
};

const testXUi = {
  panelType: PanelType.XUI,
  url: "http://bigstreamzb.ddns.net:8080/BUyeLbja",
  username: "7HhNeT6AeU",
  password: "7HhNeT6AeU",
};

const testPaypal = {
  accountId: "sb-kxshb24929594@business.example.com",
  accountEmail: "GZCDET2GKZJ3G",
  clientId: "Ad1RH0LyfgaJffR9DoesWac5aC4iF9CRFciFc5RXcl0dw4J1dxSGbHwU4CC-OfW9c7_8owfwy2FxesS7",
  clientSecret: "EFvSq_nEVxh2t4OpPDfyNZafi0wzUBpRaJEPchUK6bafIaKNoMoayKxHHPMkOngYGA-ODctUtJi_N43p",
};

// createPaymentLink("1", "USD");
// verifyPayment("PAYID-MPI6GRY1TY39429VV323670L");
/*
paypal.configure({
  mode: "sandbox",
  client_id:
    "AYFgF77j5o1qJ1y0pHOhN4ez7xJnAfbJ7Y7fmgbquXbONaJxEpB5oOh6eTApHUB8-yoqogDdB6hHE9g8",
  client_secret:
    "EEoawaU50xACoBy6w5DTodYaSbapeAn9NB-ugUntvjU_nndpv8vEdNlhrabg7u4dOUe1c00esTznSg3W",
});

const app = express();

app.get("/success", (req, res) => {
  const payerId = req.query.PayerID as string;
  const paymentId = req.query.paymentId as string;

  // Obtains the transaction details from paypal
  paypal.payment.execute(
    paymentId,
    { payer_id: payerId },
    function (error, payment) {
      //When error occurs when due to non-existent transaction, throw an error else log the transaction details in the console then send a Success string reposponse to the user.
      if (error) {
        console.log(error.response);
        throw error;
      } else {
        console.log(JSON.stringify(payment, null, 2));
        res.send("Success");
      }
    }
  );
});
app.get("/cancel", (req, res) => res.send("Cancelled"));
app.listen(3000, "localhost", () => console.log("server started"));
console.log("HI, this is test string");
*/

// validatePaymentInfo({
//   accountEmail: "test_sb-kxshb24929594@business.example.com",
//   accountId: "GZCDET2GKZJ3G12",
//   clientId:
//     "Ad1RH0LyfgaJffR9DoesWac5aC4iF9CRFciFc5RXcl0dw4J1dxSGbHwU4CC-OfW9c7_8owfwy2FxesS7",
//   clientSecret:
//     "EFvSq_nEVxh2t4OpPDfyNZafi0wzUBpRaJEPchUK6bafIaKNoMoayKxHHPMkOngYGA-ODctUtJi_N43p",
// })
//   .then((res) => console.log(res))
//   .catch((err) => console.log(err));

async function errornous() {
  throw "Catch this error!!";
}

async function testXUiPanel() {
  // console.log(await validatePanelInfo(testXUi));
  // console.log(await getOwnerCredits(testXUi));
  // console.log(await getPackages(testXUi));
  // console.log(await getPackageDetail(testXUi, "57", false));
  // console.log(await getLineInfoByUsername(testXUi, "12312312123"));
  // console.log(await getUserLineStatus(testXUi, "12312312123"));
  // console.log(await getPackageAdditionDetail(testXUi, "12312312123", "140", "55"));
  // console.log(await changeUserLineCred(testXUi, "84690", "TestUser1238", "unittest1"));
  // console.log(await renewUserLine(testXUi, "84690", "55"));
  // console.log(await deleteUserLine(testXUi, "84697"));
  console.log(await createUserLine(testXUi, "TestFinal_user", "TestFinal_password", "2"));
}

async function testZapXPanel() {
  // console.log(await validatePanelInfo(testZapX));
  // console.log(await getOwnerCredits(testZapX));
  // console.log(await getPackages(testZapX));
  // console.log(await getPackageDetail(testZapX, "142", false));
  // console.log(await getLineInfoByUsername(testZapX, "TestUser1238"));
  // console.log(await getUserLineStatus(testZapX, "TestUser1238"));
  // console.log(await getPackageAdditionDetail(testZapX, "1026207", "140", "140"));
  // console.log(await changeUserLineCred(testZapX, "1026207", "TestUser1238", "unittest1"));
  // console.log(await renewUserLine(testZapX, "1026207", "140"));
  // console.log(await deleteUserLine(testZapX, "1026207"));
  console.log(await createUserLine(testZapX, "TestFinal_user", "TestFinal_password", "140"));
}

async function test() {
  // testXUiPanel();
  // testZapXPanel();
  ////////////////////////////////////////////////////////////////////////////
  //    Panel client test
  // console.log(await login(testService));
  // console.log(parseBouquets('[{"name":"a","value":2}, 3, 4]'));
  // console.log(parseBouquets("[1, 3, 4]"));
  // console.log(parseBouquets('["a", 3, 4]'));
  // console.log(parseBouquets('["a", 3, 4'));
  // console.log(parseBouquets("[a, 3, 4]"));
  ////////////////////////////////////////////////////////////////////////
  //    Payment test
  // check send-money
  // sendMoney("sb-fkzpu25039227@personal.example.com", 10, testPaypal);
  // console.log(
  //   await Stripe.validateApiInfo(
  //     "sk_test_51NDdJaLe1IBTkBUs5sguLqQsueTIKvRoeHtH0ZbXruVGPx3zDBRCaSeExMfwBSwTMCRxGLSXF4YtD5YNnhvVA2sB00UFGKkfQA"
  //   )
  // );
  // console.log(
  //   await Stripe.createPaymentLink(
  //     "sk_test_51NDdJaLe1IBTkBUs5sguLqQsueTIKvRoeHtH0ZbXruVGPx3zDBRCaSeExMfwBSwTMCRxGLSXF4YtD5YNnhvVA2sB00UFGKkfQA",
  //     "",
  //     "100",
  //     "eur",
  //     "test item"
  //   )
  // );
  // console.log(
  //   await Stripe.checkPaymentResult(
  //     "sk_test_51NDdJaLe1IBTkBUs5sguLqQsueTIKvRoeHtH0ZbXruVGPx3zDBRCaSeExMfwBSwTMCRxGLSXF4YtD5YNnhvVA2sB00UFGKkfQA",
  //     "cs_test_a11ay5m8PpdDcaQeey6pwx4Jl9d097U6liua7lEkXqWG9f7JhVuATFbA5w"
  //   )
  // );
  ////////////////////////////////////////////////////////////////////////
  //    Misc
  // await errornous().catch((err) => console.log("catched"));
  // generate password hash
  // const hash = await bcrypt.hash("123456789", 10);
  // console.log(hash);
  // const hash_check_result = await bcrypt.compare(
  //   "123456789",
  //   "$2b$10$MITohE6YlUqCPt.887vfQ.mgY2SMpg1eq.ZF8JNKX5PhTkmf8nQnq"
  // );
  // console.log(hash_check_result);
}

test();
