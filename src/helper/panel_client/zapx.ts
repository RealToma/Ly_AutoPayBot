import axios, { isAxiosError } from "axios";
import { load } from "cheerio";
import { logger } from "../logger";
import { normalize } from "../string_util";
import { IDeleteLineResult, ILineInfo, IPackageDetail, IPurchaseResult, IServer } from ".";
import { AxiosClient } from "../axios_client";

interface ILineSearchResult {
  draw: number;
  recordsTotal: string;
  recordsFiltered: string;
  data: [
    {
      id: string;
      username: string;
      password: string;
      user_connection: number;
      expire_date: number;
      is_trial: number;
      enabled: number;
    }
  ];
}

export const parseBouquets = (json: string): number[] | undefined => {
  try {
    const bouquets: number[] = JSON.parse(json);
    if (bouquets && bouquets.reduce((prev, bouquet) => prev && typeof bouquet === "number", true)) {
      return bouquets;
    }
  } catch (err) {
    logger.warn(`Parse bouquets ${err}`);
  }
  return undefined;
};

// get csrf-token
const getCSRFToken = async (url: string, client: AxiosClient) => {
  const { data } = await client.get(url);
  let csrf_token: string = "";

  const $ = load(data);

  $('meta[name="csrf-token"]').each(function () {
    csrf_token = $(this).attr("content") ?? "";
  });

  return csrf_token;
};

export const login = async (service: IServer): Promise<AxiosClient | undefined> => {
  const client = new AxiosClient([{ key: "VPZ", value: "414e06430998890bc8301af90909fe1a" }]);
  try {
    await client.post(`${service.url}`, {
      _token: await getCSRFToken(service.url, client),
      username: service.username,
      password: service.password,
    });
    // success means login fails
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const res = err.response;
      if (res.status == 302 && res.headers["location"] == `${service.url}/dashboard`) {
        // login success - parse cookie
        return client;
      }
    }
  }
};

export const validatePanelInfo = async (service: IServer): Promise<boolean> => {
  return !!(await login(service));
};

export const getOwnerCredits = async (service: IServer, client?: AxiosClient): Promise<number | undefined> => {
  if (!client) {
    client = await login(service);
  }

  if (!client) return;

  const { data } = await client.get(`${service.url}/dashboard`);

  const $ = load(data);

  const creditContent = $("small.label-warning").html() ?? "";

  const matches = /^Credits: (\d*)$/.exec(creditContent);

  if (matches) return parseFloat(matches[1]);
};

export const getPackages = async (service: IServer, client?: AxiosClient) => {
  if (!client) {
    client = await login(service);
  }

  if (!client) return { plans: [], trialPlans: [] };

  const normalPage = (await client.get(`${service.url}/lines/create/0/line`)).data;

  const $normal = load(normalPage);
  const plans = $normal("#package > option")
    .map(function () {
      return {
        value: $normal(this).attr("value") || "",
        description: normalize($normal(this).text()),
        isTrial: false,
      };
    })
    .toArray()
    .filter((plan) => plan.value != "");

  return { plans, trialPlans: [] };
};

export const getPackageDetail = async (service: IServer, package_id: string, is_trial: boolean, client?: AxiosClient) => {
  if (!client) {
    client = await login(service);
  }

  if (!client) return;

  const token = await getCSRFToken(`${service.url}/lines/create/0/line`, client);

  const res = (
    await client.post(
      `${service.url}/lines/packages`,
      {
        trial: is_trial ? "1" : "0",
        package_id: package_id,
      },
      token
    )
  ).data;
  return res.data as IPackageDetail;
};

export const createUserLine = async (
  service: IServer,
  username: string,
  password: string,
  packageId: string,
  isTrial?: boolean,
  client?: AxiosClient
): Promise<{ result: boolean; detail?: ILineInfo } | undefined> => {
  if (!client) {
    client = await login(service);
  }

  if (!client) return;

  const token = await getCSRFToken(`${service.url}/lines/create/0/line`, client);

  try {
    const res = (
      await client.post(
        `${service.url}/lines/create/0`,
        {
          current_bouquets: "",
          _token: token,
          line_type: "line",
          username: username,
          mac: "",
          package: packageId,
          description: "",
        },
        token
      )
    ).data as IPurchaseResult;

    return {
      result: true,
      detail: await getLineInfoByUsername(service, username, client),
    };
  } catch (err) {
    logger.debug(err);
    return { result: false };
  }
};

export const getLineInfo = async (service: IServer, lineId: string, client?: AxiosClient) /*: Promise<ILineInfo | undefined>*/ => {
  if (!client) {
    client = await login(service);
  }

  if (!client) return;

  try {
    const token = await getCSRFToken(`${service.url}/lines`, client);

    // get line id
    const res = (
      await client.post(
        `${service.url}/lines/data`,
        {
          columns: [
            {
              data: "id",
              name: "id",
              searchable: true,
              orderable: true,
              search: {
                value: "",
                regex: false,
              },
            },
          ],
          search: {
            value: lineId,
            regex: false,
          },
        },
        token
      )
    ).data as ILineSearchResult;

    const searchedInfo = res.data.find((item) => item.id === lineId);

    if (searchedInfo) {
      const info: ILineInfo = {
        lineId: searchedInfo.id,
        username: searchedInfo.username,
        password: searchedInfo.password,
        maxConnections: searchedInfo.user_connection.toString(),
        expDate: new Date(searchedInfo.expire_date * 1000),
        enabled: !!searchedInfo.enabled,

        // TODO: parse these values from somewhere, or change line info struct
        packageId: "",
        packageTitle: "",
        bouquets: [],
      };
      return info;
    }
  } catch (err) {
    logger.warn(`Error: getLineInfo(${lineId}) - ${err}`);
  }
};

