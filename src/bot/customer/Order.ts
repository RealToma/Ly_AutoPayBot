import { Markup } from "telegraf";
import { InlineKeyboardButton } from "telegraf/src/core/types/typegram";

import { CURRENCY_SYMBOLS } from "../../common/string";
import { logger } from "../../helper/logger";
import {
  changeUserLineCred,
  deleteUserLine,
  getPackageAdditionDetail,
  getPackageDetail,
  getLineInfoByUsername,
  createUserLine,
  getUserLineStatus,
} from "../../helper/panel_client";
import * as paypal from "../../helper/payment/paypal";
import * as stripe from "../../helper/payment/stripe";
import { escape, getButtons, isValidPassword, isValidUsername, time2String } from "../../helper/string_util";
import { getOrderDetail, IOrder, Order } from "../../model/Order";
import { IPackage, IService, Service } from "../../model/Service";
import { getOwnerProfile, User } from "../../model/User";
import { BotContext } from "../context";
import { clearCallbackButton } from "../../helper/misc";
import { ActionType, SessionState, OrderState, EndUserOption, ServiceStatus } from "../../common/types";
import { IPaymentInvoice, PaymentInvoice } from "../../model/PaymentInvoice";

type Hideable<B> = B & { hide?: boolean };
type HideableIKBtn = Hideable<InlineKeyboardButton>;

export const initPurchase = async (ctx: BotContext, type: ActionType) => {
  ctx.session.purchaseInfo = {
    serviceId: "",
    serverName: "",
    type: type,
    username: "",
    password: "",
    packageId: "",
    packageTitle: "",
  };

  ctx.session.status = SessionState.PurchaseOrRenew;
  ctx.session.step = 0;
  await ctx.reply("Please input the code of the service.");
};

