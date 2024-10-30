export interface ICryptoAPIInfo {
  network: string;
  address: string;
}

export const validateApiInfo = async (apiInfo: ICryptoAPIInfo) => {
  // TODO: validate crypto network and address info
  return true;
};