export const getLineInfoByUsername = async (service: IServer, username: string, client?: AxiosClient) => {
  if (!client) {
    client = await login(service);
  }

  if (!client) return;

  try {
    const token = await getCSRFToken(`${service.url}/lines`, client);

    // get line id
    const res = (
      await client.post(
        `${service.url}/lines/data`,
        {
          columns: [
            {
              data: "expired",
              name: "username",
              searchable: true,
              orderable: true,
              search: {
                value: "",
                regex: false,
              },
            },
          ],
          search: {
            value: username,
            regex: false,
          },
        },
        token
      )
    ).data as ILineSearchResult;

    const searchedInfo = res.data.find((item) => item.username === username);

    if (searchedInfo) {
      const info: ILineInfo = {
        lineId: searchedInfo.id,
        username: searchedInfo.username,
        password: searchedInfo.password,
        maxConnections: searchedInfo.user_connection.toString(),
        expDate: new Date(searchedInfo.expire_date * 1000),
        enabled: !!searchedInfo.enabled,

        // TODO: parse these values from somewhere, or change line info struct
        packageId: "",
        packageTitle: "",
        bouquets: [],
      };
      return info;
    }
  } catch (err) {
    logger.warn(`Error: getLineIdByUsername(${username}) - ${err}`);
  }
};

export const getUserLineStatus = async (service: IServer, username: string, client?: AxiosClient) => {
  if ((await getLineInfoByUsername(service, username, client))?.enabled) {
    return "Enabled";
  } else {
    return "Disabled";
  }
};

export const getPackageAdditionDetail = async (
  service: IServer,
  lineId: string,
  oldPackageId: string,
  newPackageId: string,
  client?: AxiosClient
) => {
  if (!client) {
    client = await login(service);
  }

  if (!client) return;

  const token = await getCSRFToken(`${service.url}/lines/extend/${lineId}`, client);

  const res = (
    await client.post(
      `${service.url}/lines/packages`,
      {
        package_id: newPackageId,
        trial: 0,
        id: lineId,
        uid: lineId,
      },
      token
    )
  ).data;
  return res.data as IPackageDetail;
};

/**
 * Change credential of user line
 * @param service Server information
 * @param lineId index of user line
 * @param newUserName new username
 * @param newPassword new password
 * @returns
 */
export const changeUserLineCred = async (
  service: IServer,
  lineId: string,
  newUserName: string,
  newPassword: string,
  client?: AxiosClient
) => {
  if (!client) {
    client = await login(service);
  }

  if (!client) return false;

  const token = await getCSRFToken(`${service.url}/lines/edit/${lineId}`, client);

  try {
    const { data } = await client.post(`${service.url}/lines/edit/${lineId}`, {
      current_bouquets: "",
      _token: token,
      username: newUserName,
      password: newPassword,
      description: "-",
    });
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 302 && err.response?.headers["location"] === `${service.url}/lines`) {
      return true;
    } else {
      logger.error(`changeUserLineCred: ${err}`);
    }
  }
  return false;
};

/**
 * Renew user line (add a package)
 * @param service Server information
 * @param lineId user line ID
 * @param newPackageId new package ID
 * @returns
 */
export const renewUserLine = async (service: IServer, lineId: string, newPackageId: string, client?: AxiosClient) => {
  if (!client) {
    client = await login(service);
  }

  if (!client) return { result: false };

  try {
    const token = await getCSRFToken(`${service.url}/lines/extend/${lineId}`, client);
    const res = (
      await client.post(`${service.url}/lines/extend/${lineId}`, {
        current_bouquets: "",
        _token: token,
        package: newPackageId,
        description: "-",
      })
    ).data as IPurchaseResult;
  } catch (err) {
    if (isAxiosError(err) && err.response?.status === 302 && err.response?.headers["location"] === `${service.url}/lines`) {
      return { result: true, detail: await getLineInfo(service, lineId, client) };
    } else {
      logger.error(`renewUserLine: ${err}`);
    }
  }
  return { result: false };
};

export const deleteUserLine = async (service: IServer, lineId: string, client?: AxiosClient): Promise<IDeleteLineResult> => {
  if (!client) {
    client = await login(service);
  }

  if (!client) return { result: false, error: "Invalid service info" };

  const token = await getCSRFToken(`${service.url}/lines`, client);

  const response = (await client.post(`${service.url}/lines/delete/${lineId}`, {}, token)).data as { success: boolean; message: string };
  return { result: response.success, error: response.message };
};
