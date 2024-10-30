import { Context } from "telegraf";
import { Document, Types } from "mongoose";
import { IPaymentGateway } from "../model/PaymentGateway";
import { IService } from "../model/Service";
import { IUser } from "../model/User";
import { IPurchaseInfo, ServiceMode, SessionState } from "../common/types";

interface BotSession {
  status: SessionState;
  user: Document<unknown, any, IUser> & IUser & { _id: Types.ObjectId };

  // common helper variable for changing information
  step: number; // Step number of wizard
  recordId: string; // Id of target document to change
  fieldName: string; // field name in the target document to change

  // customer
  purchaseInfo: IPurchaseInfo;

  // owner
  curServiceId: string;
  service: IService & { serviceName: string; serviceMode: ServiceMode; isPurchaseEnabled: boolean; isRenewEnabled: boolean };
  paymentGateway: IPaymentGateway;

  // admin
  serviceId: string; // Id of the owner that admin wants to change
}

export interface BotContext extends Context {
  session: BotSession;
}
