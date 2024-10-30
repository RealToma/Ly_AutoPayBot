import { Schema, model, Document, PopulatedDoc, ObjectId, Types } from "mongoose";
import { ServiceMode, ServiceStatus, UserRole } from "../src/common/types";
import { IService } from "./Service";

type Currency = "USD" | "EUR" | "GBP";

export interface IUser {
  userId: number;
  username?: string;
  role: UserRole;
  status?: ServiceStatus;
  expiresAt?: Date;
  paymentGateway?: Types.ObjectId;
  notified?: boolean;

  // Old strucure
  currency?: Currency;
  confirmMsg?: string;
  service?: Types.ObjectId;
  paymentLink?: string;
  paymentId?: string;
  newServiceMode?: ServiceMode;

  // New structure
  serviceName?: string; // Name of the service
  serviceMode?: ServiceMode;
  isPurchaseEnabled?: boolean;
  isRenewEnabled?: boolean;
  services?: Types.ObjectId[];
  invoice?: Types.ObjectId;
  triedServices?: number[];
}

export const User = model<IUser>(
  "User",
  new Schema<IUser>({
    userId: Number,
    username: String,
    role: Number,
    status: Number,
    expiresAt: Date,
    paymentGateway: { type: Schema.Types.ObjectId, ref: "PaymentGateway" },
    notified: Boolean,

    // Old strucure
    currency: String,
    confirmMsg: String,
    service: Types.ObjectId,
    paymentLink: String,
    paymentId: String,
    newServiceMode: Number,

    // New structure
    serviceName: String, // Name of the service
    serviceMode: Number,
    isPurchaseEnabled: Boolean,
    isRenewEnabled: Boolean,
    services: [{ type: Schema.Types.ObjectId, ref: "Service" }],
    invoice: { type: Schema.Types.ObjectId, ref: "PaymentInvoice" },
    triedServices: [Number],
  })
);
