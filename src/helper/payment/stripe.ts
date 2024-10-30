import Stripe from "stripe";
import { BOT_NAME } from "../../common/string";
import { logger } from "../logger";
import { WEB_ROOT } from "../../config/env";
import { randomUUID } from "crypto";

const returnUrl = `${WEB_ROOT}/success/stripe`;

export interface IStripeAPIInfo {
  accountEmail: string;
  secretKey: string;
}

export const validateApiInfo = async (apiInfo: IStripeAPIInfo) => {
  const result = await createPaymentLink(apiInfo, "1", "usd", "Test Item");
  return result.success;
};

export const createPaymentLink = async (apiInfo: IStripeAPIInfo, amount: string, currency: string, itemName: string) => {
  try {
    const stripe = new Stripe(apiInfo.secretKey, { apiVersion: "2022-11-15" });

    const requestId = randomUUID();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency,
            product_data: {
              name: BOT_NAME,
              description: itemName || "User line package",
            },
            unit_amount: parseFloat(amount) * 100, // in cents
          },
          quantity: 1,
        },
      ],
      success_url: `${returnUrl}?requestId=${requestId}`,
    });

    return { requestId, paymentId: session.id, link: session.url, success: true };
  } catch (err) {
    logger.error(`createPaymentLink(Stripe): ${err}`);
    return { success: false };
  }
};

export const checkPaymentResult = async (apiInfo: IStripeAPIInfo, paymentId: string) => {
  try {
    const stripe = new Stripe(apiInfo.secretKey, { apiVersion: "2022-11-15" });
    const data = await stripe.checkout.sessions.retrieve(paymentId);
    return data.status === "complete";
  } catch (err) {
    logger.error(`checkPaymentResult(Stripe): ${err}`);
    return false;
  }
};
