import { Markup, Telegraf } from "telegraf";

import { BotContext } from "../bot/context";
import { logger } from "../helper/logger";
import { createUserLine, ILineInfo, renewUserLine } from "../helper/panel_client";
import * as paypal from "../helper/payment/paypal";
import * as stripe from "../helper/payment/stripe";
import { Order } from "../model/Order";
import { IService, Service } from "../model/Service";
import { User } from "../model/User";
import moment from "moment";
import { time2String } from "../helper/string_util";
import { IPaymentInvoice, PaymentInvoice } from "../model/PaymentInvoice";
import { ActionType, OrderState, ServiceMode, ServiceStatus } from "../common/types";
import { Types } from "mongoose";
import { getFeatureEnabled, getServiceModeLabel } from "../common/functions";

export interface IPaymentCallbackParams {
  method: string;
  paypal: {
    payerId: string;
    paymentId: string;
  };
  stripe: {
    requestId: string;
  };
}

const finializeCustomerOrder = async (bot: Telegraf<BotContext>, invoice: IPaymentInvoice & { _id: Types.ObjectId }) => {
  // find order based on payment id
  const order = await Order.findOne({ invoice: invoice._id }).populate<{
    service: IService;
  }>(["service", "invoice"]);

  if (!order) {
    logger.error(`Pay callback: order not found`);
    return false;
  }

  let data: { result: boolean; detail?: ILineInfo } | undefined;

  if (invoice.actionType === ActionType.RenewOrder) {
    if (!order.detail || !order.detail.packageId) {
      logger.error(`Renew order: detail info not exist ${order._id}`);
      return false;
    }
    data = await renewUserLine(order.service, order.detail.lineId, order.detail.packageId);
  } else {
    if (!invoice.username || !invoice.password || !invoice.packageId) {
      logger.error(`Purchase order: invoice data is incorrect ${invoice}`);
      return false;
    }
    data = await createUserLine(order.service, invoice.username, invoice.password, invoice.packageId);
  }

  order.status = OrderState.Paid;

  // failed to send purchase request
  if (!data) {
    await order.save();
    await bot.telegram.sendMessage(order.userId, "Failed to send purchase request");
    return false;
  }

  // purchase success
  if (data.result) {
    const detail = data.detail;

    if (detail) {
      detail.packageId = invoice.packageId;
      detail.packageTitle = invoice.packageTitle;
    }

    order.status = OrderState.Success;
    order.detail = detail;
    if (order.detail) {
      order.detail.packageTitle =
        order.service.plans.find((plan) => plan.originalId === invoice.packageId)?.panelTitle || order.detail.packageTitle;
    }

    await order.save();

    let msg = order.service.confirmMsg;
    if (!msg) msg = "Thank you for your order. Your package is now active.";
    msg += "\nYou can manage your account by clicking here /manage";

    await bot.telegram.sendMessage(order.userId, msg);
    return true;
  }

  await order.save(); // save order as paid

  // purchase failed - received error from server
  let msg = "An error occurred while processing your request.\n";
  msg += "You can resolve this issue by selecting another username and password at your orders page. Use /manage to continue.";

  await bot.telegram.sendMessage(order.userId, msg);

  return false;
};