export const recvPurchaseInfo = async (ctx: BotContext, value: string) => {
  if (ctx.session.step === 0) {
    // service code
    const code = parseInt(value);
    if (isNaN(code)) {
      await ctx.reply("Please enter a valid service code.\nService code must be a 6-digit number.");
      return;
    }
    const service = await Service.findOne({ serviceCode: code });
    if (!service) {
      await ctx.reply("Service is not found.");
      return;
    }

    // check service validation
    const owner = await User.findOne({ userId: service.ownerId });
    if (!owner) {
      logger.error(`Service owner not found ${service.ownerId}`);
      return;
    }

    if (ctx.session.purchaseInfo.type !== ActionType.AddOrder) {
      if (!service.isValid || owner.status === ServiceStatus.Pending || owner.status === ServiceStatus.Disabled) {
        ctx.session.status = SessionState.None;
        await ctx.reply("Service is not available now. Please try again later.");
        return;
      }
    }

    if (ctx.session.purchaseInfo.type === ActionType.TrialOrder) {
      if (!!ctx.session.user.triedServices.find((val) => val === code)) {
        ctx.session.status = SessionState.None;
        await ctx.reply("You have already tried this service. It's time to purchase a plan!");
        return;
      }
      if (!service.isTrialEnabled) {
        ctx.session.status = SessionState.None;
        await ctx.reply("This option is not available with this service!");
        return;
      }
    }

    if (ctx.session.purchaseInfo.type === ActionType.PurchaseOrder) {
      if (!owner.isPurchaseEnabled) {
        ctx.session.status = SessionState.None;
        await ctx.reply("This option is not available with this service!");
        return;
      }
    }

    if (ctx.session.purchaseInfo.type === ActionType.RenewOrder) {
      if (!owner.isRenewEnabled) {
        ctx.session.status = SessionState.None;
        await ctx.reply("This option is not available with this service!");
        return;
      }
    }

    ctx.session.step = 1;
    ctx.session.purchaseInfo.serviceId = service._id.toString();
    ctx.session.purchaseInfo.serverName = owner.serviceName;

    let message = `Selected service: <b>${escape(owner.serviceName)}</b>\n`;
    message += `Are you sure this is the correct service?`;

    await ctx.replyWithHTML(
      message,
      Markup.keyboard([Markup.button.text("Yes"), Markup.button.text("No, select again"), Markup.button.text("Cancel")]).oneTime()
    );

    return;
  }

  const { serviceId } = ctx.session.purchaseInfo;
  const service = await Service.findById(serviceId);
  if (!service) {
    await ctx.reply("Service is not found.");
    logger.error(`Add: service not found ${serviceId}`);
    return;
  }

  switch (ctx.session.step) {
    case 1: {
      // confirm service code
      let message = "";
      if (value.match(/^yes/i)) {
        if (ctx.session.purchaseInfo.type === ActionType.TrialOrder && service.trialPlans.length === 0) {
          ctx.session.status = SessionState.None;
          await ctx.reply("Service is not available now. Please try again later.", Markup.removeKeyboard());
          return;
        }
        ctx.session.step = 2;
        if (ctx.session.purchaseInfo.type === ActionType.PurchaseOrder) {
          message = "Please enter a desired username.\n";
          message += `\n<i>Username must contain at least ${service.minLength} alphanumeric characters.</i>`;
        } else {
          message = "Please enter the username.";
        }
      } else if (value.match(/^cancel/i)) {
        ctx.session.status = SessionState.None;
        message = "You cancelled.";
      } else {
        ctx.session.step = 0;
        message = "Please input the code of the service again.";
      }
      await ctx.replyWithHTML(message, Markup.removeKeyboard());
      break;
    }
    case 2: {
      // username
      if (ctx.session.purchaseInfo.type !== ActionType.PurchaseOrder || isValidUsername(value, service.minLength)) {
        ctx.session.purchaseInfo.username = value;
        ctx.session.step = 3;

        let message = "Please enter the password of the user.\n";

        if (ctx.session.purchaseInfo.type === ActionType.PurchaseOrder) {
          message += `\n<i>Password must contain at least ${service.minLength} alphanumeric characters.</i>`;
        }

        await ctx.replyWithHTML(message, Markup.removeKeyboard());
      } else {
        await ctx.reply(
          `Username must contain at least ${service.minLength} alphanumeric characters. Please try again.`,
          Markup.removeKeyboard()
        );
      }
      break;
    }
    case 3: {
      // password

      const username = ctx.session.purchaseInfo.username;
      const password = value;

      if (ctx.session.purchaseInfo.type === ActionType.PurchaseOrder || ctx.session.purchaseInfo.type == ActionType.TrialOrder) {
        const isValid = isValidPassword(value, service.minLength, username);
        if (isValid !== true) {
          let msg = `A minimum ${service.minLength} characters password contains a combination of uppercase and lowercase letter and number are required.\nDuplicate usernames and passwords are also not allowed.\n\n`;
          msg += `<i>${isValid}</i>`;
          await ctx.replyWithHTML(msg);
          return;
        }
      }

      // get user information by username and password

      if (ctx.session.purchaseInfo.type === ActionType.AddOrder || ctx.session.purchaseInfo.type === ActionType.RenewOrder) {
        const lineInfo = await getLineInfoByUsername(service, username);
        if (!lineInfo || lineInfo.password !== password) {
          ctx.session.status = SessionState.None;

          const action = ctx.session.purchaseInfo.type === ActionType.AddOrder ? "add" : "renew";
          await ctx.reply(`Username or password is incorrect. Failed to ${action} the plan.`);

          return;
        }

        let order = await Order.findOne({
          userId: ctx.chat?.id,
          service: service._id,
          username: username,
        });

        if (!order) {
          const orderData: IOrder = {
            userId: ctx.chat?.id as number,
            service: service._id,
            // username: username,
            // password: password,
            // packageId: lineInfo.packageId,
            isTrial: false,
            status: OrderState.Success,
            detail: lineInfo,
          };
          order = await Order.create(orderData);
        }

        if (ctx.session.purchaseInfo.type === ActionType.AddOrder) {
          ctx.session.status = SessionState.None;
          await ctx.reply("Successfully added plan.");
        } else {
          await showMsg4RenewOrder(ctx, `${order._id}`, false);
        }
        return;
      }

      ctx.session.purchaseInfo.password = value;
      ctx.session.step = 4;

      let plans: IPackage[] = [];

      if (ctx.session.purchaseInfo.type === ActionType.PurchaseOrder) {
        plans = service.plans.filter((plan) => !!plan.price && plan.enabled);
      } else {
        plans = service.trialPlans;
      }

      const buttons = plans.map((plan) => {
        return Markup.button.text(`#${plan.id}: ${plan.panelTitle}`);
      });

      if (buttons.length === 0) {
        ctx.session.status = SessionState.None;
        await ctx.reply("No service registered. Please try again later.", Markup.removeKeyboard());
      } else {
        ctx.reply("Please select a package", Markup.keyboard(buttons, { columns: 1 }).oneTime());
      }

      break;
    }
    case 4: {
      // package
      const text = value;
      const match = text.match(/^#(\d*): (.*)$/);
      if (match && match.length >= 3) {
        const packageId = match[1];
        const packageTitle = match[2];

        const purchaseInfo = ctx.session.purchaseInfo;
        const service = await Service.findById(purchaseInfo.serviceId);

        if (!service) {
          logger.error(`Select package: no service(${purchaseInfo.serviceId})`);
          ctx.session.status = SessionState.None;
          return;
        }

        const isTrial = ctx.session.purchaseInfo.type === ActionType.TrialOrder;
        const plan = (isTrial ? service.trialPlans : service.plans).find((p) => p.id === packageId);

        if (!plan || !plan.enabled) {
          logger.error(`Select package: invalid plan(${packageId})`);
          return;
        }

        const info = await getPackageDetail(service, plan.originalId, isTrial);
        if (info) {
          ctx.session.purchaseInfo.packageId = plan.originalId;
          ctx.session.purchaseInfo.packageTitle = packageTitle;
          ctx.session.step = 5;

          const price = plan.price;

          let priceText = `${CURRENCY_SYMBOLS[service.currency]}${price}`;

          if (!price) priceText = "free";

          let msg = `You selected package - <b>${packageTitle}</b>\n\n`;
          msg += `\t<b>Package Price:</b> ${priceText}\n`;
          msg += `\t<b>Max Connections:</b> ${info.max_connections}\n`;
          if (info.duration) {
            msg += `\t<b>Duration:</b> ${info.duration}\n`;
          }
          msg += `\t<b>Expiration Date:</b> ${info.exp_date}\n`;
          msg += "\n";
          msg += "Are you sure to purchase this package?";

          await ctx.replyWithHTML(
            msg,
            Markup.keyboard([Markup.button.text("Yes"), Markup.button.text("No, select again"), Markup.button.text("Cancel")]).oneTime()
          );
          break;
        }
      }

      await ctx.reply("Invalid package. Please select again.", Markup.removeKeyboard());
      break;
    }
    case 5: {
      // confirm
      const isTrial = ctx.session.purchaseInfo.type === ActionType.TrialOrder;

      const purchaseInfo = ctx.session.purchaseInfo;
      const service = await Service.findById(purchaseInfo.serviceId);

      if (!service) {
        logger.error(`Select package: no service(${purchaseInfo.serviceId})`);
        ctx.session.status = SessionState.None;
        return;
      }

      if (value.match(/^yes/i)) {
        if (isTrial) {
          const data = await createUserLine(service, purchaseInfo.username, purchaseInfo.password, purchaseInfo.packageId, true);
          const detail = data?.detail;

          if (detail) {
            detail.packageTitle = purchaseInfo.packageTitle;
            detail.packageId = purchaseInfo.packageId;
          }

          await Order.create({
            userId: ctx.chat?.id as number,
            service: service._id,
            username: purchaseInfo.username,
            password: purchaseInfo.password,
            packageId: purchaseInfo.packageId,
            isTrial: isTrial,
            status: OrderState.Success,
            detail: detail,
          });

          const user = ctx.session.user;
          user.triedServices.push(service.serviceCode);
          await user.save();

          ctx.session.status = SessionState.None;
          await ctx.reply(`Trial plan is created successfully. Use /manage to manage your plans.`, Markup.removeKeyboard());
        } else {
          ctx.session.status = SessionState.None;
          await ctx.replyWithHTML(`You confirmed package <b>${escape(purchaseInfo.packageTitle)}</b>`, Markup.removeKeyboard());
          await createInvoice(ctx);
        }
      } else if (value.match(/^cancel/i)) {
        ctx.session.status = SessionState.None;
        await ctx.reply("You cancelled.", Markup.removeKeyboard());
      } else {
        ctx.session.step = 4;
        const plans = isTrial ? service.trialPlans : service.plans.filter((plan) => !!plan.price && plan.enabled);
        const buttons = plans.map((plan) => {
          Markup;
          return Markup.button.text(`#${plan.id}: ${plan.panelTitle}`);
        });
        ctx.reply("Please select a package", Markup.keyboard(buttons, { columns: 1 }).oneTime());
      }
      break;
    }
    default:
      logger.warn(`Renew order: Invalid step ${ctx.session.step}`);
      break;
  }
};

export const createInvoice = async (ctx: BotContext) => {
  ctx.session.status = SessionState.None;

  const purchaseInfo = ctx.session.purchaseInfo;

  const service = await Service.findById(purchaseInfo.serviceId);
  const owner = await getOwnerProfile(service?.ownerId || "");

  if (!service || !owner) {
    logger.error(`Create invoice : owner not found(${purchaseInfo.serviceId})`);
    return;
  }

  const plan = service.plans.find((p) => p.originalId === purchaseInfo.packageId);

  if (!plan || !plan.price || !plan.enabled) {
    logger.error(`Create invoice: invalid plan(${purchaseInfo.packageId})`);
    return;
  }

  // get package information
  const packageInfo = await getPackageDetail(service, plan.originalId, false);

  if (!packageInfo) {
    logger.error(`Pay purchase: failed to get package detail\n${JSON.stringify(purchaseInfo, null, 2)}`);
    return;
  }

  if (purchaseInfo.type === ActionType.RenewOrder) {
    if (!owner.isRenewEnabled) {
      logger.error(`Service is not renew enabled ${purchaseInfo.serviceId}`);
      return;
    }
  }

  if (purchaseInfo.type === ActionType.PurchaseOrder) {
    if (!owner.isPurchaseEnabled) {
      logger.error(`Service is not purchase enabled ${purchaseInfo.serviceId}`);
      return;
    }
  }

  const totalPrice = plan.price;

  const buttons: HideableIKBtn[] = [];

  const invoiceData: IPaymentInvoice = {
    actionType: purchaseInfo.type,
    username: purchaseInfo.username,
    password: purchaseInfo.password,
    packageId: purchaseInfo.packageId,
    packageTitle: purchaseInfo.packageTitle,
  };

  // logger.debug("Invoice data" + JSON.stringify(invoiceData, null, 2));

  // PayPal
  if (owner.paymentGateway.paypal && owner.paymentGateway.paypal.isValid) {
    const itemName = plan.paymentTitle;

    const linkData = await paypal.createPaymentLink(
      totalPrice?.toString() || "0",
      service.currency || "GBP",
      itemName,
      owner.paymentGateway.paypal
    );

    if (linkData && linkData.success) {
      invoiceData.paypal = {
        accountEmail: owner.paymentGateway.paypal.accountEmail,
        accountId: owner.paymentGateway.paypal.accountId,
        clientId: owner.paymentGateway.paypal.clientId,
        clientSecret: owner.paymentGateway.paypal.clientSecret,
        link: linkData.link || "",
        paymentId: linkData.paymentId || "",
      };
      buttons.push(Markup.button.url("Pay by PayPal", invoiceData.paypal.link));
    }
  }

  // Stripe
  if (owner.paymentGateway.stripe?.isValid) {
    const linkData = await stripe.createPaymentLink(
      owner.paymentGateway.stripe,
      totalPrice?.toString() || "0",
      service.currency || "GBP",
      plan.paymentTitle
    );

    if (linkData && linkData.success) {
      invoiceData.stripe = {
        accountEmail: owner.paymentGateway.stripe.accountEmail,
        secretKey: owner.paymentGateway.stripe.secretKey,
        requestId: linkData.requestId || "",
        link: linkData.link || "",
        paymentId: linkData.paymentId || "",
      };
      buttons.push(Markup.button.url("Pay by Stripe", invoiceData.stripe.link));
    }
  }

  // TODO: Add more payment methods

  // logger.debug("Invoice data" + JSON.stringify(invoiceData, null, 2));

  const invoice = await PaymentInvoice.create(invoiceData);

  let orderData: IOrder = {
    userId: ctx.chat?.id as number,
    service: service._id,
    // username: purchaseInfo.username,
    // password: purchaseInfo.password,
    // packageId: purchaseInfo.packageId,
    isTrial: false,
    status: purchaseInfo.type === ActionType.RenewOrder ? OrderState.AwaitingRenewPayment : OrderState.AwaitingPayment,
    invoice: invoice._id,
  };

  if (buttons.length == 0) {
    await ctx.reply("No payment methods available. Please contact your service provider.");
    return;
  }

  let orderId = "";

  if (purchaseInfo.type === ActionType.RenewOrder) {
    const order = await Order.findByIdAndUpdate(ctx.session.recordId, orderData);
    orderId = order?._id.toString() || "";
  } else {
    // logger.debug(`Creating order\n${JSON.stringify(orderData, null, 2)}`);
    const order = await Order.create(orderData);
    orderId = order._id.toString();
  }

  buttons.push(Markup.button.callback("Cancel", `c_cancel_purchase_${orderId}`));

  await ctx.reply(`Please select payment method and purchase your order.`, Markup.inlineKeyboard(buttons, { columns: 1 }));
};

export const cancelPurchase = async (ctx: BotContext, orderId: string) => {
  const order = await Order.findById(orderId);
  if (!order) {
    logger.error(`Cancel purchase: order not found(${orderId})`);
    return;
  }

  if (order.status === OrderState.AwaitingPayment) {
    // purchase - delete it
    await order.delete();
  } else {
    // renew - reset status
    order.status = OrderState.Success;
    order.invoice = undefined;
    await order.save();
  }

  await ctx.editMessageText("You cancelled purchase.").catch(() => {});
};

export const displayOrders = async (ctx: BotContext, isCallbackMode: boolean) => {
  const orders = await Order.find({ userId: ctx.chat?.id }).populate<{
    service: IService;
    invoice: IPaymentInvoice;
  }>(["service", "invoice"]);

  let message = "<b><u>Orders</u></b>\n\n";

  for (let index = 0; index < orders.length; index++) {
    const order = orders[index];
    const owner = await User.findOne({ userId: order.service.ownerId });
    let isTrial = order.isTrial;

    const packageId = order.detail?.packageId || order.invoice?.packageId;

    let plan = isTrial
      ? order.service.trialPlans.find((plan) => plan.originalId === packageId)
      : order.service.plans.find((plan) => plan.originalId === packageId);

    message += `<b>${index + 1}. ${escape(owner?.serviceName)}`;
    if (isTrial) message += " (trial)";
    message += "</b>\n";
    message += "<pre>";
    message += `Package: ${escape(plan?.panelTitle)}\n`;
    if (order.detail) {
      message += `Expires at: ${time2String(order.detail.expDate)}\n`;
    }
    message += `Status: ${escape(OrderState[order.status])}\n`;
    message += "</pre>\n\n";
  }

  if (orders.length === 0) {
    message += "You don't have any orders now.\n";
  } else {
    message += "Press the correlating package number to manage the subscription";
  }

  ctx.session.status = SessionState.None;

  const buttons = orders.map((order, index) => Markup.button.callback(`${index + 1}`, `c_edit_order_${order._id}`));

  if (isCallbackMode) {
    await ctx
      .editMessageText(message, {
        reply_markup: Markup.inlineKeyboard(buttons, { columns: 3 }).reply_markup,
        parse_mode: "HTML",
      })
      .catch(() => {});
  } else {
    await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons, { columns: 3 }));
  }
};

