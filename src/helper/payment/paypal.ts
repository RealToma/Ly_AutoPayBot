import paypal from "paypal-rest-sdk";
import { logger } from "../logger";
import { PAYPAL_API_MODE, WEB_ROOT } from "../../config/env";
import { BOT_NAME } from "../../common/string";

export interface IPayPalAPIInfo {
  accountId: string;
  accountEmail: string;
  clientId: string;
  clientSecret: string;
}

export interface IPaymentLinkData {
  success: boolean;
  link?: string;
  paymentId?: string;
  token?: string;
}

// callback information
const returnUrl = `${WEB_ROOT}/success/paypal`;
const cancelUrl = `${WEB_ROOT}/cancel`;

/*
export const checkPayment = async (paymentId: string) => {
  try {
    paypal.payment.get(paymentId, (err, res) => {
      logger.debug(JSON.stringify(res, null, 2));
      logger.debug(err);
      if (res?.state == "approved") {
        logger.info("success");
      } else {
        logger.info(`failed - ${res.state}`);
      }
    });
  } catch (error) {
    logger.info(error);
    return false;
  }
};
*/

export const executePayment = async (apiInfo: IPayPalAPIInfo, payerId: string, paymentId: string) => {
  paypal.configure({
    mode: PAYPAL_API_MODE,
    client_id: apiInfo.clientId,
    client_secret: apiInfo.clientSecret,
  });

  // Obtains the transaction details from paypal
  return await new Promise((resolve: (value: boolean) => void) => {
    paypal.payment.execute(paymentId, { payer_id: payerId }, (err, res) => {
      if (err) {
        logger.warn(err);
        return resolve(false);
      } else {
        // logger.debug(JSON.stringify(res, null, 2));
        return resolve(true);
      }
    });
  });
};

/**
 * Creates a payment with the given API info, and returns true if the payment was created
 * successfully
 * @param {IPayPalAPIInfo} apiInfo - IPayPalAPIInfo
 * @returns A boolean value.
 */
export const validatePaymentInfo = async (apiInfo: IPayPalAPIInfo) => {
  // Configuring the paypal API.
  paypal.configure({
    mode: PAYPAL_API_MODE,
    client_id: apiInfo.clientId,
    client_secret: apiInfo.clientSecret,
  });

  //  Creating a sample payment object
  const create_payment_json: paypal.Payment = {
    intent: "sale",
    payer: { payment_method: "paypal" },
    redirect_urls: { return_url: returnUrl, cancel_url: cancelUrl },
    transactions: [
      {
        item_list: {
          items: [
            {
              name: "Test item",
              price: "1",
              currency: "USD",
              quantity: 1,
            },
          ],
        },
        amount: {
          currency: "USD",
          total: "1",
        },
        payee: {
          email: apiInfo.accountEmail,
          merchant_id: apiInfo.accountId,
        },
      },
    ],
  };

  //  Creating a payment object and checking result
  return await new Promise((resolve: (value: boolean) => void) => {
    paypal.payment.create(create_payment_json, (err, res) => {
      if (err) {
        logger.debug(`PayPal API validation error:\n${JSON.stringify(apiInfo, null, 2)}\n${JSON.stringify(err, null, 2)}`);
      }
      resolve(!err && res.state === "created");
    });
  });
};

export const createPaymentLink = async (amount: string, currency: string, itemName: string, apiInfo: IPayPalAPIInfo) => {
  paypal.configure({
    mode: PAYPAL_API_MODE,
    client_id: apiInfo.clientId,
    client_secret: apiInfo.clientSecret,
  });

  const create_payment_json: paypal.Payment = {
    intent: "sale",
    payer: { payment_method: "paypal" },
    redirect_urls: { return_url: returnUrl, cancel_url: cancelUrl },
    transactions: [
      {
        item_list: {
          items: [
            {
              name: itemName,
              // sku: "item",
              price: amount,
              currency: currency,
              quantity: 1,
            },
          ],
        },
        amount: {
          currency: currency,
          total: amount,
        },
        // description: "This is the payment description.",
        payee: {
          email: apiInfo.accountEmail,
          merchant_id: apiInfo.accountId,
          payee_display_metadata: {
            brand_name: BOT_NAME,
          },
        },
      },
    ],
  };

  // logger.debug(JSON.stringify(create_payment_json, null, 2));

  const res = await new Promise((resolve: (value?: IPaymentLinkData) => void) => {
    paypal.payment.create(create_payment_json, (err, res) => {
      if (err) {
        const msg = err.response?.message || err.message;
        const info_link = err.response?.information_link;

        logger.error(`Error in payment link creation: ${JSON.stringify(err, null, 2)}`);
        if (info_link) {
          logger.info(`You can find more information at ${info_link}`);
        }
      } else if (res.state == "created") {
        logger.info(`Payment ID: ${res.id}`);
        logger.info(`Payment Link: ${res.links?.find((link) => link.rel === "approval_url")?.href}`);
        resolve({
          success: true,
          paymentId: res.id,
          link: res.links?.find((link) => link.rel === "approval_url")?.href,
        });
        return;
      } else {
        logger.warn(`Failed to create payment link: state = ${res.state}`);
        // logger.debug(JSON.stringify(res, null, 2));
      }
      resolve({ success: false });
    });
  });
  return res;
};

export const sendMoney = async (recipient: string, amount: number, apiInfo: IPayPalAPIInfo) => {
  logger.debug(`Sending money to ${recipient} £${amount}`);

  paypal.configure({
    mode: PAYPAL_API_MODE,
    client_id: apiInfo.clientId,
    client_secret: apiInfo.clientSecret,
  });

  const sender_batch_id = Math.random().toString(36).substring(9);
  const create_payout_json = {
    sender_batch_header: {
      sender_batch_id: sender_batch_id,
      email_subject: "You have a payment",
    },
    items: [
      {
        recipient_type: "EMAIL",
        amount: {
          value: amount,
          currency: "GBP",
        },
        receiver: recipient,
        note: "Thanks for your patronage!",
        sender_item_id: "Service purchase",
      },
    ],
  };

  const res = await new Promise((resolve: (value: boolean) => void) => {
    paypal.payout.create(create_payout_json, function (error: any, payout: any) {
      if (error) {
        logger.error(error);
        resolve(false);
      } else {
        // console.log(payout);
        // console.log("Send Money Successful");
        resolve(true);
      }
    });
  });

  return res;
};
