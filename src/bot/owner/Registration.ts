import { Markup } from "telegraf";
import { logger } from "../../helper/logger";
import { PanelType, getPackages, validatePanelInfo } from "../../helper/panel_client";
import { getButtons } from "../../helper/string_util";
import { AdminConfig } from "../../model/AdminConfig";
import { PaymentGateway } from "../../model/PaymentGateway";
import { Service } from "../../model/Service";
import { BotContext } from "../context";
import * as paypal from "../../helper/payment/paypal";
import * as stripe from "../../helper/payment/stripe";
import moment from "moment";
import { OWNER_WELCOME_MESSAGE } from "../../common/string";
import { sleep_ms } from "../../helper/misc";
import { EndUserOption, ServiceStatus, ServiceMode, SessionState, UserRole, ActionType } from "../../common/types";
import { IPaymentInvoice, PaymentInvoice } from "../../model/PaymentInvoice";
import { getFeatureEnabled, getServicePlanPrice, getServiceModeLabel } from "../../common/functions";
import { InlineKeyboardButton } from "telegraf/typings/core/types/typegram";

export const showMsg4Upgrade = async (ctx: BotContext) => {
  const user = ctx.session.user;
  if (user.role === UserRole.Owner) {
    await ctx.reply("You already have the owner role.", Markup.removeKeyboard());
    return;
  }
  if (user.role === UserRole.Admin) {
    await ctx.reply("You can't register a service.", Markup.removeKeyboard());
    return;
  }

  const config = await AdminConfig.findOne();

  if (!config?.paypalInfo && !config?.stripeInfo) {
    await ctx.reply(
      "It's not ready to register your service. Please contact the administrator for more inforamtion.",
      Markup.removeKeyboard()
    );
    return;
  }

  let buttons = getButtons([
    [[`Reminders only (£${config.readServiceCost})`, "c_service_plan_0"]],
    [[`Purchase New Subscriptions only (£${config.purchaseServiceCost})`, "c_service_plan_1"]],
    [[`Renewals only (£${config.renewalServiceCost})`, "c_service_plan_2"]],
    [[`Purchase New and Renew (£${config.allServicesCost}) Discounted`, "c_service_plan_3"]],
    [[`7 days free trial`, "c_service_plan_4"]],
  ]);

  ctx.session.status = SessionState.RegisterServiceMode;

  const msg = await ctx.replyWithHTML(OWNER_WELCOME_MESSAGE);

  await ctx.pinChatMessage(msg.message_id);

  await sleep_ms(2000);

  await ctx.reply("Please select the service mode you want to register.", Markup.inlineKeyboard(buttons));
};

export const showMsg4Register = async (ctx: BotContext, isCallbackMode: boolean) => {
  const user = ctx.session.user;

  ctx.session.service = {
    ownerId: user.userId,
    panelType: PanelType.XUI,
    serviceCode: 0,
    serviceName: "",
    url: "",
    username: "",
    password: "",
    isValid: false,
    serviceMode: ServiceMode.None,
    isPurchaseEnabled: false,
    isRenewEnabled: false,
    isTrialEnabled: true,
    userOption: EndUserOption.None,
    minLength: 8,
    plans: [],
    trialPlans: [],
    currency: "GBP",
  };

  // logger.debug(JSON.stringify(ctx.session.service));

  ctx.session.status = SessionState.RegisterService;
  ctx.session.step = 0;
  await ctx.reply(
    "Please select the panel type you wish to register.",
    Markup.keyboard([Markup.button.text("XUI"), Markup.button.text("ZapX")], { columns: 3 })
  );
};

export const showMsg4ContinueRegistration = async (ctx: BotContext) => {
  const user = ctx.session.user;

  const invoice = await PaymentInvoice.findById(user.invoice);

  let serviceMode = invoice?.serviceMode;

  if (serviceMode === undefined) serviceMode = ServiceMode.Trial;

  ctx.session.service = {
    ownerId: user.userId,
    panelType: PanelType.XUI,
    serviceCode: 0,
    serviceName: "",
    url: "",
    username: "",
    password: "",
    isValid: false,
    serviceMode,
    isPurchaseEnabled: false,
    isRenewEnabled: false,
    isTrialEnabled: true,
    userOption: EndUserOption.None,
    minLength: 8,
    plans: [],
    trialPlans: [],
    currency: "GBP",
  };

  [ctx.session.service.isPurchaseEnabled, ctx.session.service.isRenewEnabled] = getFeatureEnabled(serviceMode);

  // logger.debug(JSON.stringify(ctx.session.service));

  ctx.session.status = SessionState.RegisterService;
  ctx.session.step = 0;
  await ctx.editMessageReplyMarkup(undefined);
  await ctx.reply(
    "Please select the panel type you wish to register",
    Markup.keyboard([Markup.button.text("XUI"), Markup.button.text("ZapX")], { columns: 3 })
  );
};

