import { Markup } from "telegraf";
import { CURRENCY_SYMBOLS } from "../../common/string";
import { logger } from "../../helper/logger";
import { getOwnerCredits, getPackages, validatePanelInfo } from "../../helper/panel_client";
import { escape, getButtons, time2String } from "../../helper/string_util";
import { Currency, IService, Service } from "../../model/Service";
import { getOwnerProfile } from "../../model/User";
import { BotContext } from "../context";
import { clearCallbackButton } from "../../helper/misc";
import { EndUserOption, ServiceStatus, ServiceMode, SessionState } from "../../common/types";
import { getServiceModeLabel, getUserOptionLabel } from "../../common/functions";

export const displayServices = async (ctx: BotContext, pageIndex: number, isCallbackMode: boolean) => {
  const user = await getOwnerProfile(ctx.chat?.id as number);

  if (!user) {
    logger.error(`Manage services: user not found(${ctx.chat?.id})`);
    return;
  }

  let msg = "";

  msg += `<b><u>${user.serviceName}</u></b>\n\n`;

  const btnInfo: [string, string][][] = [
    [],
    [],
    [
      ["Change service name", "o_edit_service_name"],
      ["Add a new service", "o_addserver"],
    ],
    [["« Back to dashboard", "o_dashboard"]],
  ];

  const MAX_SERVICES = 5;

  const maxPageIndex = Math.max(0, Math.ceil(user.services.length / MAX_SERVICES) - 1);

  if (pageIndex < 0) pageIndex = 0;
  if (pageIndex > maxPageIndex) {
    pageIndex = maxPageIndex;
  }

  if (pageIndex > 0) {
    btnInfo[1].push(["«", `o_manage_services_${pageIndex - 1}`]);
  }
  if (pageIndex < maxPageIndex) {
    btnInfo[1].push(["»", `o_manage_services_${pageIndex + 1}`]);
  }

  for (let i = 0; i < MAX_SERVICES; i++) {
    let offset = i + pageIndex * MAX_SERVICES;

    if (offset >= user.services.length) break;

    const service = user.services[offset];

    msg += `<b>${escape(service.url)}</b>`;
    if (!service.isValid) {
      msg += " ⚠️";
    }
    msg += "\n";

    msg += "<pre>";
    // msg += `URL: ${escape(service.url)}\n`;
    msg += `Service code: ${service.serviceCode}\n`;
    // msg += `Service mode: ${getServiceModeLabel(user.serviceMode)}\n`;
    // switch (user.status) {
    //   case ServiceStatus.Pending:
    //     msg += `Status: Pending\n`;
    //     break;
    //   case ServiceStatus.Enabled:
    //     msg += `Status: Enabled\n`;
    //     break;
    //   case ServiceStatus.EnabledUntil:
    //     msg += `Status: Enabled(until ${time2String(user.expiresAt)})\n`;
    //     break;
    //   case ServiceStatus.Disabled:
    //     msg += `Status: Disabled\n`;
    //     break;
    // }
    msg += `Available packages: ${service.plans.filter((plan) => plan.enabled && plan.price).length}\n`;
    msg += `Trial line: ${service.isTrialEnabled ? "Enabled" : "Disabled"}\n`;
    msg += "</pre>\n\n";

    btnInfo[0].push([service.serviceCode.toString(), `o_manage_service_${service._id}`]);
  }

  if (user.services.length == 0) {
    msg += `No services registered yet.\n`;
  }

  const buttons = getButtons(btnInfo);

  if (isCallbackMode) {
    await ctx.editMessageText(msg, {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    });
  } else {
    await ctx.replyWithHTML(msg, Markup.inlineKeyboard(buttons));
  }
};

