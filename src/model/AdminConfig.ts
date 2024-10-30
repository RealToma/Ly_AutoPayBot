import { model, Schema } from "mongoose";
import { IPayPalAPIInfo } from "../helper/payment/paypal";
import { IStripeAPIInfo } from "../helper/payment/stripe";
import { ICryptoAPIInfo } from "../helper/payment/crypto";

export interface IAdminConfig {
  paypalInfo?: IPayPalAPIInfo & { isValid: boolean };
  stripeInfo?: IStripeAPIInfo & { isValid: boolean };
  cryptoInfo?: ICryptoAPIInfo & { isValid: boolean};
  readServiceCost: number;
  purchaseServiceCost: number;
  renewalServiceCost: number;
  allServicesCost: number;
}

export const AdminConfig = model<IAdminConfig>(
  "AdminConfig",
  new Schema<IAdminConfig>({
    paypalInfo: {
      type: {
        accountId: String,
        accountEmail: String,
        clientId: String,
        clientSecret: String,
        isValid: Boolean,
      },
      required: false,
    },
    stripeInfo: {
      type: {
        accountEmail: String,
        secretKey: String,
        isValid: Boolean,
      },
      required: false,
    },
    cryptoInfo: {
      type: {
        network: String,
        address: String,
      },
      required: false,
    },
    readServiceCost: { type: Number, default: 0 },
    purchaseServiceCost: { type: Number, default: 25 },
    renewalServiceCost: { type: Number, default: 25 },
    allServicesCost: { type: Number, default: 40 },
  })
);
