import { Schema, model, Types } from "mongoose";
import { ILineInfo } from "../helper/panel_client";
import { IService } from "./Service";
import { OrderState } from "../common/types";
import { IPaymentInvoice } from "./PaymentInvoice";

export interface IOrder {
  userId: number;

  service: Types.ObjectId;
  // username: string;
  // password: string;
  // packageId?: string;
  isTrial: boolean;

  invoice?: Types.ObjectId;

  // paymentMethod?: PaymentMethod;
  // paymentId?: string;
  // paymentLink?: string;

  status: OrderState;

  detail?: ILineInfo;
}

export const Order = model<IOrder>(
  "Order",
  new Schema<IOrder>({
    userId: { type: Number, required: true },

    service: { type: Schema.Types.ObjectId, ref: "Service" },
    // username: { type: String, required: true },
    // password: { type: String, required: true },
    // packageId: { type: String, required: false },
    isTrial: { type: Boolean, default: false },

    invoice: { type: Schema.Types.ObjectId, ref: "PaymentInvoice" },

    status: { type: Number, required: true },

    detail: {
      type: {
        // ILineInfo
        lineId: { type: String, required: true },
        username: { type: String, required: true },
        password: { type: String, required: true },
        packageId: { type: String, required: false },
        packageTitle: { type: String, required: false },
        maxConnections: { type: String, required: true },
        expDate: { type: Date, required: true },
        bouquets: { type: [Number], required: false },
      },
      required: false,
    },
  })
);

export const getOrderDetail = async (orderId: string) => {
  return await Order.findById(orderId).populate<{
    service: IService & { _id: Types.ObjectId };
    invoice: IPaymentInvoice;
  }>(["service", "invoice"]);
};