export const displayOrder = async (ctx: BotContext, orderId: any, isCallbackMode: boolean) => {
  const order = await getOrderDetail(orderId);
  const owner = await User.findOne({ userId: order?.service.ownerId });

  if (!order || !owner) {
    logger.error(`Edit order: order not found(${orderId})`);
    return;
  }

  if (order.userId !== ctx.chat?.id) {
    logger.warn(`Display order: user mismatch: order ${orderId} requested by user ${ctx.chat?.id}`);
    return;
  }

  const username = order.detail?.username || order.invoice?.username;
  const password = order.detail?.password || order.invoice?.password;
  const packageId = order.detail?.packageId || order.invoice?.packageId;

  let message = "";

  const allPlans = [...order.service.plans, ...order.service.trialPlans];

  let plan = allPlans.find((plan) => plan.originalId === packageId);

  message += `<b>Order Detail</b>\n\n`;
  message += `${escape(owner.serviceName)}\n`;
  message += `<pre>`;
  message += `Package: ${escape(plan?.panelTitle)}\n`;
  message += `Username: ${escape(username)}\n`;
  message += `Password: ${escape(password)}\n`;
  if (order.detail) {
    message += `Connections: ${escape(order.detail.maxConnections)}\n`;
    // message += `Duration: ${escape(order.detail.duration)}\n`;
    message += `Expires At: ${time2String(order.detail.expDate)}\n`;
  }
  message += `</pre>\n\n`;

  if (order.status === OrderState.AwaitingPayment) {
    message += `⚠️ You have not paid this order yet.\n`;
  } else if (order.status === OrderState.Paid) {
    message += `⚠️ You paid but the purchase failed.\nThis could be due to username conflicts or other issues. You can now complete your purchase.\n`;
  }

  const buttons = [
    [
      // Markup.button.callback("Delete order", `c_delete_order_${orderId}`),
      Markup.button.callback("« Back to orders", `c_orders`),
    ],
  ];

  switch (order.status) {
    case OrderState.AwaitingPayment:
    case OrderState.AwaitingRenewPayment: {
      buttons.unshift([
        Markup.button.callback(`Pay now`, `c_pay_order_${orderId}`),
        Markup.button.callback(`Cancel`, `c_cancel_purchase_${orderId}`),
      ]);
      break;
    }
    case OrderState.Paid: {
      buttons.unshift([Markup.button.callback(`Finish purchase`, `c_finish_purchase_order_${orderId}`)]);
      break;
    }
    case OrderState.Success:
    case OrderState.Expired: {
      buttons.unshift(
        [
          Markup.button.callback("Change username", `c_edit_order_username_${orderId}`),
          Markup.button.callback("Change password", `c_edit_order_password_${orderId}`),
        ],
        [
          Markup.button.callback("Renew", `c_renew_order_${orderId}`),
          // Markup.button.callback("Delete ❌", `c_delete_order_${orderId}`),
          Markup.button.callback("« Back to orders", `c_orders`),
        ]
      );
      buttons.pop();
      break;
    }
  }

  if (isCallbackMode) {
    await ctx
      .editMessageText(message, {
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
        parse_mode: "HTML",
      })
      .catch(() => {});
  } else {
    await ctx.reply(message, {
      reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
      parse_mode: "HTML",
    });
  }
};