export const displayServiceDetail = async (ctx: BotContext, isCallbackMode: boolean, submenu: string = "none") => {
  const user = ctx.session.user;
  const service = await Service.findById(ctx.session.curServiceId);

  if (!user) {
    logger.error(`Manage service: user not found(${ctx.chat?.id})`);
    return;
  }
  if (!service) {
    logger.error(`Manage service: service is undefined(${ctx.chat?.id})`);
    return;
  }

  if (user.services?.indexOf(service._id) === -1) {
    logger.error(`Invalid service id`);
    return;
  }

  const credits = service.isValid ? await getOwnerCredits(service) : undefined;

  const numFeasiblePlans = service.plans.filter((plan) => plan.price !== undefined && plan.enabled).length;

  let message = "";
  message += `<b>${escape(user.serviceName)}</b>\n\n`;
  message += `<b>Service Code:</b> ${service.serviceCode}\n\n`;
  message += `<b>Server Information</b>\n`;
  message += `<pre>`;
  message += `Panel Type: ${service.panelType}\n`;
  message += `URL: ${escape(service.url)}\n`;
  message += `Username: ${escape(service.username)}\n`;
  message += `Password: ${escape(service.password)}\n`;
  message += `Available Credits: ${credits === undefined ? "N/A" : credits}\n`;
  message += `</pre>\n\n`;

  message += `<b>Packages:</b>\n`;
  message += `<pre>`;
  message += `${numFeasiblePlans} of ${service.plans.length} packages are available on panel.\n`;
  message += `${service.trialPlans.length} trial packages available\n`;
  message += `</pre>\n\n`;

  message += `<b>User Option</b>\n`;
  message += `<pre>`;
  message += `Profile Option: ${escape(getUserOptionLabel(service.userOption))}\n`;
  message += `Trial Line: ${service.isTrialEnabled ? "Enabled  ✅" : "Disabled 🚫"}\n`;
  message += `Userinfo Min Length: ${service.minLength}\n`;
  message += `</pre>\n\n`;

  message += `<b>After Purchase Message:</b> ${escape(service.confirmMsg || "Not set")}\n\n`;

  message += `<b>Payment Currency:</b> ${service.currency}\n\n`;

  // service availability information
  if (!service.isValid) {
    message += "⚠️ Your server information is invalid.\n";
  }

  let buttonLabels: [string, string][][] = [];
  let servicePlanBtnLabel = "Change your plan type";

  if (user.serviceMode === ServiceMode.Trial) {
    servicePlanBtnLabel = "Purchase full verion";
  }

  const trialButtonLabel = service.isTrialEnabled ? "Disable Trial Lines" : "Enable Trial Lines";
  const trialButtonAction = service.isTrialEnabled ? "o_disable_trial" : "o_enable_trial";

  if (submenu === "none") {
    buttonLabels = [
      [
        ["Edit Panel info", "o_edit_server_info"],
        ["Edit packages", "o_edit_plans_0"],
      ],
      [
        ["User options", "o_edit_user_option"],
        ["After Purchase Message", "o_edit_service_confirm_message"],
      ],
      [
        ["Set Currency", "o_edit_currency"],
        ["« Back", "o_manage_services_0"],
      ],
    ];
  } else if (submenu === "server_info") {
    buttonLabels = [
      [
        ["Edit URL", "o_edit_service_URL"],
        ["Edit username", "o_edit_service_username"],
      ],
      [
        ["Edit password", "o_edit_service_password"],
        ["« Back", "o_manage_service"],
      ],
    ];
  } else if (submenu === "user_option") {
    buttonLabels = [
      [
        [trialButtonLabel, trialButtonAction],
        ["Set character length", "o_edit_service_minimum_userinfo_length"],
      ],
      [
        ["Profile option", "o_edit_profile_option"],
        ["« Back", "o_manage_service"],
      ],
    ];
  }

  const buttons = getButtons(buttonLabels);

  ctx.session.status = SessionState.None;

  if (isCallbackMode) {
    await ctx
      .editMessageText(message, {
        parse_mode: "HTML",
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
      })
      .catch(() => {});
  } else {
    if (ctx.callbackQuery) {
      await ctx.editMessageReplyMarkup(undefined);
    }
    await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons));
  }
};

