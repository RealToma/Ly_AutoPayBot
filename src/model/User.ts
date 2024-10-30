import { Schema, model, Types } from "mongoose";
import { IPaymentGateway } from "./PaymentGateway";
import { IService } from "./Service";
import { ServiceStatus, ServiceMode, UserRole } from "../common/types";

export interface IUser {
  userId: number;
  username?: string;
  role: UserRole;
  // Owner information
  serviceName: string; // Name of the service
  status: ServiceStatus;
  expiresAt?: Date;
  serviceMode: ServiceMode;
  isPurchaseEnabled: boolean;
  isRenewEnabled: boolean;

  // status?: ServiceStatus;
  // expiresAt?: Date;
  // confirmMsg?: string;
  notified?: boolean;
  // service?: Types.ObjectId;
  services?: Types.ObjectId[];
  paymentGateway?: Types.ObjectId;

  invoice?: Types.ObjectId;

  // paymentLink?: string;
  // paymentId?: string;
  // newServiceMode?: ServiceMode;

  triedServices: number[];
}

export const User = model<IUser>(
  "User",
  new Schema<IUser>({
    userId: { type: Number, required: true, unique: true },
    username: { type: String },
    role: { type: Number, required: true },
    serviceName: { type: String, required: true },
    status: { type: Number, required: true, default: ServiceStatus.Disabled },
    expiresAt: Date,
    serviceMode: { type: Number, required: true },
    isPurchaseEnabled: { type: Boolean, default: true },
    isRenewEnabled: { type: Boolean, default: true },

    // status: Number,
    // expiresAt: Date,
    // confirmMsg: String,
    notified: Boolean,
    // service: { type: Schema.Types.ObjectId, ref: "Service" },
    services: [{ type: Schema.Types.ObjectId, ref: "Service" }],
    paymentGateway: { type: Schema.Types.ObjectId, ref: "PaymentGateway" },
    invoice: { type: Schema.Types.ObjectId, ref: "PaymentInvoice" },
    // paymentLink: String,
    // paymentId: String,
    // newServiceMode: Number,
    triedServices: { type: [Number], default: [] },
  })
);

export const getOwnerProfile = async (userId: number | string) => {
  return await User.findOne({
    userId: userId,
    role: UserRole.Owner,
  }).populate<{
    // service: IService & { _id: number };
    services: (IService & { _id: number })[];
    paymentGateway: IPaymentGateway;
  }>([/*"service",*/ "services", "paymentGateway"]);
};
