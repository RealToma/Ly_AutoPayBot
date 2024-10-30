import { Markup } from "telegraf";
import moment from "moment";
import { escape, getButtons, time2String } from "../../helper/string_util";
import { BotContext } from "../context";
import { AdminConfig } from "../../model/AdminConfig";
import { IPaymentInvoice, PaymentInvoice } from "../../model/PaymentInvoice";
import { ActionType, ServiceMode, ServiceStatus } from "../../common/types";
import { getFeatureEnabled, getServiceModeLabel, getServicePlanPrice } from "../../common/functions";
import { logger } from "../../helper/logger";
import * as paypal from "../../helper/payment/paypal";
import * as stripe from "../../helper/payment/stripe";
import { InlineKeyboardButton } from "telegraf/typings/core/types/typegram";

export const displaySubscriptionInfo = async (ctx: BotContext, isCallbackMode: boolean) => {
  const user = ctx.session.user;

  let msg = "<b><u>Subscription information</u></b>\n\n";
  msg += `<b>Package type:</b> ${getServiceModeLabel(user.serviceMode)}\n`;
  msg += `<b>Purchase:</b> ${user.isPurchaseEnabled ? "Enabled" : "Disabled"}\n`;
  msg += `<b>Renewal:</b> ${user.isRenewEnabled ? "Enabled" : "Disabled"}\n`;
  switch (user.status) {
    case ServiceStatus.Pending:
      msg += `<b>Status:</b> Pending\n`;
      break;
    case ServiceStatus.Enabled:
      msg += `<b>Status:</b> Enabled\n`;
      break;
    case ServiceStatus.EnabledUntil:
      msg += `<b>Status:</b> Enabled (until ${time2String(user.expiresAt)})\n`;
      break;
    case ServiceStatus.Disabled:
      msg += `<b>Status:</b> Disabled\n`;
      break;
  }

  const buttons = Markup.inlineKeyboard(
    getButtons([
      [
        user.serviceMode !== ServiceMode.Trial
          ? ["Pay Your Subscription", "o_pay_service"]
          : ["Purchase Full Version", "o_pay_full_version"],
        ["Change Package Type", "o_edit_service_plan"],
      ],
      [["« Back to Dashboard", "o_dashboard"]],
    ])
  );

  if (isCallbackMode) {
    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: buttons.reply_markup }).catch(() => {});
  } else {
    await ctx.replyWithHTML(msg, buttons);
  }
};

export const payServiceFee = async (ctx: BotContext) => {
  const config = await AdminConfig.findOne();
  if (!config) {
    logger.error(`Edit service plan: config not found`);
    return;
  }

  const user = await ctx.session.user;

  // calculate total amount
  let total = 0;

  // build message
  let msg = `<b><u>Payment Invoice - Extend Subscription</u></b>\n\n`;

  let amount = getServicePlanPrice(config, user.serviceMode);
  const expiresAt = moment(user.expiresAt).add(1, "months").toDate();

  msg += `<b>${escape(user.serviceName)}</b>\n`;
  msg += `<b><i>Service mode:</i></b> ${getServiceModeLabel(user.serviceMode)}\n`;
  msg += `<b><i>Duration:</i></b> 1 month\n`;
  msg += `<b><i>Amount:</i></b> £${amount}\n`;
  msg += `<b><i>Expires at:</i></b> ${time2String(expiresAt)}\n\n`;

  total += amount;

  // logger.debug(msg);

  total = Math.ceil(total * 100) / 100;
  msg += `<b>Total amount:</b> £${total}\n\n`;
  msg += `Please select payment method to pay.\n`;

  // if (!config.paypalInfo) {
  //   await ctx.reply(`You need to pay £${total}, but the administrator does not set up a PayPal account yet.`);
  //   return;
  // }

  const invoiceData: IPaymentInvoice = { actionType: ActionType.ExtendService };
  const buttons: (InlineKeyboardButton.CallbackButton | InlineKeyboardButton.UrlButton)[] = [];

  if (config.paypalInfo) {
    const linkData = await paypal.createPaymentLink(total.toString(), "GBP", "Extend Subscription", config.paypalInfo);
    if (linkData?.success) {
      invoiceData.paypal = {
        accountEmail: config.paypalInfo.accountEmail,
        accountId: config.paypalInfo.accountId,
        clientId: config.paypalInfo.clientId,
        clientSecret: config.paypalInfo.clientSecret,
        link: linkData.link as string,
        paymentId: linkData.paymentId as string,
      };
      buttons.push(Markup.button.url("Pay by PayPal", invoiceData.paypal.link));
    }
  }

  if (config.stripeInfo) {
    const linkData = await stripe.createPaymentLink(config.stripeInfo, total.toString(), "GBP", "Extend Subscription");
    if (linkData?.success) {
      invoiceData.stripe = {
        accountEmail: config.stripeInfo.accountEmail,
        secretKey: config.stripeInfo.secretKey,
        requestId: linkData.requestId as string,
        link: linkData.link as string,
        paymentId: linkData.paymentId as string,
      };
      buttons.push(Markup.button.url("Pay by Stripe", invoiceData.stripe.link));
    }
  }

  buttons.push(Markup.button.callback("« Back", "o_manage_subscription"));

  if (invoiceData.paypal || invoiceData.stripe) {
    logger.debug(JSON.stringify(invoiceData, null, 2));
    const invoice = await PaymentInvoice.create(invoiceData);

    user.invoice = invoice._id;
    await user.save();

    await ctx
      .editMessageText(msg, {
        parse_mode: "HTML",
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
      })
      .catch(() => {});
  } else {
    await ctx.reply(`Failed to create a payment link. Please try again later.`);
  }
};