export const showMsg4EditOrder = async (ctx: BotContext, action: string, orderId: string) => {
  const order = await getOrderDetail(orderId);
  const owner = await User.findOne({ userId: order?.service.ownerId });

  if (!order || !owner) {
    logger.error(`Edit order: order not found(${orderId})`);
    return;
  }
  if (order.userId !== ctx.chat?.id) {
    logger.warn(`Edit order: user mismatch: order ${orderId} requested by user ${ctx.chat?.id}`);
    return;
  }

  if (action === "username") {
    if (order.service.userOption === EndUserOption.None || order.service.userOption === EndUserOption.PasswordOnly) {
      ctx.session.status = SessionState.None;
      await ctx
        .editMessageText("The service does not authorise you to change username. Please contact your service provider.")
        .catch(() => {});
      return;
    }
  } else if (action === "password") {
    if (order.service.userOption === EndUserOption.None || order.service.userOption === EndUserOption.UsernameOnly) {
      ctx.session.status = SessionState.None;
      await ctx
        .editMessageText("The service does not authorise you to change password. Please contact your service provider.")
        .catch(() => {});
      return;
    }
  }

  const status = await getUserLineStatus(order.service, order.detail?.username || "");

  if (status === "Disabled" || status === "Banned") {
    let msg = "Your service provider has suspended your account. ";
    msg += "Please contact them for further information\n\n";
    msg += `<pre>`;
    msg += `Server: ${escape(owner.serviceName)}\n`;
    msg += `Package: ${escape(order.detail?.packageTitle)}\n`;
    msg += `Username: ${escape(order.detail?.username)}\n`;
    msg += `Status: ${escape(status)}\n`;
    msg += `</pre>`;

    const buttons = [Markup.button.callback(" Back", `c_edit_order_${orderId}`)];
    const keyboard = Markup.inlineKeyboard(buttons, { columns: 1 });

    await ctx
      .editMessageText(msg, {
        parse_mode: "HTML",
        reply_markup: keyboard.reply_markup,
      })
      .catch(() => {});
    return;
  }

  ctx.session.status = SessionState.EditOrderField;
  ctx.session.fieldName = action;
  ctx.session.recordId = orderId;

  const buttons = getButtons([[["« Back", `c_edit_order_${orderId}`]]]);

  await ctx.editMessageText(`Please enter new ${action}.`, Markup.inlineKeyboard(buttons));
};