// display plans of the service
export const displayServicePlans = async (ctx: BotContext, pageIndex: number, isCallbackMode: boolean) => {
  const service = await Service.findById(ctx.session.curServiceId);
  if (!service) {
    logger.error(`Manage service: service is undefined(${ctx.chat?.id})`);
    return;
  }
  const plans = service.plans;
  if (!plans) {
    logger.error(`Manage service: no plans(${ctx.chat?.id})`);
    return;
  }

  const PLANS_PER_PAGE = 5;

  const maxPageIndex = Math.ceil(plans.length / PLANS_PER_PAGE) - 1;

  if (pageIndex < 0) pageIndex = 0;
  if (pageIndex > maxPageIndex) {
    pageIndex = maxPageIndex;
  }

  const offset = pageIndex * PLANS_PER_PAGE;

  let firstMsg = true;

  let message = "";
  message += `<b>Total ${plans.length} Packages</b>\n\n`;
  for (let i = 0; i < PLANS_PER_PAGE; i++) {
    if (offset + i >= plans.length) {
      break;
    }

    const plan = plans[offset + i];
    message += `<b>${plan.id}.</b> ${escape(plan.title)}`;
    message += ` ${plan.enabled ? "✅" : "🚫"}\n`;

    message += `  Price: ${plan.price ? CURRENCY_SYMBOLS[service.currency] + plan.price : "Not set"}\n`;
    message += `  Panel Title: ${escape(plan.panelTitle)}\n`;
    message += `  Payment Title: ${escape(plan.paymentTitle)}\n`;
    message += "\n";
  }

  message += "<b>";
  message += "Please enter a package number to edit.\n";
  // message += "Send /all to set value for all packages.\n";
  // message += "Send /one_by_one to set the values one by one.\n";
  message += "</b>";
  // message += "(package ID is the number next to your package)";

  ctx.session.status = SessionState.EditServiceField;
  ctx.session.fieldName = "plans";
  ctx.session.step = 0;

  const buttons = getButtons([
    [
      ["|< First", `o_edit_plans_0`],
      ["< Prev", `o_edit_plans_${pageIndex - 1}`],
      ["Next >", `o_edit_plans_${pageIndex + 1}`],
      ["Last >|", `o_edit_plans_${maxPageIndex}`],
    ],
    [
      ["Enable All", `o_enable_all_plans`],
      ["Disable All", `o_disable_all_plans`],
    ],
    [["« Back", "o_manage_service"]],
  ]);

  if (firstMsg && isCallbackMode) {
    await ctx
      .editMessageText(message, {
        parse_mode: "HTML",
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
      })
      .catch(() => {});
  } else {
    await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons));
  }
};

export const manageService = async (ctx: BotContext, serviceId: string) => {
  ctx.session.curServiceId = serviceId;
  await displayServiceDetail(ctx, true);
};

export const displayServicePlan = async (ctx: BotContext, planId: string, service: IService, isCallbackMode: boolean) => {
  let message = "";
  const btnLabels: [string, string][][] = [
    [
      ["Price", `o_set_plan_price`],
      ["Title (panel)", `o_set_plan_panel_title`],
    ],
    [
      ["Title (payment)", `o_set_plan_payment_title`],
      ["Title (both)", `o_set_plan_title`],
    ],
  ];

  // if (value === "/all") {
  //   ctx.session.status = SessionState.EditPlanInfoAll;
  //   ctx.session.step = -1;
  //   message += `Edit all package information\n`;
  //   btnLabels.push([
  //     [`Enable`, `o_enable_plan`],
  //     [`Disable`, `o_disable_plan`],
  //   ]);
  // } else if (value === "/one_by_one") {
  //   ctx.session.status = SessionState.EditPlanInfoAll;
  //   ctx.session.step = 0;
  //   message += `Edit package one by one\n`;
  // } else {
  const plan = service.plans.find((p) => p.id === planId);
  if (!plan) {
    await ctx.reply("Invalid package ID. Please try again.");
    return;
  }
  ctx.session.status = SessionState.EditPlanInfo;
  ctx.session.recordId = planId;
  message += `<b>Package ${plan.id}. ${plan.title}</b>\n\n`;

  message += `<b>Status:</b> ${plan.enabled ? "Enabled" : "Disabled"}\n`;

  message += `<b>Price:</b> ${plan.price ? CURRENCY_SYMBOLS[service.currency] + plan.price : "Not set"}\n`;
  message += `<b>Panel Title:</b> ${escape(plan.panelTitle)}\n`;
  message += `<b>Payment Title:</b> ${escape(plan.paymentTitle)}\n`;

  btnLabels.push([
    [`Enable`, `o_enable_plan`],
    [`Disable`, `o_disable_plan`],
  ]);
  // }

  ctx.session.fieldName = "";

  btnLabels.push([["« Back", "o_edit_plans_0"]]);

  const buttons = getButtons(btnLabels);
  if (isCallbackMode) {
    await ctx
      .editMessageText(message, {
        parse_mode: "HTML",
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
      })
      .catch(() => {});
  } else {
    await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons));
  }
};