// receive registration information - service name, URL, username, password
export const recvRegistrationInfo = async (ctx: BotContext, value: string) => {
  let message = "";

  let config = await AdminConfig.findOne();
  if (!config) {
    config = await AdminConfig.create({
      readServiceCost: 10,
      purchaseServiceCost: 25,
      renewalServiceCost: 25,
      allServicesCost: 40,
    });
  }

  switch (ctx.session.step) {
    case 0:
      switch (value.toLowerCase()) {
        case "xui":
          ctx.session.service.panelType = PanelType.XUI;
          break;
        case "zapx":
          ctx.session.service.panelType = PanelType.ZAPX;
          break;
        default:
          await ctx.reply("You entered invalid panel type. I only support Xui and Zapx panels now.");
          return;
      }
      message = "Please enter the URL of your service management panel.";
      break;
    case 1:
      ctx.session.service.url = value.trim().replace(/\/+$/, "");
      message = "Please enter the username of the panel.";
      break;
    case 2:
      ctx.session.service.username = value;
      message = "Please enter the password of the panel.";
      break;
    case 3:
      ctx.session.service.password = value;

      const user = ctx.session.user;
      // register service
      // logger.debug(`Registering service...\n${JSON.stringify(ctx.session.service, null, 2)}`);

      const { plans, trialPlans } = await getPackages(ctx.session.service);

      ctx.session.service.plans = plans.map((plan, index) => {
        return {
          id: `${index + 1}`,
          originalId: plan.value,
          title: plan.description,
          panelTitle: plan.description,
          paymentTitle: "",
          enabled: true,
        };
      });

      ctx.session.service.trialPlans = trialPlans.map((plan, index) => {
        return {
          id: `${index + 1}`,
          originalId: plan.value,
          title: plan.description,
          panelTitle: plan.description,
          paymentTitle: "",
          enabled: true,
        };
      });

      ctx.session.service.isValid = await validatePanelInfo(ctx.session.service);

      // generate random service code
      let serviceCode = Math.floor(Math.random() * 900000 + 100000);

      while (await Service.findOne({ serviceCode })) {
        serviceCode = Math.floor(Math.random() * 900000 + 100000);
      }

      ctx.session.service.serviceCode = serviceCode;

      const service = await Service.create(ctx.session.service);

      // update user information
      user.services?.push(service._id);

      if (user.role === UserRole.Customer) {
        // register payment method(empty data)
        const paymentGateway = await PaymentGateway.create({
          ownerId: ctx.chat?.id,
          countEnabled: 0,
        });
        user.paymentGateway = paymentGateway._id;
        user.serviceMode = ctx.session.service.serviceMode;
        user.role = UserRole.Owner;
        user.status = ServiceStatus.EnabledUntil;
        user.expiresAt = moment.utc().add(1, "months").toDate();
        if (ctx.session.service.serviceMode === ServiceMode.Trial) {
          // trial mode - change subscription to 1 week
          user.expiresAt = moment.utc().add(7, "days").toDate();
        }
      }

      await user.save();

      ctx.session.status = SessionState.None;
      await ctx
        .replyWithHTML(
          `Your service <b>${ctx.session.service.serviceName}</b> has been registered.\nPlease finish setting up your service by /dashboard.`
        )
        .catch(() => {});
      return;
    default:
      logger.error(`Register service: Invalid step ${ctx.session.step}`);
      return;
  }

  ctx.session.step += 1;

  await ctx.replyWithHTML(message, Markup.removeKeyboard());
};

// receive service plan and register service
export const recvServicePlan = async (ctx: BotContext, serviceMode: number) => {
  const user = ctx.session.user;

  if (serviceMode === ServiceMode.Trial) {
    await showMsg4ContinueRegistration(ctx);
    return;
  }

  const config = await AdminConfig.findOne();
  if (!config || (!config.paypalInfo && !config.stripeInfo)) {
    logger.error(`Register service: BotConfig is not ready`);
    return;
  }
  let amount = getServicePlanPrice(config, serviceMode);

  amount = Math.ceil(amount * 100) / 100;

  let actionType = ActionType.RegisterService;

  if (user.role === UserRole.Customer) {
    actionType = ActionType.UpgradeToOwner;
  }

  const invoiceData: IPaymentInvoice = {
    actionType,
    serviceMode,
  };
  const buttons: (InlineKeyboardButton.CallbackButton | InlineKeyboardButton.UrlButton)[] = [];

  if (config.paypalInfo) {
    const linkData = await paypal.createPaymentLink(amount.toString(), "GBP", "Service Registration", config.paypalInfo);
    if (linkData && linkData.success) {
      invoiceData.paypal = {
        accountEmail: config.paypalInfo.accountEmail,
        accountId: config.paypalInfo.accountId,
        clientId: config.paypalInfo.clientId,
        clientSecret: config.paypalInfo.clientSecret,
        link: linkData?.link as string,
        paymentId: linkData.paymentId as string,
      };
      buttons.push(Markup.button.url("Pay by PayPal", invoiceData.paypal.link));
    }
  }

  if (config.stripeInfo) {
    const linkData = await stripe.createPaymentLink(config.stripeInfo, amount.toString(), "GBP", "Service Registration");
    if (linkData && linkData.success) {
      invoiceData.stripe = {
        accountEmail: config.stripeInfo.accountEmail,
        secretKey: config.stripeInfo.secretKey,
        requestId: linkData.requestId as string,
        link: linkData?.link as string,
        paymentId: linkData.paymentId as string,
      };
      buttons.push(Markup.button.url("Pay by Stripe", invoiceData.stripe.link));
    }
  }

  // TODO: add more payment method

  if (invoiceData.paypal || invoiceData.stripe) {
    // logger.debug(JSON.stringify(invoiceData, null, 2));

    const invoice = await PaymentInvoice.create(invoiceData);
    user.invoice = invoice._id;
    await user.save();

    let msg = "<b>Payment Invoice - Service Registration</b>\n\n";
    msg += "You can continue registration after payment.\n\n";
    msg += `<b>Amount:</b> £${amount}\n`;
    msg += `<b>Plan:</b> ${getServiceModeLabel(serviceMode)}\n`;
    msg += `<b>Duration:</b> 1 month\n\n`;
    msg += `Please select payment method to pay.\n`;

    await ctx.editMessageText(msg, {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    });
  } else {
    ctx.session.status = SessionState.None;
    await ctx.reply(`Failed to create a payment link. Please try again later.`);
  }
};