export const setOrderInfo = async (ctx: BotContext, value: string) => {
  const fieldName = ctx.session.fieldName;
  const orderId = ctx.session.recordId;

  // update order
  const order = await getOrderDetail(orderId);

  if (!order) {
    logger.warn(`Edit order ${fieldName}: order not found(${orderId})`);
    return;
  }

  if (!order.detail) {
    logger.warn(`Edit order ${fieldName}: detail information not found`);
    return;
  }

  if (order.userId !== ctx.chat?.id) {
    logger.warn(`Edit order ${fieldName}: user mismatch ${ctx.chat?.id}(expected user: ${orderId})`);
    return;
  }

  const service = order.service;

  if (!service) {
    logger.warn(`Edit order ${fieldName}: service not found ${orderId}`);
    return;
  }

  let newUsername: string | undefined;
  let newPassword: string | undefined;

  // validate new username / password
  if (ctx.session.fieldName === "username") {
    newUsername = value;
  } else {
    newPassword = value;
  }

  await clearCallbackButton(ctx);

  if (newUsername && !isValidUsername(newUsername, service.minLength)) {
    await ctx.reply(`Username must have at least ${service.minLength} alphanumeric characters. Please try again.`);
    return;
  }

  const { username } = order.detail;

  if (newPassword) {
    const isValid = isValidPassword(newPassword, service.minLength, username);
    if (isValid !== true) {
      let msg = `A minimum ${service.minLength} characters password contains a combination of uppercase and lowercase letter and number are required.\nDuplicate usernames and passwords are also not allowed.\n\n`;
      msg += `<i>${isValid}</i>`;
      await ctx.replyWithHTML(msg);
      return;
    }
  }

  newUsername = newUsername || order.detail.username;
  newPassword = newPassword || order.detail.password;

  const res = await changeUserLineCred(service, order.detail.lineId, newUsername, newPassword);

  if (res) {
    const info = await getLineInfoByUsername(service, newUsername);

    if (info) {
      order.detail.username = info?.username;
      order.detail.password = info?.password;
      await order.save();
    }
    await ctx.reply(`Changed ${fieldName} successfully.`);
    // await displayOrder(ctx, orderId, false)
  } else {
    await ctx.reply(`Failed to change ${fieldName}.`);
  }
};

