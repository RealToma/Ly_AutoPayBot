import { Markup } from "telegraf";
import { logger } from "../../helper/logger";
import { escape, getButtons, reduceTo } from "../../helper/string_util";
import { PaymentGateway } from "../../model/PaymentGateway";
import { getOwnerProfile } from "../../model/User";
import { BotContext } from "../context";
import * as paypal from "../../helper/payment/paypal";
import * as stripe from "../../helper/payment/stripe";
import { clearCallbackButton } from "../../helper/misc";
import { SessionState } from "../../common/types";

export const displayPaymentMethods = async (ctx: BotContext, isCallbackMode: boolean) => {
  const user = await getOwnerProfile(ctx.chat?.id as number);

  if (!user) {
    logger.error(`Manage payment: user not found(${ctx.chat?.id})`);
    return;
  }
  if (!user.paymentGateway) {
    logger.error(`Manage payment: payment methods are undefined(${ctx.chat?.id})`);
    return;
  }

  let message = "Select a payment method to edit or add a new one.";

  const buttons = [
    [Markup.button.callback("Add payment method", "o_new_payment_gateway"), Markup.button.callback("« Back to dashboard", "o_dashboard")],
  ];

  // TODO: add more payment methods
  if (user.paymentGateway.stripe) {
    buttons.unshift([Markup.button.callback(`Stripe ${user.paymentGateway.stripe.isValid ? "" : "⚠️"}`, "o_edit_stripe")]);
  }

  if (user.paymentGateway.paypal) {
    buttons.unshift([Markup.button.callback(`PayPal ${user.paymentGateway.paypal.isValid ? "" : "⚠️"}`, "o_edit_paypal")]);
  }

  ctx.session.status = SessionState.None;

  if (isCallbackMode) {
    await ctx.editMessageText(message, Markup.inlineKeyboard(buttons)).catch(() => {});
  } else {
    await ctx.reply(message, Markup.inlineKeyboard(buttons));
  }
};

export const showMsg4NewPaymentGateway = async (ctx: BotContext) => {
  const buttons = [Markup.button.callback("« Back to payments", "o_manage_payment")];

  // TODO: add more payment methods
  buttons.unshift(Markup.button.callback("Stripe", "o_add_stripe"));
  buttons.unshift(Markup.button.callback("PayPal", "o_add_paypal"));

  await ctx.editMessageText("Please select type of the payment gateway.", Markup.inlineKeyboard(buttons, { columns: 1 })).catch(() => {});
};

//////////////////////////////////////////////////////////////////////////////
// PayPal

export const showMsg4NewPayPal = async (ctx: BotContext) => {
  const paymentGateway = await PaymentGateway.findOne({
    ownerId: ctx.chat?.id,
  });

  if (!paymentGateway) {
    logger.error(`Add paypal: no payment gateway record(${ctx.chat?.id})`);
    return;
  }

  if (paymentGateway.paypal) {
    const buttons = [Markup.button.callback("« Back to payments", "o_manage_payment")];
    await ctx.editMessageText("You have already added a PayPal API.", Markup.inlineKeyboard(buttons, { columns: 1 })).catch(() => {});
    return;
  }

  await ctx.editMessageText("Let's add PayPal gateway to your service.").catch(() => {});

  paymentGateway.paypal = {
    clientId: "",
    clientSecret: "",
    accountId: "",
    accountEmail: "",
    isValid: false,
  };

  ctx.session.paymentGateway = paymentGateway;

  ctx.session.status = SessionState.ReceivePayPalInfo;
  ctx.session.step = 0;

  await ctx.reply("Please enter the email of your account");
};

export const recvNewPayPalInfo = async (ctx: BotContext, value: string) => {
  if (!ctx.session.paymentGateway.paypal) {
    logger.error("Receive PayPal info: undefined object");
    return;
  }
  let message = "";
  switch (ctx.session.step) {
    case 0:
      ctx.session.paymentGateway.paypal.accountEmail = value;
      message = "Please enter your merchant ID";
      break;
    case 1:
      ctx.session.paymentGateway.paypal.accountId = value;
      message = "Please enter your API client ID";
      break;
    case 2:
      ctx.session.paymentGateway.paypal.clientId = value;
      message = "Please enter your API client secret";
      break;
    case 3:
      ctx.session.paymentGateway.paypal.clientSecret = value;
      // save payment data
      const isValid = await paypal.validatePaymentInfo(ctx.session.paymentGateway.paypal);

      if (isValid) {
        ctx.session.paymentGateway.countEnabled += 1;
      }
      ctx.session.paymentGateway.paypal.isValid = isValid;

      await PaymentGateway.findOneAndUpdate({ ownerId: ctx.session.paymentGateway.ownerId }, ctx.session.paymentGateway);

      ctx.session.status = SessionState.None;

      // const buttons = [
      //   Markup.button.callback("« Back to payments", "o_manage_payment"),
      //   Markup.button.callback("« Back to dashboard", "o_dashboard"),
      // ];

      await ctx.reply(
        `Added PayPal information successfully.`
        // Markup.inlineKeyboard(buttons, { columns: 2 })
      );
      // await displayPayPalInfo(ctx, false);
      await displayPaymentMethods(ctx, false);
      return;
    default:
      logger.error(`Receive PayPal info: invalid step ${ctx.session.step}`);
      break;
  }
  ctx.session.step += 1;
  await ctx.reply(message, Markup.removeKeyboard());
};

