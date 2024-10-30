import { Schema, model } from "mongoose";
import { EndUserOption, ServiceMode } from "../src/common/types";
import { PanelType } from "../src/helper/panel_client";

type Currency = "USD" | "EUR" | "GBP";

export interface IPackage {
  id: string;
  originalId: string;
  title: string;
  price?: number;
  panelTitle: string;
  paymentTitle: string;
  enabled: boolean;
}

export interface IService {
  ownerId: number; // chat id of the owner
  serviceCode: number; // unique id of the service
  isValid: boolean; // Configuration is valid or not

  url: string; // base URL of the management panel
  username: string; // username of the management panel
  password: string; // password of the management panel
  userOption: EndUserOption;
  minLength: number;
  plans: IPackage[];

  // old params
  serviceName?: string; // Name of the service
  serviceMode?: ServiceMode;
  isPurchaseEnabled?: boolean;
  isRenewEnabled?: boolean;

  // new params
  panelType: PanelType;
  currency?: Currency;
  confirmMsg?: string;
  isTrialEnabled?: boolean;
  trialPlans?: IPackage[];
}

export const Service = model<IService>(
  "Service",
  new Schema<IService>({
    ownerId: Number,
    serviceCode: Number,
    isValid: Boolean,

    url: String,
    username: String,
    password: String,
    userOption: Number,
    minLength: Number,

    serviceName: String,
    serviceMode: Number,
    isPurchaseEnabled: Boolean,
    isRenewEnabled: Boolean,

    panelType: { type: String, default: PanelType.XUI },
    currency: String,
    confirmMsg: String,
    isTrialEnabled: Boolean,

    plans: [
      {
        id: { type: String, required: true },
        originalId: { type: String, required: true },
        title: { type: String, required: true },
        price: Number,
        panelTitle: String,
        paymentTitle: String,
        enabled: { type: Boolean, required: true },
      },
    ],
    trialPlans: [
      {
        id: { type: String, required: true },
        originalId: { type: String, required: true },
        title: { type: String, required: true },
        price: Number,
        panelTitle: String,
        paymentTitle: String,
        enabled: { type: Boolean, required: true },
      },
    ],
  })
);