export const showMsg4EditService = async (ctx: BotContext, fieldName: string) => {
  const user = ctx.session.user;
  ctx.session.status = SessionState.EditServiceField;
  ctx.session.fieldName = fieldName;
  if (fieldName === "purchase" || fieldName === "renew") {
    let service = await Service.findById(ctx.session.curServiceId);
    if (!service) {
      logger.error(`Edit ${fieldName}: service not found(${ctx.chat?.id})`);
      return;
    }
    if (fieldName === "purchase") {
      user.isPurchaseEnabled = !user.isPurchaseEnabled;
    } else {
      user.isRenewEnabled = !user.isRenewEnabled;
    }
    await user.save();

    await displayServiceDetail(ctx, true);
  } else {
    const label = fieldName.replace(/_/g, " ");
    let msg = `Please input the ${label} of your service.`;

    if (fieldName === "minimum_userinfo_length") {
      msg = "Please input the minimum number of characters you would like to set for username and password for your service.";
    }

    let buttons = getButtons([[["« Back", "o_manage_service"]]]);

    if (fieldName === "name") {
      msg = "Please enter the name of your service. (This is the name of your service that your customers will recognise)";
      buttons = getButtons([[["« Back", "o_manage_services_0"]]]);
    }

    await ctx.editMessageText(msg, Markup.inlineKeyboard(buttons)).catch(() => {});
  }
};

export const setServiceInfo = async (ctx: BotContext, value: string) => {
  const user = ctx.session.user;
  const fieldName = ctx.session.fieldName;

  if (fieldName === "name") {
    user.serviceName = value;
    await user.save();
    await displayServices(ctx, 0, false);
    return;
  }

  let service = await Service.findById(ctx.session.curServiceId);
  if (!service) {
    logger.error(`Edit ${fieldName}: service not found(${ctx.chat?.id})`);
    return;
  }

  if (fieldName === "plans") {
    let msgId = ctx.message?.message_id as number;
    await ctx.deleteMessage(msgId);
    await ctx.deleteMessage(msgId - 1).catch(() => {});

    await displayServicePlan(ctx, value, service, false);

    return;
  }

  await clearCallbackButton(ctx);

  let submenu = "none";

  if (fieldName === "URL") {
    service.url = value.trim().replace(/\/+$/, "");
    submenu = "server_info";
  } else if (fieldName === "username") {
    service.username = value;
    submenu = "server_info";
  } else if (fieldName === "password") {
    service.password = value;
    submenu = "server_info";
  } else if (fieldName === "plan_price") {
    const plan = service.plans.find((p) => p.id === ctx.session.recordId);
    if (plan) {
      plan.price = parseFloat(value);
    }
  } else if (fieldName === "confirm_message") {
    service.confirmMsg = value;
  } else if (fieldName === "minimum_userinfo_length") {
    let minLength = parseInt(value);

    if (isNaN(minLength)) {
      await ctx.reply("Please input valid number.");
      return;
    }

    submenu = "user_option";
    service.minLength = minLength;
  }

  service.isValid = await validatePanelInfo(service);

  if (service.isValid) {
    // server URL or credentials are changed
    // retrieve package information from server
    const { plans, trialPlans } = await getPackages(service);

    const oldPlans = service.plans;
    const oldTrialPlans = service.trialPlans;

    service.plans = [];
    service.trialPlans = [];

    plans.forEach((plan, index) => {
      const oldPlan = oldPlans.find((p) => p.originalId === plan.value && p.title === plan.description);

      if (oldPlan) {
        service?.plans.push({
          id: `${index + 1}`,
          originalId: plan.value,
          title: plan.description,
          panelTitle: oldPlan.panelTitle,
          paymentTitle: oldPlan.paymentTitle,
          enabled: oldPlan.enabled,
          price: oldPlan.price,
        });
      } else {
        service?.plans.push({
          id: `${index + 1}`,
          originalId: plan.value,
          title: plan.description,
          panelTitle: plan.description,
          paymentTitle: "",
          enabled: true,
        });
      }
    });

    trialPlans.forEach((plan, index) => {
      const oldPlan = oldTrialPlans.find((p) => p.originalId === plan.value && p.title === plan.description);

      if (oldPlan) {
        service?.trialPlans.push({
          id: `${index + 1}`,
          originalId: plan.value,
          title: plan.description,
          panelTitle: oldPlan.panelTitle,
          paymentTitle: oldPlan.paymentTitle,
          enabled: oldPlan.enabled,
          price: oldPlan.price,
        });
      } else {
        service?.trialPlans.push({
          id: `${index + 1}`,
          originalId: plan.value,
          title: plan.description,
          panelTitle: plan.description,
          paymentTitle: "",
          enabled: true,
        });
      }
    });
  }

  ctx.session.status = SessionState.None;

  await service.save();

  await displayServiceDetail(ctx, false, submenu);
};

