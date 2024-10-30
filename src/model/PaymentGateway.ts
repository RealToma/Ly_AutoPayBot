import { Schema, model } from "mongoose";
import { IPayPalAPIInfo } from "../helper/payment/paypal";
import { IStripeAPIInfo } from "../helper/payment/stripe";

export interface IPaymentGateway {
  ownerId: number;
  countEnabled: number;
  paypal?: IPayPalAPIInfo & { isValid: boolean };
  stripe?: IStripeAPIInfo & { isValid: boolean };
}

export const PaymentGateway = model<IPaymentGateway>(
  "PaymentGateway",
  new Schema<IPaymentGateway>({
    ownerId: { type: Number, required: true, unique: true },
    countEnabled: { type: Number, required: true },
    paypal: {
      type: {
        accountId: { type: String, required: true },
        accountEmail: { type: String, required: true },
        clientId: { type: String, required: true },
        clientSecret: { type: String, required: true },
        isValid: { type: Boolean, required: true },
      },
      required: false,
    },
    stripe: {
      type: {
        accountEmail: { type: String, required: true },
        secretKey: { type: String, required: true },
        isValid: { type: Boolean, required: true },
      },
      required: false,
    },
  })
);