export const showMsg4RenewOrder = async (ctx: BotContext, orderId: string, isCallbackMode: boolean) => {
  const order = await getOrderDetail(orderId);

  if (!order) {
    logger.warn(`Renew order: not found(${orderId})`);
    return;
  }

  const service = order.service;
  if (!service) {
    logger.warn(`Renew order: service not found(${orderId})`);
    return;
  }

  const owner = await User.findOne({ userId: service.ownerId });
  if (!owner) {
    logger.warn(`Renew order: owner not found(${orderId})`);
    return;
  }

  if (!service.isValid || owner.status === ServiceStatus.Pending || owner.status === ServiceStatus.Disabled) {
    if (isCallbackMode) {
      await ctx.editMessageText("Service is not available now. Please try again later.").catch(() => {});
    } else {
      await ctx.reply("Service is not available now. Please try again later.");
    }
    return;
  }

  const plans = service.plans.filter((plan) => !!plan.price && plan.enabled);

  if (!owner.isRenewEnabled || plans.length === 0) {
    if (isCallbackMode) {
      await ctx.editMessageText("This option is not available with this service!").catch(() => {});
    } else {
      await ctx.reply("This option is not available with this service!");
    }
    return;
  }

  const status = await getUserLineStatus(service, order.detail?.username || "");

  if (status === "Disabled" || status === "Banned") {
    let msg = "Your service provider has suspended your account. ";
    msg += "Please contact them for further information\n\n";
    msg += `<pre>`;
    msg += `Server: ${escape(owner.serviceName)}\n`;
    msg += `Package: ${escape(order.detail?.packageTitle)}\n`;
    msg += `Username: ${escape(order.detail?.username)}\n`;
    msg += `Status: ${escape(status)}\n`;
    msg += `</pre>`;

    const buttons = [Markup.button.callback(" Back", `c_edit_order_${orderId}`)];
    const keyboard = Markup.inlineKeyboard(buttons, { columns: 1 });

    if (isCallbackMode) {
      await ctx
        .editMessageText(msg, {
          parse_mode: "HTML",
          reply_markup: keyboard.reply_markup,
        })
        .catch(() => {});
    } else {
      await ctx.replyWithHTML(msg, keyboard);
    }
    return;
  }

  const buttons = plans.map((plan) => Markup.button.text(`#${plan.id}: ${plan.panelTitle}`));

  ctx.session.status = SessionState.RenewUserLine;
  ctx.session.recordId = orderId;
  ctx.session.step = 0;

  if (isCallbackMode) {
    ctx
      .deleteMessage()
      .then(() => {
        ctx.reply("Please select a package to renew", Markup.keyboard(buttons, { columns: 1 }));
      })
      .catch(() => {});
  } else {
    ctx.reply("Please select a package to renew", Markup.keyboard(buttons, { columns: 1 }));
  }
};

