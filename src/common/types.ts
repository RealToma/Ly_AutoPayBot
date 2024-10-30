export enum SessionState {
  None = 0,

  /**
   * Customer States
   */
  PurchaseOrRenew,
  EditOrderField,
  RenewUserLine,
  FixIncompleteOrder,

  /**
   * Owner States
   */
  RegisterServiceMode,
  RegisterService,
  EditServiceField,
  EditPlanInfo,
  EditPlanInfoAll,
  ReceivePayPalInfo,
  EditPayPalInfo,
  ReceiveStripeInfo,
  EditStripeInfo,
  EditConfirmMsg,

  /**
   * Admin States
   */
  AuthenticateAdmin,
  ReceiveOwnerExpirationDate,
  EditAdminPayPalEmail,
  EditServiceCost,
  EditAdminPayPalInfo,
  EditAdminStripeInfo,
  EditAdminCryptoInfo,
}

export enum ActionType {
  PurchaseOrder,
  TrialOrder,
  RenewOrder,
  AddOrder,
  UpgradeToOwner,
  RegisterService,
  PurchasePlan,
  // ExtendAllServices,
  ExtendService,
  ChangeServiceMode,
}

export interface IPurchaseInfo {
  serviceId: string;
  serverName: string;
  type: ActionType;
  username: string;
  password: string;
  packageId: string;
  packageTitle: string;
}

export enum UserRole {
  Customer = 1,
  Owner,
  Admin,
}

export enum ServiceStatus {
  Pending,
  Enabled,
  EnabledUntil,
  Disabled,
}

export enum OrderState {
  AwaitingPayment,
  Paid,
  Success,
  AwaitingRenewPayment,
  Expired,
}

export enum ServiceMode {
  None,
  PurchaseOnly,
  RenewOnly,
  PurchaseAndRenew,
  Trial,
}

export enum EndUserOption {
  None,
  UsernameOnly,
  PasswordOnly,
  UsernameAndPassword,
}
