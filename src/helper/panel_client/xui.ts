import axios from "axios";
import { load } from "cheerio";
import { logger } from "../logger";
import { ILineInfo, IPackageDetail, IPurchaseResult, IServer } from ".";

interface ILineSearchResult {
  draw: number;
  recordsTotal: string;
  recordsFiltered: string;
  data: string[][];
}

const parseBouquets = (json: string): number[] | undefined => {
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

const getCookie = async (service: IServer) => {
  try {
    const handler = new AbortController();
    const timeout = setTimeout(() => handler.abort(), 5000);
    await axios.post(
      `${service.url}/login`,
      {
        referrer: "",
        login: "",
        username: service.username,
        password: service.password,
      },
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        maxRedirects: 0,
        timeout: 5000,
        signal: handler.signal,
      }
    );
    clearTimeout(timeout);
    // success means login fails
  } catch (err) {
    if (axios.isAxiosError(err) && err.response) {
      const res = err.response;
      if (res.status == 302 && res.headers["location"] == "dashboard") {
        // login success - parse cookie
        return res.headers["set-cookie"]?.map((val) => val.split(";")[0]).join(";");
      }
    }
  }
};

export const validatePanelInfo = async (service: IServer) => {
  return !!(await getCookie(service));
};

export const getOwnerCredits = async (service: IServer, cookie?: string) => {
  if (!cookie) {
    cookie = await getCookie(service);
  }

  if (!cookie) return;

  const { data } = await axios.get(`${service.url}/line`, {
    headers: {
      cookie: cookie,
    },
  });

  const $ = load(data);

  const creditContent = $("#owner_points").html();

  if (!creditContent) return undefined;
  else return parseFloat(creditContent);
};

export const getPackages = async (service: IServer, cookie?: string) => {
  if (!cookie) {
    cookie = await getCookie(service);
  }

  if (!cookie) return { plans: [], trialPlans: [] };

  const normalPage = (
    await axios.get(`${service.url}/line`, {
      headers: {
        cookie: cookie,
      },
    })
  ).data;

  const $normal = load(normalPage);
  const plans = $normal("#package > option")
    .map(function () {
      return {
        value: $normal(this).attr("value") || "0",
        description: $normal(this).text(),
        isTrial: false,
      };
    })
    .toArray();

  const trialPage = (
    await axios.get(`${service.url}/line?trial=1`, {
      headers: {
        cookie: cookie,
      },
    })
  ).data;

  const $trial = load(trialPage);
  const trialPlans = $trial("#package > option")
    .map(function () {
      return {
        value: $trial(this).attr("value") || "0",
        description: $trial(this).text(),
        isTrial: true,
      };
    })
    .toArray();

  return { plans, trialPlans };
};

export const getPackageDetail = async (service: IServer, package_id: string, is_trial: boolean, cookie?: string) => {
  if (!cookie) {
    cookie = await getCookie(service);
  }

  if (!cookie) return;

  const res = (
    await axios.get(`${service.url}/api`, {
      params: {
        action: is_trial ? "get_package_trial" : "get_package",
        package_id: package_id,
      },
      headers: {
        cookie: cookie,
        "X-Requested-With": "XMLHttpRequest",
      },
    })
  ).data;
  return res.data as IPackageDetail;
};

export const createUserLine = async (
  service: IServer,
  username: string,
  password: string,
  packageId: string,
  isTrial?: boolean,
  cookie?: string
): Promise<{ result: boolean; detail?: ILineInfo } | undefined> => {
  if (!cookie) {
    cookie = await getCookie(service);
  }

  if (!cookie) return;

  const res = (
    await axios.post(
      `${service.url}/post.php`,
      {
        trial: isTrial ? 1 : 0,
        bouquets_selected: [],
        username: username,
        password: password,
        package: packageId,
      },
      {
        params: {
          action: "line",
        },
        headers: {
          cookie: cookie,
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "multipart/form-data",
        },
      }
    )
  ).data as IPurchaseResult;

  // if (res && res.result) {
  //   // get line info
  //   const lineInfo = await getLineByUsername(service, info.username);
  //   if (lineInfo) {
  //     packageInfo.exp_date = lineInfo.expiresAt || packageInfo.exp_date;
  //   }
  // }

  // logger.debug(`Purchase Result\n${JSON.stringify(res, null, 2)}`);

  if (!res.result) return { result: false };

  return {
    result: true,
    detail: await getLineInfoByUsername(service, username, cookie),
  };
};

export const getLineInfo = async (service: IServer, lineId: string, cookie?: string): Promise<ILineInfo | undefined> => {
  if (!cookie) {
    cookie = await getCookie(service);
  }

  if (!cookie) return;

  try {
    const resHTML = (
      await axios.get(`${service.url}/line`, {
        params: {
          id: lineId,
        },
        headers: {
          cookie: cookie,
          "X-Requested-With": "XMLHttpRequest",
        },
      })
    ).data as string;

    const $ = load(resHTML);

    return {
      lineId: lineId,
      username: $("#username").val() as string,
      password: $("#password").val() as string,
      packageId: /var rUserPackage = (\d+);/.exec(resHTML)?.[1] || "1",
      packageTitle: $("#orig_package").val() as string,
      maxConnections: $("#max_connections").val() as string,
      expDate: new Date(($("#exp_date").val() as string) + "Z"),
      bouquets: JSON.parse(/var rUserBouquet =\s*(\[[0-9,]*\])/.exec(resHTML)?.[1] || "[]"),
    };
  } catch (err) {
    logger.warn(`Error: getLineInfo(${lineId}) - ${err}`);
  }
};