export const displayPayPalInfo = async (ctx: BotContext, isCallbackMode: boolean) => {
  const paymentGateway = await PaymentGateway.findOne({
    ownerId: ctx.chat?.id,
  });
  if (!paymentGateway) {
    logger.error(`Manage payment: payment methods are undefined(${ctx.chat?.id})`);
    return;
  }

  const info = paymentGateway.paypal;

  if (!info) {
    logger.error(`PayPal info is not defined: (${ctx.chat?.id})`);
    return;
  }

  let message = "<b>PayPal Configuration</b>\n\n";

  message += `<pre>`;
  message += `Email: ${escape(info.accountEmail)}\n`;
  message += `Merchant ID: ${escape(info.accountId)}\n`;
  message += `API client ID: ${escape(reduceTo(info.clientId, 30))}\n`;
  message += `API client secret: ${escape(reduceTo(info.clientSecret, 30))}\n`;
  message += `</pre>\n\n`;

  if (!info.isValid) {
    message += `⚠️ Configuration is invalid.\nYou can't use this method until you fix configuration issue.`;
  }

  const buttons = [
    Markup.button.callback("Edit email", "o_edit_paypal_account_email"),
    Markup.button.callback("Edit merchant ID", "o_edit_paypal_account_id"),
    Markup.button.callback("Edit client ID", "o_edit_paypal_client_id"),
    Markup.button.callback("Edit client secret", "o_edit_paypal_client_secret"),
    Markup.button.callback("« Back to payments", "o_manage_payment"),
  ];

  ctx.session.status = SessionState.None;

  if (isCallbackMode) {
    await ctx
      .editMessageText(message, {
        reply_markup: Markup.inlineKeyboard(buttons, { columns: 2 }).reply_markup,
        parse_mode: "HTML",
      })
      .catch(() => {});
  } else {
    await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons, { columns: 2 }));
  }
};

export const showMsg4EditPayPal = async (ctx: BotContext, fieldName: string) => {
  ctx.session.status = SessionState.EditPayPalInfo;
  ctx.session.fieldName = fieldName;

  let label = fieldName.replace("account", "merchant");

  const buttons = getButtons([[["« Back", "o_edit_paypal"]]]);
  await ctx
    .editMessageText(`Please input the ${label.replace(/_/g, " ")} of your PayPal account.`, Markup.inlineKeyboard(buttons))
    .catch(() => {});
};

export const setPayPalInfo = async (ctx: BotContext, value: string) => {
  const fieldName = ctx.session.fieldName;
  let paymentGateway = await PaymentGateway.findOne({
    ownerId: ctx.chat?.id,
  });
  if (!paymentGateway) {
    logger.error(`Edit ${fieldName}: payment gateway not found(${ctx.chat?.id})`);
    return;
  }

  if (!paymentGateway.paypal) {
    logger.error(`Edit ${fieldName}: PayPal information is not defined(${ctx.chat?.id})`);
    return;
  }

  if (fieldName === "account_id") {
    paymentGateway.paypal.accountId = value;
  } else if (fieldName === "account_email") {
    paymentGateway.paypal.accountEmail = value;
  } else if (fieldName === "client_id") {
    paymentGateway.paypal.clientId = value;
  } else if (fieldName === "client_secret") {
    paymentGateway.paypal.clientSecret = value;
  }

  if (paymentGateway.paypal.isValid) {
    paymentGateway.countEnabled -= 1;
  }

  const isValid = await paypal.validatePaymentInfo(paymentGateway.paypal);

  paymentGateway.paypal.isValid = isValid;
  if (isValid) {
    paymentGateway.countEnabled += 1;
  }

  logger.debug(`Update PayPal API: owner - ${ctx.chat?.id}\n${JSON.stringify(paymentGateway, null, 2)}`);

  await paymentGateway.save();

  await clearCallbackButton(ctx);

  await displayPayPalInfo(ctx, false);
};

//////////////////////////////////////////////////////////////////////////////
// Stripe
export const showMsg4NewStripe = async (ctx: BotContext) => {
  const paymentGateway = await PaymentGateway.findOne({
    ownerId: ctx.chat?.id,
  });

  if (!paymentGateway) {
    logger.error(`Add Stripe: no payment gateway record(${ctx.chat?.id})`);
    return;
  }

  if (paymentGateway.stripe) {
    const buttons = [Markup.button.callback("« Back to payments", "o_manage_payment")];
    await ctx.editMessageText("You have already added a Stripe API.", Markup.inlineKeyboard(buttons, { columns: 1 })).catch(() => {});
    return;
  }

  await ctx.editMessageText("Let's add Stripe API to your service.").catch(() => {});

  paymentGateway.stripe = {
    accountEmail: "",
    secretKey: "",
    isValid: false,
  };

  ctx.session.paymentGateway = paymentGateway;

  ctx.session.step = 0;
  ctx.session.status = SessionState.ReceiveStripeInfo;

  await ctx.reply("Please enter the email of your account");
};

