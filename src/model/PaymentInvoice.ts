import { model } from "mongoose";
import { ActionType, ServiceMode } from "../common/types";
import { Schema } from "mongoose";
import { IPayPalAPIInfo } from "../helper/payment/paypal";
import { IStripeAPIInfo } from "../helper/payment/stripe";

export interface IPaymentInvoice {
  actionType: ActionType;

  // service owner data
  serviceMode?: ServiceMode;
  serviceId?: string;

  // customer data
  packageId?: string;
  packageTitle?: string;
  username?: string;
  password?: string;

  paypal?: IPayPalAPIInfo & {
    link: string;
    paymentId: string;
  };
  stripe?: IStripeAPIInfo & {
    requestId: string;
    link: string;
    paymentId: string;
  };
}

export const PaymentInvoice = model<IPaymentInvoice>(
  "PaymentInvoice",
  new Schema<IPaymentInvoice>({
    actionType: { type: Number, required: true },
    serviceMode: Number,
    serviceId: String,
    packageId: String,
    packageTitle: String,
    username: String,
    password: String,

    paypal: {
      type: {
        accountId: String,
        accountEmail: String,
        clientId: String,
        clientSecret: String,
        link: String,
        paymentId: String,
      },
      required: false,
    },
    stripe: {
      type: {
        accountEmail: String,
        secretKey: String,
        requestId: String,
        link: String,
        paymentId: String,
      },
      required: false,
    },
  })
);