export const getLineInfoByUsername = async (service: IServer, username: string, cookie?: string): Promise<ILineInfo | undefined> => {
  if (!cookie) {
    cookie = await getCookie(service);
  }

  if (!cookie) return;

  try {
    // get line id
    const res = (
      await axios.get(`${service.url}/table`, {
        params: {
          search: { value: username, regex: false },
          id: "lines",
        },
        headers: {
          cookie: cookie,
          "X-Requested-With": "XMLHttpRequest",
        },
      })
    ).data as ILineSearchResult;

    let lineId: string | undefined;

    res.data.forEach((row) => {
      let match = /<a href='line\?id=(\d*)'>([a-zA-Z0-9@._-]+)<\/a>/.exec(row[1]);
      if (match && match[2] === username) {
        lineId = match[1];
      }
    });

    if (!lineId) return;

    return await getLineInfo(service, lineId, cookie);
  } catch (err) {
    logger.warn(`Error: getLineIdByUsername(${username}) - ${err}`);
  }
};

export const getUserLineStatus = async (service: IServer, username: string, cookie?: string) => {
  if (!cookie) {
    cookie = await getCookie(service);
  }

  if (!cookie) return;

  try {
    const res = (
      await axios.get(`${service.url}/table`, {
        params: {
          search: { value: username, regex: false },
          id: "lines",
        },
        headers: {
          cookie: cookie,
          "X-Requested-With": "XMLHttpRequest",
        },
      })
    ).data as ILineSearchResult;

    let status: string | undefined;

    res.data.forEach((row) => {
      let match = /<a href='line\?id=(\d*)'>([a-zA-Z0-9@._-]+)<\/a>/.exec(row[1]);
      if (match && match[2] === username) {
        match = /title="(.*)"/.exec(row[4]);
        if (match) {
          status = match[1];
        }
      }
    });

    return status;
  } catch (err) {
    logger.warn(`Error: getLineIdByUsername(${username}) - ${err}`);
  }
};

export const getPackageAdditionDetail = async (
  service: IServer,
  lineId: string,
  oldPackageId: string,
  newPackageId: string,
  cookie?: string
) => {
  if (!cookie) {
    cookie = await getCookie(service);
  }

  if (!cookie) return;

  const res = (
    await axios.get(`${service.url}/api`, {
      params: {
        action: "get_package",
        package_id: newPackageId,
        user_id: lineId,
        orig_id: oldPackageId,
      },
      headers: {
        cookie: cookie,
        "X-Requested-With": "XMLHttpRequest",
      },
    })
  ).data;
  return res.data as IPackageDetail;
};

export const changeUserLineCred = async (service: IServer, lineId: string, newUserName: string, newPassword: string, cookie?: string) => {
  if (!cookie) {
    cookie = await getCookie(service);
  }

  if (!cookie) return false;

  try {
    const res = await axios.post(
      `${service.url}/post.php`,
      { edit: lineId, username: newUserName, password: newPassword },
      {
        params: { action: "line" },
        headers: {
          cookie: cookie,
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "multipart/form-data",
        },
      }
    );
    return res.data?.result === true;
  } catch (err) {}

  return false;
};

export const renewUserLine = async (
  service: IServer,
  lineId: string,
  newPackageId: string,
  cookie?: string
): Promise<{ result: boolean; detail?: ILineInfo } | undefined> => {
  if (!cookie) {
    cookie = await getCookie(service);
  }

  if (!cookie) return;

  const res = (
    await axios.post(
      `${service.url}/post.php`,
      { edit: lineId, package: newPackageId },
      {
        params: { action: "line" },
        headers: {
          cookie: cookie,
          "X-Requested-With": "XMLHttpRequest",
          "Content-Type": "multipart/form-data",
        },
      }
    )
  ).data as IPurchaseResult;

  if (!res.result) return { result: false };

  return {
    result: true,
    detail: await getLineInfo(service, lineId, cookie),
  };
};

export const deleteUserLine = async (service: IServer, lineId: string, cookie?: string) => {
  if (!cookie) {
    cookie = await getCookie(service);
  }

  if (!cookie) return { result: false, error: "Invalid service info" };

  const response = (
    await axios.get(`${service.url}/api`, {
      params: {
        action: "line",
        sub: "delete",
        user_id: lineId,
      },
      headers: {
        cookie: cookie,
        "X-Requested-With": "XMLHttpRequest",
      },
    })
  ).data;
  return response as { result: boolean; error?: string };
};