export const showMsg4ConfirmMsg = async (ctx: BotContext) => {
  ctx.session.status = SessionState.EditConfirmMsg;
  const buttons = getButtons([[["« Back", "o_manage_service"]]]);
  await ctx
    .editMessageText("Please enter the message to confirm", {
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    })
    .catch(() => {});
};

export const setConfirmMsg = async (ctx: BotContext, msg: string) => {
  const user = ctx.session.user;
  // user.confirmMsg = msg;
  await user.save();
  await clearCallbackButton(ctx);
  await displayServiceDetail(ctx, false);
};

export const showMsg4PlanInfo = async (ctx: BotContext, action: string, batchType: string, isCallbackMode: boolean) => {
  const service = await Service.findById(ctx.session.curServiceId);
  if (!service) {
    logger.error(`Edit plan ${action}: service not found(${ctx.chat?.id})`);
    ctx.session.status = SessionState.None;
    return;
  }

  let message = "";

  if (ctx.session.status == SessionState.EditPlanInfoAll) {
    ctx.session.status = SessionState.EditPlanInfoAll;
    if (ctx.session.step < 0) {
      message = `Please enter the ${action} of all of your packages.`;
    } else {
      const plan = service.plans[ctx.session.step];
      message = `Please enter the ${action} of <b>${escape(plan?.title)}</b>`;
    }
  } else {
    ctx.session.status = SessionState.EditPlanInfo;
    const plan = service.plans.find((p) => p.id === ctx.session.recordId);
    message = `Please enter the ${action} of <b>${escape(plan?.title)}</b>`;
  }

  ctx.session.fieldName = action;

  if (isCallbackMode) {
    await ctx.editMessageText(message, { parse_mode: "HTML" }).catch(() => {});
  } else {
    await ctx.replyWithHTML(message);
  }
};

export const setPlanInfo = async (ctx: BotContext, value: string) => {
  const service = await Service.findById(ctx.session.curServiceId);
  let fieldName = ctx.session.fieldName;

  if (!service) {
    logger.error(`Edit plan ${fieldName}: service not found(${ctx.chat?.id})`);
    ctx.session.status = SessionState.None;
    return;
  }

  if (SessionState.EditPlanInfoAll == ctx.session.status && 0 > ctx.session.step) {
    for (let i = 0; i < service.plans.length; i++) {
      if (fieldName == "title") {
        service.plans[i].panelTitle = value;
        service.plans[i].paymentTitle = value;
      } else if (fieldName == "panel_title") {
        service.plans[i].panelTitle = value;
      } else if (fieldName == "payment_title") {
        service.plans[i].paymentTitle = value;
      } else if (fieldName == "price") {
        service.plans[i].price = parseFloat(value);
      }
    }
  } else {
    const plan =
      SessionState.EditPlanInfoAll == ctx.session.status
        ? service.plans[ctx.session.step]
        : service.plans.find((p) => p.id === ctx.session.recordId);

    if (!plan) {
      logger.error(`Edit plan ${fieldName}: plan not found(${ctx.chat?.id})`);
      ctx.session.status = SessionState.None;
      return;
    }

    if (fieldName == "title") {
      plan.panelTitle = value;
      plan.paymentTitle = value;
    } else if (fieldName == "panel_title") {
      plan.panelTitle = value;
    } else if (fieldName == "payment_title") {
      plan.paymentTitle = value;
    } else if (fieldName == "price") {
      plan.price = parseFloat(value);
    }
  }

  await service.save();

  if (SessionState.EditPlanInfoAll == ctx.session.status && ctx.session.step < service.plans.length - 1 && ctx.session.step >= 0) {
    ctx.session.step += 1;
    await showMsg4PlanInfo(ctx, fieldName, "loop", false);
  } else {
    // await displayServicePlans(ctx, 0, false);
    await displayServicePlan(ctx, ctx.session.recordId, service, false);
  }
};