export const showMsg4FullVersion = async (ctx: BotContext) => {
  const user = ctx.session.user;

  if (user.serviceMode !== ServiceMode.Trial) {
    await ctx.editMessageText("You have already purchased full version.").catch(() => {});
    return;
  }

  const config = await AdminConfig.findOne();
  if (!config) {
    logger.error(`Purchase full version: config not found`);
    return;
  }

  const buttons = getButtons([
    [[`Reminders only (£${config.readServiceCost})`, "o_purchase_service_plan_0"]],
    [[`Purchase New Subscriptions only (£${config.purchaseServiceCost})`, "o_purchase_service_plan_1"]],
    [[`Renewals only (£${config.renewalServiceCost})`, "o_purchase_service_plan_2"]],
    [[`Purchase New and Renew (£${config.allServicesCost}) Discounted`, "o_purchase_service_plan_3"]],
    [["« Back", "o_manage_subscription"]],
  ]);

  let message = "Thank you for your purchase to full version.\n";
  message += "Please select a service plan.\n";

  await ctx.editMessageText(message, Markup.inlineKeyboard(buttons)).catch(() => {});
};

export const purchaseServicePlan = async (ctx: BotContext, mode: number) => {
  const user = ctx.session.user;

  if (user.serviceMode !== ServiceMode.Trial) {
    logger.error(`purchaseServicePlan: user already purchased ${user.userId}`);
    return;
  }

  const config = await AdminConfig.findOne();
  if (!config) {
    logger.error(`Edit service plan: config not found`);
    return;
  }

  const amount = getServicePlanPrice(config, mode);

  // if (!config.paypalInfo) {
  //   await ctx.reply(`You need to pay £${amount} to purchase full service, but the administrator does not set up a PayPal account yet.`);
  //   return;
  // }

  const invoiceData: IPaymentInvoice = {
    actionType: ActionType.PurchasePlan,
    serviceMode: mode,
  };

  const buttons: (InlineKeyboardButton.CallbackButton | InlineKeyboardButton.UrlButton)[] = [];

  if (config.paypalInfo) {
    const linkData = await paypal.createPaymentLink(amount.toString(), "GBP", "Purchase Service", config.paypalInfo);
    if (linkData?.success) {
      invoiceData.paypal = {
        accountEmail: config.paypalInfo.accountEmail,
        accountId: config.paypalInfo.accountId,
        clientId: config.paypalInfo.clientId,
        clientSecret: config.paypalInfo.clientSecret,
        link: linkData.link as string,
        paymentId: linkData.paymentId as string,
      };
      buttons.push(Markup.button.url("Pay by PayPal", invoiceData.paypal.link));
    }
  }

  if (config.stripeInfo) {
    const linkData = await stripe.createPaymentLink(config.stripeInfo, amount.toString(), "GBP", "Purchase Service");
    if (linkData?.success) {
      invoiceData.stripe = {
        accountEmail: config.stripeInfo.accountEmail,
        secretKey: config.stripeInfo.secretKey,
        requestId: linkData.requestId as string,
        link: linkData.link as string,
        paymentId: linkData.paymentId as string,
      };
      buttons.push(Markup.button.url("Pay by Stripe", invoiceData.stripe.link));
    }
  }

  buttons.push(Markup.button.callback("« Back", "o_manage_subscription"));

  if (invoiceData.paypal || invoiceData.stripe) {
    const invoice = await PaymentInvoice.create(invoiceData);

    user.invoice = invoice._id;
    await user.save();

    const expiresAt = moment.utc().add(1, "months").toDate();

    let msg = "<b>Payment Invoice - Purchase Service</b>\n\n";
    msg += "Thank you for using our service. You can use full functionality after paying service fee.\n\n";
    msg += `<b>Amount:</b> £${amount}\n`;
    msg += `<b>Service Plan:</b> ${getServiceModeLabel(mode)}\n`;
    msg += `<b>Expires At:</b> ${time2String(expiresAt)}\n\n`;
    msg += `Please select payment method to pay.\n`;

    await ctx
      .editMessageText(msg, {
        parse_mode: "HTML",
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
      })
      .catch(() => {});
  } else {
    await ctx.reply(`Failed to create a payment link. Please try again later.`);
  }
};

