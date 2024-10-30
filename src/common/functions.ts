import { logger } from "../helper/logger";
import { IAdminConfig } from "../model/AdminConfig";
import { EndUserOption, ServiceMode } from "./types";

export const getUserOptionLabel = (option: EndUserOption): string => {
  switch (option) {
    case EndUserOption.UsernameOnly:
      return "Change username only";
    case EndUserOption.PasswordOnly:
      return "Change password only";
    case EndUserOption.UsernameAndPassword:
      return "Change username and password";
    default:
      return "Cannot change profile";
  }
};

export const getServiceModeLabel = (mode?: ServiceMode): string => {
  switch (mode) {
    case ServiceMode.None:
      return "Reminders Only";
    case ServiceMode.PurchaseOnly:
      return "Purchase Only";
    case ServiceMode.RenewOnly:
      return "Renewals Only";
    case ServiceMode.PurchaseAndRenew:
      return "Purchase And Renewals";
    case ServiceMode.Trial:
      return "Trial";
    default:
      return "Invalid service mode";
  }
};

export const getServicePlanPrice = (config: IAdminConfig, mode: ServiceMode) => {
  switch (mode) {
    case ServiceMode.Trial:
      return 0;
    case ServiceMode.None:
      return config.readServiceCost;
    case ServiceMode.PurchaseOnly:
      return config.purchaseServiceCost;
    case ServiceMode.RenewOnly:
      return config.renewalServiceCost;
    case ServiceMode.PurchaseAndRenew:
      return config.allServicesCost;
    default:
      logger.error(`Unknown service mode ${mode}\n`);
      return 0;
  }
};

export const getFeatureEnabled = (mode: ServiceMode) => {
  switch (mode) {
    case ServiceMode.None:
      return [false, false];
    case ServiceMode.PurchaseOnly:
      return [true, false];
    case ServiceMode.RenewOnly:
      return [false, true];
    case ServiceMode.PurchaseAndRenew:
    case ServiceMode.Trial:
      return [true, true];
    default:
      logger.error(`Unknown service mode ${mode}\n`);
      return [false, false];
  }
};