export const enablePlan = async (ctx: BotContext, isEnable: boolean, applyToAll: boolean) => {
  const service = await Service.findById(ctx.session.curServiceId);
  let fieldName = ctx.session.fieldName;

  if (!service) {
    logger.error(`Edit plan ${fieldName}: service not found(${ctx.chat?.id})`);
    ctx.session.status = SessionState.None;
    return;
  }

  if (applyToAll) {
    for (let i = 0; i < service.plans.length; i++) {
      service.plans[i].enabled = isEnable;
    }
  } else {
    const plan = service.plans.find((p) => p.id === ctx.session.recordId);

    if (!plan) {
      logger.error(`Edit plan ${fieldName}: plan not found(${ctx.chat?.id})`);
      ctx.session.status = SessionState.None;
      return;
    }

    plan.enabled = isEnable;
  }

  await service.save();

  if (applyToAll) {
    await displayServicePlans(ctx, 0, true);
  } else {
    await displayServicePlan(ctx, ctx.session.recordId, service, true);
  }
};

export const showMsg4UserOption = async (ctx: BotContext) => {
  const buttons = getButtons([
    [
      ["Password only", `o_profile_option_${EndUserOption.PasswordOnly}`],
      ["Username only", `o_profile_option_${EndUserOption.UsernameOnly}`],
    ],
    [
      ["Both", `o_profile_option_${EndUserOption.UsernameAndPassword}`],
      ["None", `o_profile_option_${EndUserOption.None}`],
    ],
    [["« Back", "o_manage_service_user_option"]],
  ]);

  await ctx
    .editMessageText(
      "Please select if your users would like the ability to change their usernames or passwords.\n",
      Markup.inlineKeyboard(buttons)
    )
    .catch(() => {});
};

export const setUserOption = async (ctx: BotContext, mode: number) => {
  const service = await Service.findById(ctx.session.curServiceId);
  if (!service) {
    logger.error(`Edit service plan: service not found(${ctx.chat?.id})`);
    return;
  }
  service.userOption = mode;
  await service.save();
  await displayServiceDetail(ctx, true, "user_option");
};

export const enableTrial = async (ctx: BotContext, enable: boolean) => {
  const service = await Service.findById(ctx.session.curServiceId);
  if (!service) {
    logger.error(`Enable/disable trial: service not found(${ctx.chat?.id})`);
    ctx.session.status = SessionState.None;
    return;
  }

  service.isTrialEnabled = enable;
  await service.save();

  await displayServiceDetail(ctx, true, "user_option");
};

export const showMsg4Currency = async (ctx: BotContext) => {
  const buttons = getButtons([
    [
      ["USD", "o_set_currency_USD"],
      ["EUR", "o_set_currency_EUR"],
      ["GBP", "o_set_currency_GBP"],
    ],
    [["« Back to dashboard", "o_dashboard"]],
  ]);

  await ctx.editMessageText(`Please select the currency you want to use.`, Markup.inlineKeyboard(buttons));
};

export const setCurrency = async (ctx: BotContext, currency: string) => {
  const service = await Service.findById(ctx.session.curServiceId);
  if (!service) {
    logger.error(`Set currency: service not found(${ctx.chat?.id})`);
    ctx.session.status = SessionState.None;
    return;
  }

  service.currency = currency as Currency;
  await service.save();

  await displayServiceDetail(ctx, true);
};
