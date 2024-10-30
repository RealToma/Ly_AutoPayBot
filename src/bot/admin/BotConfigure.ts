import { Markup } from "telegraf";

import { BOT_NAME } from "../../common/string";
import { logger } from "../../helper/logger";
import { escape, reduceTo, getButtons, isValidEmail } from "../../helper/string_util";
import { AdminConfig } from "../../model/AdminConfig";
import { BotContext } from "../context";
import * as paypal from "../../helper/payment/paypal";
import * as stripe from "../../helper/payment/stripe";
import * as crypto from "../../helper/payment/crypto";
import { clearCallbackButton } from "../../helper/misc";
import { SessionState } from "../../common/types";

export const displayAdminPanel = async (ctx: BotContext, submenu: string, isCallbackMode: boolean) => {
  let config = await AdminConfig.findOne();
  if (!config) {
    config = await AdminConfig.create({
      readServiceCost: 10,
      purchaseServiceCost: 25,
      renewalServiceCost: 25,
      allServicesCost: 40,
    });
  }

  let message = `Administration Panel of ${BOT_NAME}\n\n`;
  message += `<b>Service costs:</b>\n`;
  message += `  <b>Reminders Only:</b> £${config.readServiceCost}\n`;
  message += `  <b>Purchase:</b> £${config.purchaseServiceCost}\n`;
  message += `  <b>Renewal:</b> £${config.renewalServiceCost}\n`;
  message += `  <b>All:</b> £${config.allServicesCost}\n\n`;

  message += `<b>PayPal account:</b>${config.paypalInfo?.isValid ? "" : "⚠️"}\n`;
  if (config.paypalInfo) {
    message += `  <b>Email:</b> ${escape(config.paypalInfo.accountEmail)}\n`;
    message += `  <b>Merchant ID:</b> ${escape(config.paypalInfo.accountId)}\n`;
    message += `  <b>Client ID:</b> ${escape(reduceTo(config.paypalInfo.clientId, 30))}\n`;
    message += `  <b>Client Secret:</b> ${escape(reduceTo(config.paypalInfo.clientSecret, 30))}\n`;
  } else {
    message += `  Not set\n`;
  }
  message += `\n`;

  message += `<b>Stripe account:</b>${config.stripeInfo?.isValid ? "" : "⚠️"}\n`;
  if (config.stripeInfo) {
    message += `  <b>Email:</b> ${escape(config.stripeInfo.accountEmail)}\n`;
    message += `  <b>API key:</b> ${escape(reduceTo(config.stripeInfo.secretKey, 30))}\n`;
  } else {
    message += `  Not set\n`;
  }
  message += `\n`;

  message += `<b>Crypto account:</b>${config.cryptoInfo?.isValid ? "" : "⚠️"}\n`;
  if (config.cryptoInfo) {
    message += `  <b>Network:</b> ${escape(config.cryptoInfo.network)}\n`;
    message += `  <b>Address:</b> ${escape(reduceTo(config.cryptoInfo.address, 30))}\n`;
  } else {
    message += `  Not set\n`;
  }
  message += `\n`;

  let btnLabels: [string, string][][] = [];

  if (submenu === "main") {
    btnLabels = [
      [
        ["Set PayPal Account", "a_edit_paypal"],
        ["Set Stripe Account", "a_edit_stripe"],
        ["Set Crypto Account", "a_edit_crypto"],
      ],
      [["Set Service Cost", "a_edit_cost"]],
    ];
  } else if (submenu === "cost") {
    btnLabels = [
      [
        ["Reminders Only", "a_set_Read_Only_cost"],
        ["Purchase only", "a_set_Purchase_Only_cost"],
      ],
      [
        ["Renewal only", "a_set_Renewal_Only_cost"],
        ["Both", "a_set_Purchase_and_Renewal_cost"],
      ],
      [["« Back", "a_dashboard"]],
    ];
  } else if (submenu === "paypal") {
    btnLabels = [
      [
        ["Email", "a_set_paypal_email"],
        ["Merchant Id", "a_set_paypal_merchant_ID"],
      ],
      [
        ["Client Id", "a_set_paypal_client_ID"],
        ["Client Secret", "a_set_paypal_client_secret"],
      ],
      [["« Back", "a_dashboard"]],
    ];
  } else if (submenu === "stripe") {
    btnLabels = [
      [
        ["Email", "a_set_stripe_email"],
        ["API key", "a_set_stripe_API_key"],
      ],
      [["« Back", "a_dashboard"]],
    ];
  } else if (submenu === "crypto") {
    btnLabels = [
      [
        ["Network", "a_set_crypto_network"],
        ["Address", "a_set_crypto_address"]
      ],
      [["« Back", "a_dashboard"]]
    ];
  }

  ctx.session.status = SessionState.None;

  const buttons = getButtons(btnLabels);

  if (isCallbackMode) {
    ctx
      .editMessageText(message, {
        parse_mode: "HTML",
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
      })
      .catch(() => {});
  } else {
    ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons));
  }
};

export const showMsg4PayPalAccount = async (ctx: BotContext) => {
  ctx.session.status = SessionState.EditAdminPayPalEmail;

  const buttons = getButtons([[["« Back", "a_edit_paypal"]]]);

  await ctx
    .editMessageText(
      "Please enter email of your PayPal account.\nThis account is used to receive payments from the service owners",
      Markup.inlineKeyboard(buttons)
    )
    .catch(() => {});
};

export const setPayPalAccount = async (ctx: BotContext, email: string) => {
  if (!isValidEmail(email)) {
    await ctx.reply("Please enter a valid email address");
    return;
  }
  const config = await AdminConfig.findOne();
  if (!config) {
    logger.error("Admin config not found");
    return;
  }
  // config.paypalAccount = email;
  await config.save();
  await displayAdminPanel(ctx, "main", false);
};