const finializeOwnerOrder = async (bot: Telegraf<BotContext>, invoice: IPaymentInvoice & { _id: Types.ObjectId }) => {
  const user = await User.findOne({ invoice: invoice._id });
  if (!user) {
    logger.error("Pay callback: user not found");
    return false;
  }

  switch (invoice.actionType) {
    case ActionType.UpgradeToOwner:
      // registration process
      await bot.telegram.sendMessage(
        user.userId,
        "Thanks for your payment. You can continue registration.\n",
        Markup.inlineKeyboard([Markup.button.callback("Continue registration", "c_continue_register")])
      );
      break;
    case ActionType.RegisterService:
      // registration process
      await bot.telegram.sendMessage(
        user.userId,
        "Thanks for your payment. You can continue registration.\n",
        Markup.inlineKeyboard([Markup.button.callback("Continue add", "o_continue_add")])
      );
      break;
    case ActionType.PurchasePlan: {
      // purchase service
      logger.debug("Purchasing full version");
      let expiresAt = moment.utc().add(1, "months").toDate();

      user.status = ServiceStatus.EnabledUntil;
      user.expiresAt = expiresAt;
      user.serviceMode = invoice.serviceMode ?? ServiceMode.None;
      [user.isPurchaseEnabled, user.isRenewEnabled] = getFeatureEnabled(user.serviceMode);

      await user.save();

      bot.telegram.sendMessage(
        user.userId,
        `You purchased full-version until ${time2String(expiresAt)}.`,
        Markup.inlineKeyboard([Markup.button.callback("Go to dashboard", "o_goto_dashboard")])
      );
      break;
    }
    // case ActionType.ExtendAllServices: {
    //   logger.debug("Extending usage");
    //   const services = await Service.find({ ownerId: user.userId });
    //   services.forEach(async (service) => {
    //     // do not extend trial service
    //     if (service.serviceMode === ServiceMode.Trial) return;

    //     // no need to extend "VIP" services
    //     if (service.status === ServiceStatus.Enabled) return;

    //     let expiresAt = moment.utc().add(1, "months").toDate();
    //     if (service.expiresAt && service.expiresAt > new Date()) {
    //       expiresAt = moment(service.expiresAt).add(1, "months").toDate();
    //     }

    //     service.status = ServiceStatus.EnabledUntil;
    //     service.expiresAt = expiresAt;

    //     await service.save();
    //   });

    //   bot.telegram.sendMessage(
    //     user.userId,
    //     `All your services are extended 1 month.`,
    //     Markup.inlineKeyboard([Markup.button.callback("Go to dashboard", "o_goto_dashboard")])
    //   );
    //   break;
    // }
    case ActionType.ExtendService: {
      let expiresAt = moment.utc().add(1, "months").toDate();
      if (user.expiresAt && user.expiresAt > new Date()) {
        expiresAt = moment(user.expiresAt).add(1, "months").toDate();
      }

      user.status = ServiceStatus.EnabledUntil;
      user.expiresAt = expiresAt;

      await user.save();

      bot.telegram.sendMessage(
        user.userId,
        `Your service ${user.serviceName} is extended 1 month.`,
        Markup.inlineKeyboard([Markup.button.callback("Go to dashboard", "o_goto_dashboard")])
      );
      break;
    }
    case ActionType.ChangeServiceMode: {
      logger.debug("Changing service mode");
      let mode = invoice.serviceMode || ServiceMode.None;

      user.serviceMode = mode;
      [user.isPurchaseEnabled, user.isRenewEnabled] = getFeatureEnabled(mode);

      await user.save();

      bot.telegram.sendMessage(user.userId, `Successfully upgraded to <b>${getServiceModeLabel(mode)}</b> mode.`, {
        parse_mode: "HTML",
        reply_markup: Markup.inlineKeyboard([Markup.button.callback("Go to dashboard", "o_goto_dashboard")]).reply_markup,
      });
      break;
    }
  }

  return true;
};

export const onPaymentSuccess = async (params: IPaymentCallbackParams, bot: Telegraf<BotContext>) => {
  let invoice: (IPaymentInvoice & { _id: Types.ObjectId }) | null = null;

  switch (params.method) {
    case "paypal":
      invoice = await PaymentInvoice.findOne({
        "paypal.paymentId": params.paypal.paymentId,
      });

      if (!invoice?.paypal) {
        logger.error(`PayPal callback: no API data`);
        return false;
      }

      // capture the payment
      if (!(await paypal.executePayment(invoice.paypal, params.paypal.payerId, params.paypal.paymentId))) {
        return false;
      }
      break;
    case "stripe":
      invoice = await PaymentInvoice.findOne({
        "stripe.requestId": params.stripe.requestId,
      });

      if (!invoice?.stripe) {
        logger.error(`Stripe callback: no API data`);
        return false;
      }

      // capture the payment
      if (!(await stripe.checkPaymentResult(invoice.stripe, invoice.stripe.paymentId))) {
        return false;
      }

      break;
    default:
      logger.error(`Payment callback: invalid method: ${params.method}`);
      return false;
  }

  switch (invoice?.actionType) {
    case ActionType.PurchaseOrder:
    case ActionType.RenewOrder:
      return await finializeCustomerOrder(bot, invoice);
    case ActionType.UpgradeToOwner:
    case ActionType.RegisterService:
    case ActionType.PurchasePlan:
    // case ActionType.ExtendAllServices:
    case ActionType.ExtendService:
    case ActionType.ChangeServiceMode:
      return await finializeOwnerOrder(bot, invoice);
    default:
      logger.error(`PayPal callback: Invalid action ${invoice?.actionType}`);
      // response.send("Failed - server error");
      return false;
  }
};