export const recvRenewOrder = async (ctx: BotContext, value: string) => {
  if (ctx.session.step === 0) {
    // receive package
    const match = value.match(/^#(\d*): (.*)$/);

    if (!match) {
      await ctx.reply("Invalid package. Please select again.");
      return;
    }

    const orderId = ctx.session.recordId;

    const order = await getOrderDetail(orderId);

    if (!order) {
      logger.warn(`Renew order: order not found ${orderId}`);
      return;
    }
    const service = order.service;
    const serviceOwner = await User.findOne({ userId: service.ownerId });
    if (!service) {
      logger.warn(`Renew order: service not found ${orderId}`);
      return;
    }

    if (!order.detail) {
      logger.warn(`Renew order: no order detail ${orderId}`);
      return;
    }

    const newPackageId = match[1];
    const newPackageTitle = match[2];

    const plan = service.plans.find((p) => p.id === newPackageId);
    if (!plan || !plan.price || !plan.enabled) {
      logger.warn(`Renew order: invalid(${newPackageId})`);
      return;
    }

    const info = await getPackageAdditionDetail(service, order.detail.lineId, order.detail.packageId || "", plan.originalId);
    if (!info) {
      logger.warn(`Renew order: validation check failed ${orderId}`);
      return;
    }

    const price = plan.price;

    let msg = `You selected package - <b>${newPackageTitle}</b>\n\n`;
    msg += `\t<b>Package Price:</b> ${CURRENCY_SYMBOLS[service.currency]}${price}\n`;
    msg += `\t<b>Max Connections:</b> ${info.max_connections}\n`;
    if (info.duration) {
      msg += `\t<b>Duration:</b> ${info.duration}\n`;
    }
    msg += `\t<b>Expiration Date:</b> ${info.exp_date}\n`;
    msg += "\n";

    if (info.compatible === false) {
      msg +=
        "<i>⚠️ The package you have selected is incompatible with the existing package. This could be due to the number of connections or other restrictions.\n";
      msg +=
        "You can still upgrade to this package, however the time added will be from today, <b>NOT</b> from the end of the original package.</i>\n\n";
    }
    msg += "Are you sure to renew with this package?";

    ctx.session.step += 1;
    ctx.session.purchaseInfo.type = ActionType.RenewOrder;
    ctx.session.purchaseInfo.serviceId = service._id.toString();
    ctx.session.purchaseInfo.serverName = serviceOwner?.serviceName || "";
    ctx.session.purchaseInfo.username = order.detail.username;
    ctx.session.purchaseInfo.password = order.detail.password;
    ctx.session.purchaseInfo.packageId = plan.originalId;
    ctx.session.purchaseInfo.packageTitle = newPackageTitle;

    await ctx.replyWithHTML(
      msg,
      Markup.keyboard([Markup.button.text("Yes"), Markup.button.text("No, select again"), Markup.button.text("Cancel")]).oneTime()
    );
  } else if (ctx.session.step === 1) {
    // receive decision
    if (/^yes/i.test(value)) {
      const orderId = ctx.session.recordId;
      const order = await getOrderDetail(orderId);
      if (!order) {
        logger.error(`Renew order: not found ${orderId}`);
        return;
      }
      const owner = await getOwnerProfile(order.service.ownerId);
      if (!owner) {
        logger.error(`Renew order: owner not found ${orderId}`);
        return;
      }
      ctx.session.status = SessionState.None;
      if (!owner.paymentGateway.countEnabled) {
        await ctx.reply(`Oops~ no payment method is enabled in this service.`, Markup.removeKeyboard());
      } else {
        // user confirmed the package
        await ctx.replyWithHTML(`You confirmed package <b>${ctx.session.purchaseInfo.packageTitle}</b>`, Markup.removeKeyboard());

        await createInvoice(ctx);

        // const buttons = [Markup.button.callback("Cancel", "c_cancel_purchase")];

        // ctx.session.purchaseInfo.ownerID = order.service.ownerId;
        // ctx.session.purchaseInfo.type = ActionType.RenewOrder;

        // if (owner.paymentGateway.paypal && owner.paymentGateway.paypal.isValid) {
        //   buttons.unshift(
        //     Markup.button.callback("Pay by PayPal", "c_pay_by_PayPal")
        //   );
        // }

        // await ctx.reply(
        //   "Please select payment method",
        //   Markup.inlineKeyboard(buttons, { columns: 1 })
        // );
      }
    } else if (/^cancel/i.test(value)) {
      ctx.session.status = SessionState.None;
      // user confirmed the package
      await ctx.reply(`You cancelled renewing the order.`, Markup.removeKeyboard());
    } else {
      const orderId = ctx.session.recordId;
      const order = await getOrderDetail(orderId);

      if (!order) {
        logger.warn(`Renew order: not found(${orderId})`);
        return;
      }

      const service = order.service;
      if (!service) {
        logger.warn(`Renew order: service not found(${orderId})`);
        return;
      }

      const plans = service.plans.filter((plan) => !!plan.price && plan.enabled);

      const buttons = plans.map((plan) => Markup.button.text(`#${plan.id}: ${plan.panelTitle}`));

      ctx.session.status = SessionState.RenewUserLine;
      ctx.session.recordId = orderId;
      ctx.session.step = 0;

      await ctx.reply("Please select another package to renew", Markup.keyboard(buttons, { columns: 1 }));
    }
  }
};

export const deleteOrder = async (ctx: BotContext, orderId: string) => {
  const order = await getOrderDetail(orderId);

  if (!order) {
    logger.warn(`Delete order: not found ${orderId}`);
    return;
  }

  if (!order.detail) {
    logger.warn(`Delete order: detail info not found ${orderId}`);
    return;
  }

  const res = await deleteUserLine(order.service, order.detail.lineId);

  if (res.error !== "Invalid service info") {
    await order.delete();
    await ctx.editMessageText(`Order deleted`).catch(() => {});
  } else {
    logger.warn(`Failed to delete order ${orderId}: ${res.error}`);
    await ctx.editMessageText(`Failed to delete the order`).catch(() => {});
  }
};

export const payIncompleteOrder = async (ctx: BotContext, orderId: string) => {
  const order = await Order.findById(orderId).populate<{
    invoice: IPaymentInvoice;
  }>("invoice");

  if (!order?.invoice) {
    logger.warn(`Pay incomplete order: not found ${orderId}`);
    return;
  }

  const buttons: HideableIKBtn[] = [];

  if (order.invoice.paypal) {
    buttons.push(Markup.button.url("Pay by PayPal", order.invoice.paypal.link));
  }
  if (order.invoice.stripe) {
    buttons.push(Markup.button.url("Pay by Stripe", order.invoice.stripe.link));
  }

  // TODO: Add more payment methods

  buttons.push(Markup.button.callback("« Back", `c_edit_order_${order._id}`));

  await ctx
    .editMessageText(`Please select payment method and finish purchasing.`, Markup.inlineKeyboard(buttons, { columns: 1 }))
    .catch(() => {});
};

export const showMsg4IncompleteOrder = async (ctx: BotContext, orderId: string) => {
  ctx.session.status = SessionState.FixIncompleteOrder;
  ctx.session.recordId = orderId;
  ctx.session.step = 0;
  await ctx.editMessageText("Please enter a new username.").catch(() => {});
};

export const finishIncompleteOrder = async (ctx: BotContext, value: string) => {
  const orderId = ctx.session.recordId;
  const order = await getOrderDetail(orderId);
  if (!order || order.status !== OrderState.Paid) {
    logger.warn(`Finish incomplete order: order not found ${orderId}`);
    return;
  }

  const service = order.service;

  if (ctx.session.step === 0) {
    if (!isValidUsername(value, service.minLength)) {
      await ctx.reply(`Username must have at least ${service.minLength} alphanumeric characters. Please try again.`);
      return;
    }

    ctx.session.purchaseInfo.username = value;
    ctx.session.step = 1;
    await ctx.reply("Please enter a new password.");
    return;
  }

  const username = ctx.session.purchaseInfo.username;
  const password = value;

  const isValid = isValidPassword(password, service.minLength, username);
  if (isValid !== true) {
    let msg = `A minimum ${service.minLength} characters password contains a combination of uppercase and lowercase letter and number are required.\nDuplicate usernames and passwords are also not allowed.\n\n`;
    msg += `<i>${isValid}</i>`;
    await ctx.replyWithHTML(msg);
    return;
  }

  const data = await createUserLine(service, username, password, order.detail?.packageId || "");

  if (!data || !data.result) {
    ctx.session.status = SessionState.None;
    await ctx.reply("Failed to send purchase request");
    return;
  }

  const detail = data.detail;

  // purchase success
  order.status = OrderState.Success;
  // order.username = username;
  // order.password = password;
  order.detail = detail;
  if (order.detail) {
    order.detail.packageTitle =
      service.plans.find((plan) => plan.originalId === order.detail?.packageId)?.panelTitle || order.detail.packageTitle;
  }

  await order.save();
  ctx.session.status = SessionState.None;

  let msg = service.confirmMsg;
  if (!msg) msg = "Thank you for your order. Your package is now active.";
  msg += "\nYou can manage your account by clicking here /manage";

  await ctx.reply(msg);
  return;
};
