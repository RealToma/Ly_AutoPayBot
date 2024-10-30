import { Schema, model } from "mongoose";
import { EndUserOption, ServiceStatus, ServiceMode } from "../common/types";
import { PanelType } from "../helper/panel_client";

export type Currency = "USD" | "EUR" | "GBP";

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

  panelType: PanelType;
  serviceCode: number; // unique id of the service
  currency: Currency;

  isValid: boolean; // Configuration is valid or not

  url: string; // base URL of the management panel
  username: string; // username of the management panel
  password: string; // password of the management panel

  confirmMsg?: string;

  isTrialEnabled: boolean;

  userOption: EndUserOption;

  minLength: number;

  plans: IPackage[];
  trialPlans: IPackage[];
}

export const Service = model<IService>(
  "Service",
  new Schema<IService>({
    ownerId: { type: Number, required: true },
    panelType: { type: String, required: true, default: PanelType.XUI },
    serviceCode: { type: Number, required: true },
    currency: { type: String, required: true },

    isValid: { type: Boolean, required: true },

    url: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },

    confirmMsg: String,

    isTrialEnabled: { type: Boolean, default: true },

    userOption: { type: Number, default: EndUserOption.None },

    minLength: { type: Number, default: 8 },

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
