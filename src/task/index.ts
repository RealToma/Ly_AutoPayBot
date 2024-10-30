import moment from "moment";
import { Markup, Telegraf } from "telegraf";
import { BotContext } from "../bot/context";
import { logger } from "../helper/logger";
import { sendMoney } from "../helper/payment/paypal";
import { escape, getButtons, time2String } from "../helper/string_util";
import { AdminConfig } from "../model/AdminConfig";
import { Order } from "../model/Order";
import { IPaymentGateway } from "../model/PaymentGateway";
import { IService, Service } from "../model/Service";
import { User } from "../model/User";
import { deleteUserLine } from "../helper/panel_client";
import { OrderState, ServiceMode, ServiceStatus, UserRole } from "../common/types";

export const checkExpiration = async (bot: Telegraf<BotContext>) => {
  const now = new Date();

  // logger.info(`Checking expiration`);

  // check user expiration
  const expiredUsers = await User.find({
    status: ServiceStatus.EnabledUntil, // restricted plan
    expiresAt: { $lt: now }, // expired
  });

  expiredUsers.forEach((user) => {
    logger.info(`User ${user.serviceName} has been expired.`);
    // set user status to "Disabled"
    user.status = ServiceStatus.Disabled;
    user
      .save()
      .then(() => {
        // notify to the user
        bot.telegram.sendMessage(user.userId, `Your service <b>${user.serviceName}</b> is expired.`, { parse_mode: "HTML" });
      })
      .catch((err) => {});
  });

  // check order expiration
  const expiredOrders = await Order.find({
    status: OrderState.Success,
    "detail.expDate": { $lt: now },
  }).populate<{ service: IService }>("service");

  expiredOrders.forEach(async (order) => {
    logger.info(`Order ${order._id} has been expired.`);
    const owner = await User.findOne({ userId: order.service.ownerId });
    order.status = OrderState.Expired;

    order.save().then(() => {
      let buttonLabels: [string, string][][] = [[["Renew now", `c_renew_order_${order._id}`]]];

      const buttons = Markup.inlineKeyboard(getButtons(buttonLabels));

      let message = "Your account is expired.\n";
      message += `<b>Server:</b> ${escape(owner?.serviceName)}\n`;
      message += `<b>Package:</b> ${escape(order.detail?.packageTitle)}\n`;
      message += `<b>Username:</b> ${escape(order.detail?.username)}\n`;
      bot.telegram.sendMessage(order.userId, message, { parse_mode: "HTML", reply_markup: buttons.reply_markup });
    });
  });
};

export const notifyExpriration = async (bot: Telegraf<BotContext>) => {
  const now = moment.utc().toDate();
  const deadLine = moment.utc().add(7, "days").toDate();

  // TODO: handle service expiration properly
  const trialDeadline = moment.utc().add(3, "days").toDate();

  // logger.debug("Sending expriration notification");

  // send notification to owners with services that will be expired in 1 week
  const expiredUsers = await User.find({
    status: ServiceStatus.EnabledUntil, // restricted plan
    expiresAt: { $gt: now, $lt: deadLine }, // will be expired soon
  });

  expiredUsers.forEach((user) => {
    if (user.serviceMode === ServiceMode.Trial) {
      if (user.expiresAt && user.expiresAt < trialDeadline) {
        bot.telegram.sendMessage(
          user.userId,
          `Your 7-day trial service <b>${user.serviceName}</b> will be expired soon. Please purchase full-version at /dashboard.`,
          { parse_mode: "HTML" }
        );
      }
    } else {
      bot.telegram.sendMessage(
        user.userId,
        `Your service <b>${user.serviceName}</b> will be expired soon. Please extend your service before expiration.`,
        { parse_mode: "HTML" }
      );
    }
  });

  // send notification to users that have orders that will be expired in 1 week
  const expiredOrders = await Order.find({
    status: OrderState.Success,
    "detail.expDate": { $lt: deadLine },
  }).populate<{ service: IService }>("service");

  expiredOrders.forEach(async (order) => {
    const owner = await User.findOne({ userId: order.service.ownerId });

    let buttonLabels: [string, string][][] = [[["Renew now", `c_renew_order_${order._id}`]]];
    const buttons = Markup.inlineKeyboard(getButtons(buttonLabels));

    let msg = `Your account is expiring soon. Please renew it for it expires.\n`;
    msg += `<b>Server:</b> ${escape(owner?.serviceName)}\n`;
    msg += `<b>Package:</b> ${escape(order.detail?.packageTitle)}\n`;
    msg += `<b>Username:</b> ${escape(order.detail?.username)}\n`;
    msg += `<b>Expires At:</b> ${time2String(order.detail?.expDate)}\n`;

    bot.telegram.sendMessage(order.userId, msg, { parse_mode: "HTML", reply_markup: buttons.reply_markup });
  });
};

// remove expired orders
export const removeExpiredOrders = async (bot: Telegraf<BotContext>) => {
  logger.debug("Removing expired orders");
  const deadLine = moment.utc().subtract(31, "days").toDate();
  const expiredOrders = await Order.find({
    status: OrderState.Expired,
    "detail.expDate": { $lt: deadLine },
  }).populate<{ service: IService }>("service");

  expiredOrders.forEach(async (order) => {
    if (!order.detail) return;
    // logger.debug(JSON.stringify(order, null, 2));
    // await deleteUserLine(order.service, order.detail.lineId);
    await order.delete();

    const owner = await User.findOne({ userId: order.service.ownerId });

    let msg = "The following account is removed since it has expired 1 month ago and you have not renewed it.\n\n";
    msg += "<pre>";
    msg += `<b>Server:</b> ${escape(owner?.serviceName)}\n`;
    msg += `<b>Package:</b> ${escape(order.detail.packageTitle)}\n`;
    msg += `<b>Username:</b> ${escape(order.detail.username)}\n`;
    msg += `<b>Expired At:</b> ${time2String(order.detail.expDate)}\n`;
    msg += "</pre>\n\n";
    msg += `You can add it again later using /add command.`;

    await bot.telegram.sendMessage(order.userId, msg, { parse_mode: "HTML" });
  });
};