export const showMsg4ServicePlan = async (ctx: BotContext) => {
  const user = ctx.session.user;

  if (user.serviceMode === ServiceMode.Trial) {
    await ctx
      .editMessageText(
        "You can't change service mode during trial mode.\n",
        Markup.inlineKeyboard([Markup.button.callback("« Back", "o_manage_subscription")])
      )
      .catch(() => {});
    return;
  }

  const config = await AdminConfig.findOne();
  if (!config) {
    logger.error(`Edit service plan: config not found`);
    return;
  }

  const buttons = getButtons([
    [[`Reminders only (£${config.readServiceCost})`, "o_set_service_plan_0"]],
    [[`Purchase New Subscriptions only (£${config.purchaseServiceCost})`, "o_set_service_plan_1"]],
    [[`Renewals only (£${config.renewalServiceCost})`, "o_set_service_plan_2"]],
    [[`Purchase New and Renew (£${config.allServicesCost}) Discounted`, "o_set_service_plan_3"]],
    [["« Back", "o_manage_subscription"]],
  ]);

  let message = "Please select the new service plan.\n";
  message += "⚠️ Changing the service plan may make additional payment.\n";

  await ctx.editMessageText(message, Markup.inlineKeyboard(buttons)).catch(() => {});
};

export const setServicePlan = async (ctx: BotContext, mode: number) => {
  const serviceId = ctx.session.curServiceId;

  const user = ctx.session.user;

  const config = await AdminConfig.findOne();
  if (!config) {
    logger.error(`Edit service plan: config not found`);
    return;
  }

  const oldPrice = getServicePlanPrice(config, user.serviceMode);
  const newPrice = getServicePlanPrice(config, mode);

  if (newPrice > oldPrice && user.status === ServiceStatus.EnabledUntil) {
    if (!user.expiresAt) {
      logger.error("Expire time not set");
      return;
    }

    // send additional cost
    let diff = user.expiresAt.getTime() - new Date().getTime();
    diff = Math.floor(diff / (1000 * 60 * 60 * 24));
    const amount = Math.ceil(((newPrice - oldPrice) / 30) * diff * 100) / 100;

    if (amount > 0) {
      if (!config.paypalInfo) {
        await ctx.reply(
          `You need to pay £${amount} to upgrade the service mode, but the administrator does not set up a PayPal account yet.`
        );
        return;
      }

      const invoiceData: IPaymentInvoice = {
        actionType: ActionType.ChangeServiceMode,
        serviceMode: mode,
        serviceId: serviceId,
      };

      const buttons: (InlineKeyboardButton.CallbackButton | InlineKeyboardButton.UrlButton)[] = [];

      if (config.paypalInfo) {
        const linkData = await paypal.createPaymentLink(amount.toString(), "GBP", "Service Upgrade", config.paypalInfo);
        if (linkData?.success) {
          invoiceData.paypal = {
            accountEmail: config.paypalInfo.accountEmail,
            accountId: config.paypalInfo.accountId,
            clientId: config.paypalInfo.clientId,
            clientSecret: config.paypalInfo.clientSecret,
            link: linkData.link as string,
            paymentId: linkData.paymentId as string,
          };
          buttons.push(Markup.button.url("Pay by PayPal", invoiceData.paypal.link));
        }
      }

      if (config.stripeInfo) {
        const linkData = await stripe.createPaymentLink(config.stripeInfo, amount.toString(), "GBP", "Service Upgrade");
        if (linkData?.success) {
          invoiceData.stripe = {
            accountEmail: config.stripeInfo.accountEmail,
            secretKey: config.stripeInfo.secretKey,
            requestId: linkData.requestId as string,
            link: linkData.link as string,
            paymentId: linkData.paymentId as string,
          };
          buttons.push(Markup.button.url("Pay by Stripe", invoiceData.stripe.link));
        }
      }

      buttons.push(Markup.button.callback("« Back", "o_manage_subscription"));

      if (invoiceData.paypal || invoiceData.stripe) {
        const invoice = await PaymentInvoice.create(invoiceData);

        user.invoice = invoice._id;
        await user.save();

        let msg = "<b>Payment Invoice - Plan Upgrade</b>\n\n";
        msg += "New service plan requires more fees compared to the current one. You have to pay extra fees to upgrade.\n\n";
        msg += `<b>Amount:</b> £${amount}\n`;
        msg += `<b>Current Plan:</b> ${getServiceModeLabel(user.serviceMode)}\n`;
        msg += `<b>New Plan:</b> ${getServiceModeLabel(mode)}\n`;
        msg += `<b>Expires At:</b> ${time2String(user.expiresAt)}\n\n`;
        msg += `Please select payment method to pay.\n`;

        await ctx
          .editMessageText(msg, {
            parse_mode: "HTML",
            reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
          })
          .catch(() => {});
      } else {
        await ctx.reply(`Failed to create a payment link. Please try again later.`);
      }
    }
  } else {
    // no need to pay - update directly
    user.serviceMode = mode;
    [user.isPurchaseEnabled, user.isRenewEnabled] = getFeatureEnabled(mode);

    await user.save();

    await displaySubscriptionInfo(ctx, true);
  }
};