export const recvNewStripeInfo = async (ctx: BotContext, value: string) => {
  if (!ctx.session.paymentGateway.stripe) {
    logger.error("Receive Stripe info: undefined object");
    return;
  }
  let message = "";
  switch (ctx.session.step) {
    case 0:
      ctx.session.paymentGateway.stripe.accountEmail = value;
      message = "Please enter the API key of your account.";
      break;
    case 1:
      ctx.session.paymentGateway.stripe.secretKey = value;
      // save payment data
      const isValid = await stripe.validateApiInfo(ctx.session.paymentGateway.stripe);

      if (isValid) {
        ctx.session.paymentGateway.countEnabled += 1;
      }
      ctx.session.paymentGateway.stripe.isValid = isValid;

      logger.debug(JSON.stringify(ctx.session.paymentGateway));

      await PaymentGateway.findOneAndUpdate({ ownerId: ctx.session.paymentGateway.ownerId }, ctx.session.paymentGateway);

      ctx.session.status = SessionState.None;

      await ctx.reply(`Added Stripe information successfully.`);
      await displayPaymentMethods(ctx, false);
      return;
    default:
      logger.error(`Receive Stripe info: invalid step ${ctx.session.step}`);
      break;
  }
  ctx.session.step += 1;
  await ctx.reply(message, Markup.removeKeyboard());
};

export const displayStripeInfo = async (ctx: BotContext, isCallbackMode: boolean) => {
  const paymentGateway = await PaymentGateway.findOne({
    ownerId: ctx.chat?.id,
  });
  if (!paymentGateway) {
    logger.error(`Manage payment: payment methods are undefined(${ctx.chat?.id})`);
    return;
  }

  const info = paymentGateway.stripe;

  if (!info) {
    logger.error(`Stripe info is not defined: (${ctx.chat?.id})`);
    return;
  }

  let message = "<b>Stripe Configuration</b>\n\n";

  message += `<pre>`;
  message += `API key: ${escape(info.accountEmail)}\n`;
  message += `API key: ${escape(reduceTo(info.secretKey, 30))}\n`;
  message += `</pre>\n\n`;

  if (!info.isValid) {
    message += `⚠️ Configuration is invalid.\nYou can't use this method until you fix configuration issue.`;
  }

  const buttons = [
    Markup.button.callback("Edit email", "o_edit_stripe_email"),
    Markup.button.callback("Edit API key", "o_edit_stripe_API_key"),
    Markup.button.callback("« Back to payments", "o_manage_payment"),
  ];

  ctx.session.status = SessionState.None;

  if (isCallbackMode) {
    await ctx
      .editMessageText(message, {
        reply_markup: Markup.inlineKeyboard(buttons, { columns: 2 }).reply_markup,
        parse_mode: "HTML",
      })
      .catch(() => {});
  } else {
    await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons, { columns: 2 }));
  }
};

export const showMsg4EditStripe = async (ctx: BotContext, fieldName: string) => {
  ctx.session.status = SessionState.EditStripeInfo;
  ctx.session.fieldName = fieldName;

  let label = fieldName.replace(/_/g, " ");

  const buttons = getButtons([[["« Back", "o_edit_stripe"]]]);
  await ctx.editMessageText(`Please input the ${label} of your Stripe account.`, Markup.inlineKeyboard(buttons)).catch(() => {});
};

export const setStripeInfo = async (ctx: BotContext, value: string) => {
  const fieldName = ctx.session.fieldName;
  let paymentGateway = await PaymentGateway.findOne({
    ownerId: ctx.chat?.id,
  });
  if (!paymentGateway) {
    logger.error(`Edit ${fieldName}: payment gateway not found(${ctx.chat?.id})`);
    return;
  }

  if (!paymentGateway.stripe) {
    logger.error(`Edit ${fieldName}: Stripe information is not defined(${ctx.chat?.id})`);
    return;
  }

  if (fieldName === "email") {
    paymentGateway.stripe.accountEmail = value;
  } else if (fieldName === "API_key") {
    paymentGateway.stripe.secretKey = value;
  }

  if (paymentGateway.stripe.isValid) {
    paymentGateway.countEnabled -= 1;
  }

  const isValid = await stripe.validateApiInfo(paymentGateway.stripe);

  paymentGateway.stripe.isValid = isValid;
  if (isValid) {
    paymentGateway.countEnabled += 1;
  }

  logger.debug(`Update Stripe API: owner - ${ctx.chat?.id}\n${JSON.stringify(paymentGateway, null, 2)}`);

  await paymentGateway.save();

  await clearCallbackButton(ctx);

  await displayStripeInfo(ctx, false);
};
