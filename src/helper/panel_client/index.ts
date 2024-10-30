import { logger } from "../logger";
import * as xui from "./xui";
import * as zapx from "./zapx";

// disable verification of server certification
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export enum PanelType {
  XUI = "XUi",
  ZAPX = "ZapX",
}

// server information
export interface IServer {
  panelType: PanelType;
  url: string; // base URL of the management panel
  username: string; // username of the management panal
  password: string; // password of the management panal
}

// package information
export interface IPackageBasicInfo {
  value: string;
  description: string;
  isTrial: boolean;
}

// could not use camelCase
export interface IPackageDetail {
  max_connections: string;
  exp_date: string;

  // using in bot but ZapX does not support it
  duration: string;
  bouquets: string;

  cost_credits: string;
  check_compatible: string;
  compatible: boolean;
}

interface IPurchaseResultData {
  username: string;
  password: string;
  package: string;
  // contact: string;
  // reseller_notes: string;
}

export interface IPurchaseResult {
  result: boolean;
  data: IPurchaseResultData;
  status: number;
  statusMsg: string;
}

export interface ILineInfo {
  lineId: string;
  username: string;
  password: string;
  packageId?: string; // XUi only
  packageTitle?: string; // XUi only
  maxConnections: string;
  expDate: Date;
  bouquets: number[]; // XUi only
  enabled?: boolean; // ZapX only
}

export interface IDeleteLineResult {
  result: boolean;
  error?: string;
}

export const validatePanelInfo = async (service: IServer): Promise<boolean> => {
  switch (service.panelType) {
    case PanelType.XUI:
      return await xui.validatePanelInfo(service);
    case PanelType.ZAPX:
      return await zapx.validatePanelInfo(service);
    default:
      logger.error(`validatePanelInfo - invalid service type: ${service.panelType}`);
      return false;
  }
};

export const getOwnerCredits = async (service: IServer): Promise<number | undefined> => {
  switch (service.panelType) {
    case PanelType.XUI:
      return await xui.getOwnerCredits(service);
    case PanelType.ZAPX:
      return await zapx.getOwnerCredits(service);
    default:
      logger.error(`getOwnerCredits - invalid service type: ${service.panelType}`);
      return;
  }
};

export const getPackages = async (service: IServer): Promise<{ plans: IPackageBasicInfo[]; trialPlans: IPackageBasicInfo[] }> => {
  switch (service.panelType) {
    case PanelType.XUI:
      return await xui.getPackages(service);
    case PanelType.ZAPX:
      return await zapx.getPackages(service);
    default:
      logger.error(`getPackages - invalid service type: ${service.panelType}`);
      return { plans: [], trialPlans: [] };
  }
};

export const getPackageDetail = async (service: IServer, package_id: string, is_trial: boolean): Promise<IPackageDetail | undefined> => {
  switch (service.panelType) {
    case PanelType.XUI:
      return await xui.getPackageDetail(service, package_id, is_trial);
    case PanelType.ZAPX:
      return await zapx.getPackageDetail(service, package_id, is_trial);
    default:
      logger.error(`getPackageDetail - invalid service type: ${service.panelType}`);
      return;
  }
};

export const createUserLine = async (
  service: IServer,
  username: string,
  password: string,
  packageId: string,
  isTrial?: boolean
): Promise<{ result: boolean; detail?: ILineInfo } | undefined> => {
  switch (service.panelType) {
    case PanelType.XUI:
      return await xui.createUserLine(service, username, password, packageId, isTrial);
    case PanelType.ZAPX:
      return await zapx.createUserLine(service, username, password, packageId, isTrial);
    default:
      logger.error(`createUserLine - invalid service type: ${service.panelType}`);
      return;
  }
};

export const getLineInfoByUsername = async (service: IServer, username: string): Promise<ILineInfo | undefined> => {
  switch (service.panelType) {
    case PanelType.XUI:
      return await xui.getLineInfoByUsername(service, username);
    case PanelType.ZAPX:
      return await zapx.getLineInfoByUsername(service, username);
    default:
      logger.error(`getLineInfoByUsername - invalid service type: ${service.panelType}`);
      return;
  }
};

export const getUserLineStatus = async (service: IServer, username: string): Promise<string | undefined> => {
  switch (service.panelType) {
    case PanelType.XUI:
      return await xui.getUserLineStatus(service, username);
    case PanelType.ZAPX:
      return await zapx.getUserLineStatus(service, username);
    default:
      logger.error(`getUserLineStatus - invalid service type: ${service.panelType}`);
      return;
  }
};

export const getPackageAdditionDetail = async (
  service: IServer,
  lineId: string,
  oldPackageId: string,
  newPackageId: string
): Promise<IPackageDetail | undefined> => {
  switch (service.panelType) {
    case PanelType.XUI:
      return await xui.getPackageAdditionDetail(service, lineId, oldPackageId, newPackageId);
    case PanelType.ZAPX:
      return await zapx.getPackageAdditionDetail(service, lineId, oldPackageId, newPackageId);
    default:
      logger.error(`getPackageAdditionDetail - invalid service type: ${service.panelType}`);
      return;
  }
};

export const changeUserLineCred = async (service: IServer, lineId: string, newUserName: string, newPassword: string): Promise<boolean> => {
  switch (service.panelType) {
    case PanelType.XUI:
      return await xui.changeUserLineCred(service, lineId, newUserName, newPassword);
    case PanelType.ZAPX:
      return await zapx.changeUserLineCred(service, lineId, newUserName, newPassword);
    default:
      logger.error(`changeUserLineCred - invalid service type: ${service.panelType}`);
      return false;
  }
};

export const renewUserLine = async (
  service: IServer,
  lineId: string,
  newPackageId: string
): Promise<{ result: boolean; detail?: ILineInfo } | undefined> => {
  switch (service.panelType) {
    case PanelType.XUI:
      return await xui.renewUserLine(service, lineId, newPackageId);
    case PanelType.ZAPX:
      return await zapx.renewUserLine(service, lineId, newPackageId);
    default:
      logger.error(`renewUserLine - invalid service type: ${service.panelType}`);
      return { result: false };
  }
};

export const deleteUserLine = async (service: IServer, lineId: string): Promise<IDeleteLineResult> => {
  switch (service.panelType) {
    case PanelType.XUI:
      return await xui.deleteUserLine(service, lineId);
    case PanelType.ZAPX:
      return await zapx.deleteUserLine(service, lineId);
    default:
      logger.error(`deleteUserLine - invalid service type: ${service.panelType}`);
      return { result: false };
  }
};