export const showMsg4ServiceCost = async (ctx: BotContext, type: string) => {
  ctx.session.status = SessionState.EditServiceCost;
  ctx.session.fieldName = type;

  const buttons = getButtons([[["« Back", "a_edit_cost"]]]);
  let label = escape(type.replace(/_/g, " "));
  await ctx
    .editMessageText(`Please enter the service cost of the plan - <b>${label}</b>\n`, {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    })
    .catch(() => {});
};

export const setServiceCost = async (ctx: BotContext, text: string) => {
  const value = parseFloat(text);

  if (isNaN(value)) {
    await ctx.reply("Please enter a valid number");
    return;
  }

  const config = await AdminConfig.findOne();
  if (!config) {
    logger.error("Admin config not found");
    return;
  }

  await clearCallbackButton(ctx);

  switch (ctx.session.fieldName) {
    case "Read_Only":
      config.readServiceCost = value;
      break;
    case "Purchase_Only":
      config.purchaseServiceCost = value;
      break;
    case "Renewal_Only":
      config.renewalServiceCost = value;
      break;
    case "Purchase_and_Renewal":
      config.allServicesCost = value;
      break;
    default:
      logger.error("Invalid field name");
      return;
  }

  await config.save();

  await displayAdminPanel(ctx, "cost", false);
};

export const showMsg4PaypalInfo = async (ctx: BotContext, type: string) => {
  ctx.session.status = SessionState.EditAdminPayPalInfo;
  ctx.session.fieldName = type;
  let label = escape(type.replace(/_/g, " "));
  const buttons = getButtons([[["« Back", "a_edit_paypal"]]]);
  await ctx
    .editMessageText(`Please enter the ${label} of your PayPal account.\n`, {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    })
    .catch(() => {});
};

export const setAdminPayPalInfo = async (ctx: BotContext, text: string) => {
  const config = await AdminConfig.findOne();
  if (!config) {
    logger.error("Admin config not found");
    return;
  }

  if (!config.paypalInfo) {
    config.paypalInfo = {
      accountId: "",
      accountEmail: "",
      clientId: "",
      clientSecret: "",
      isValid: false,
    };
  }

  await clearCallbackButton(ctx);

  switch (ctx.session.fieldName) {
    case "email":
      config.paypalInfo.accountEmail = text;
      break;
    case "merchant_ID":
      config.paypalInfo.accountId = text;
      break;
    case "client_ID":
      config.paypalInfo.clientId = text;
      break;
    case "client_secret":
      config.paypalInfo.clientSecret = text;
      break;
    default:
      logger.error("Invalid field name");
      return;
  }

  if (
    config.paypalInfo.accountEmail === "" ||
    config.paypalInfo.accountId === "" ||
    config.paypalInfo.clientId === "" ||
    config.paypalInfo.clientSecret === ""
  ) {
    config.paypalInfo.isValid = false;
  } else {
    config.paypalInfo.isValid = await paypal.validatePaymentInfo(config.paypalInfo);
  }

  await config.save();

  await displayAdminPanel(ctx, "paypal", false);
};

export const showMsg4StripeInfo = async (ctx: BotContext, type: string) => {
  ctx.session.status = SessionState.EditAdminStripeInfo;
  ctx.session.fieldName = type;
  let label = escape(type.replace(/_/g, " "));
  const buttons = getButtons([[["« Back", "a_edit_stripe"]]]);
  await ctx
    .editMessageText(`Please enter the ${label} of your Stripe account.\n`, {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    })
    .catch(() => {});
};

export const setAdminStripeInfo = async (ctx: BotContext, text: string) => {
  const config = await AdminConfig.findOne();
  if (!config) {
    logger.error("Admin config not found");
    return;
  }

  if (!config.stripeInfo) {
    config.stripeInfo = {
      accountEmail: "",
      secretKey: "",
      isValid: false,
    };
  }

  await clearCallbackButton(ctx);

  switch (ctx.session.fieldName) {
    case "email":
      config.stripeInfo.accountEmail = text;
      break;
    case "API_key":
      config.stripeInfo.secretKey = text;
      break;
    default:
      logger.error("Invalid field name");
      return;
  }

  config.stripeInfo.isValid = await stripe.validateApiInfo(config.stripeInfo);

  await config.save();

  await displayAdminPanel(ctx, "stripe", false);
};

export const showMsg4CryptoInfo = async (ctx: BotContext, type: string) => {
  ctx.session.status = SessionState.EditAdminCryptoInfo;
  ctx.session.fieldName = type;
  let label = escape(type.replace(/_/g, " "));
  const buttons = getButtons([[["« Back", "a_edit_crypto"]]]);
  await ctx
    .editMessageText(`Please enter the ${label} of your Crypto account.\n`, {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
    })
    .catch(() => {});
};

export const setAdminCryptoInfo = async (ctx: BotContext, text: string) => {
  const config = await AdminConfig.findOne();
  if (!config) {
    logger.error("Admin config not found");
    return;
  }

  if (!config.cryptoInfo) {
    config.cryptoInfo = {
      network: "1",
      address: "",
      isValid: false,
    };
  }

  await clearCallbackButton(ctx);

  switch (ctx.session.fieldName) {
    case "network":
      config.cryptoInfo.network = text;
      break;
    case "address":
      config.cryptoInfo.address = text;
      break;
    default:
      logger.error("Invalid field name");
      return;
  }

  config.cryptoInfo.isValid = await crypto.validateApiInfo(config.cryptoInfo);

  await config.save();

  await displayAdminPanel(ctx, "crypto", false);
};