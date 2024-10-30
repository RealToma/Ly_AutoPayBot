import moment from "moment";
import { Markup } from "telegraf";
import { logger } from "../../helper/logger";
import { escape, getButtons, time2String } from "../../helper/string_util";
import { PaymentGateway } from "../../model/PaymentGateway";
import { Service } from "../../model/Service";
import { getOwnerProfile, User } from "../../model/User";
import { BotContext } from "../context";
import { Order } from "../../model/Order";
import { ServiceStatus, SessionState, UserRole } from "../../common/types";
import { getServiceModeLabel } from "../../common/functions";

export const displayOwners = async (ctx: BotContext, isCallbackMode: boolean) => {
  const owners = await User.find({ role: UserRole.Owner });

  let msg = "";
  let btnInfo: [string, string][][] = [];

  msg += `<b><u>Service Owners - ${owners.length} total</u></b>\n\n`;

  owners.forEach((owner, index) => {
    msg += `<b>${index + 1}. ${owner.username}</b>: registered ${owner.services?.length} services\n`;
    btnInfo.push([[`${index + 1}`, `a_edit_owner_${owner.userId}`]]);
  });

  const buttons = getButtons(btnInfo);

  if (isCallbackMode) {
    await ctx
      .editMessageText(msg, {
        parse_mode: "HTML",
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
      })
      .catch(() => {});
  } else {
    await ctx.replyWithHTML(msg, Markup.inlineKeyboard(buttons));
  }
};

export const displayOwnerServices = async (ctx: BotContext, ownerId: string, isCallbackMode: boolean) => {
  const owner = await getOwnerProfile(ownerId);
  if (!owner) {
    logger.error(`Display owner - not found(${ownerId})`);
    return;
  }
  // const owners = await User.find({
  //   role: UserRole.Owner,
  // }).populate<{ services: IService[] }>("services");

  let message = `<b>${owner.username}</b>\n\n`;
  owner.services?.forEach((service) => {
    // message += `ID: ${owner.userId}\n`;
    // message += `${index + 1}. <b>${escape(owner.service.serviceName)}</b>\n`;
    message += `<b>${escape(owner.serviceName)}</b>\n`;
    message += `<pre>`;
    // message += `Owner: ${escape(owner.username)}\n`;
    message += `URL: ${escape(service.url)}\n`;
    message += `Service Code: ${service.serviceCode}\n`;
    message += `Mode: ${getServiceModeLabel(owner.serviceMode)}\n`;
    switch (owner.status) {
      case ServiceStatus.Pending:
        message += `Status: Pending\n`;
        break;
      case ServiceStatus.Enabled:
        message += `Status: Enabled\n`;
        break;
      case ServiceStatus.EnabledUntil:
        message += `Status: Enabled(until ${time2String(owner.expiresAt)})\n`;
        break;
      case ServiceStatus.Disabled:
        message += `Status: Disabled\n`;
        break;
    }
    message += `</pre>\n\n`;
  });

  const buttons = owner.services?.map((service, index) => Markup.button.callback(`${index + 1}`, `a_edit_service_${service._id}`));

  buttons.push(Markup.button.callback("« Back to owners", "a_owners"));

  if (owner.services.length > 0) {
    message += `Please select service index to manage\n`;
  } else {
    message += "No services registered\n";
  }

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

export const displayService = async (ctx: BotContext, serviceId: string, isCallbackMode: boolean, action?: string) => {
  const service = await Service.findById(serviceId);
  const owner = await User.findOne({ userId: service?.ownerId });

  if (!service || !owner) {
    logger.error(`Edit service: not found ${service}`);
    await ctx.reply(`Service not found`);
    return;
  }

  let message = ``;
  // message += `ID: ${owner.userId}\n`;
  message += `<b>${escape(owner.serviceName)}</b>\n`;
  message += `<pre>`;
  message += `Owner: ${escape(owner.username)}\n`;
  message += `URL: ${escape(service.url)}\n`;
  message += `Service Code: ${service.serviceCode}\n`;
  message += `Mode: ${getServiceModeLabel(owner.serviceMode)}\n`;

  switch (owner.status) {
    case ServiceStatus.Pending:
      message += `Status: Pending\n`;
      break;
    case ServiceStatus.Enabled:
      message += `Status: Enabled\n`;
      break;
    case ServiceStatus.EnabledUntil:
      message += `Status: Enabled(until ${time2String(owner.expiresAt)})\n`;
      break;
    case ServiceStatus.Disabled:
      message += `Status: Disabled\n`;
      break;
  }
  message += `</pre>\n\n`;

  if (action) {
    message += `<b><i>Are you going to ${action} this service?</i></b>\n`;
  }

  const buttons = [[Markup.button.callback("« Back", `a_edit_owner_${owner.userId}`)]];

  if (action) {
    buttons.shift();
    buttons.push([
      Markup.button.callback("Yes", `a_${action}_service_${service._id}`),
      Markup.button.callback("No", `a_edit_service_${service._id}`),
    ]);
  } else if (owner.status === ServiceStatus.Pending) {
    buttons.unshift([
      Markup.button.callback("Accept", `a_accept_service_${service._id}`),
      Markup.button.callback("Reject", `a_reject_service_${service._id}`),
    ]);
  } else {
    buttons.unshift([
      Markup.button.callback("Disable", `a_disable_service_${service._id}`),
      Markup.button.callback("Delete", `a_try_delete_service_${service._id}`),
    ]);
    buttons.unshift([
      Markup.button.callback("Enable", `a_enable_service_${service._id}`),
      Markup.button.callback("Enable (duration)", `a_restrict_service_${service._id}`),
    ]);
  }

  if (isCallbackMode) {
    await ctx
      .editMessageText(message, {
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
        parse_mode: "HTML",
      })
      .catch(() => {});
  } else {
    await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons));
  }
};

// accept/reject request for owner registration
export const handleOwnerRegistration = async (ctx: BotContext, action: string, ownerId: string) => {
  const owner = await User.findOne({ userId: ownerId });

  if (!owner) {
    logger.error(`${action} owner: user not found ${ownerId}`);
    return;
  }

  let message = "";
  if (action === "accept") {
    // TODO: change when admin accepts/rejects requests
    // service.status = ServiceStatus.Disabled;
    // await owner.save();
    message = `Accepted service registration from @${owner.username}`;
    ctx.telegram.sendMessage(owner.userId, "The administrator accepted your request.\nPlease finish setting up your service by /dashboard");
  } else {
    owner.role = UserRole.Customer;
    await owner.save();
    await Service.findOneAndDelete({ ownerId: owner.userId });
    await PaymentGateway.findOneAndDelete({ ownerId: owner.userId });
    message = `Rejected service registration from @${owner.username}`;

    // send rejection message to owner
    ctx.telegram.sendMessage(owner.userId, "The administrator rejected your request.");
  }
  const buttons = [Markup.button.callback("« Back to owners", "a_owners")];
  await ctx.editMessageText(message, Markup.inlineKeyboard(buttons)).catch(() => {});
};

// enable/disable owner
export const changeServiceStatus = async (ctx: BotContext, action: string, serviceId: string) => {
  const service = await Service.findById(serviceId);
  const owner = await User.findOne({ userId: service?.ownerId });
  // const owner = await getOwnerProfile(ownerId);

  if (!service || !owner) {
    logger.error(`${action} service: not found ${serviceId}`);
    return;
  }

  if (action === "enable") {
    owner.status = ServiceStatus.Enabled;
  } else {
    owner.status = ServiceStatus.Disabled;
  }
  owner.expiresAt = undefined;
  await owner.save();

  ctx.telegram.sendMessage(service.ownerId, `The administrator ${action}d your service - ${owner.serviceName}`);

  await ctx
    .editMessageText(`Successfully ${action}d the service <b>${escape(owner.serviceName)}</b>.`, {
      parse_mode: "HTML",
      reply_markup: Markup.inlineKeyboard([Markup.button.callback("« Back to owners", "a_owners")]).reply_markup,
    })
    .catch(() => {});
};

export const deleteService = async (ctx: BotContext, serviceId: string) => {
  const service = await Service.findById(serviceId);
  const owner = await User.findOne({ userId: service?.ownerId });

  if (!service || !owner) {
    logger.error(`Delete service: not found ${serviceId}`);
    return;
  }

  // delete service and related orders
  await Order.deleteMany({ service: service.id });
  await service.delete();

  owner.services = owner.services?.filter((id) => !id.equals(service._id));
  await owner.save();

  // delete owner's service and payment information
  // owner.services?.forEach(async (serviceId) => {
  //   const service = await Service.findByIdAndDelete(serviceId);
  //   await Order.deleteMany({ service: service?.id });
  // });
  // await PaymentGateway.findOneAndDelete({ ownerId: owner.userId });

  // // update user profile to Customer
  // owner.role = UserRole.Customer;
  // owner.services = [];
  // owner.paymentGateway = undefined;
  // owner.status = undefined;
  // await owner.save();

  ctx.telegram.sendMessage(service.ownerId, `Your service <b>${escape(owner.serviceName)}</b> is deleted by the administrator.`, {
    parse_mode: "HTML",
  });

  await displayOwners(ctx, true);
};

export const showRestrictMsg = async (ctx: BotContext, serviceId: string) => {
  const service = await Service.findById(serviceId);

  if (!service) {
    logger.error(`restrict service: not found ${serviceId}`);
    return;
  }

  ctx.session.status = SessionState.ReceiveOwnerExpirationDate;
  ctx.session.serviceId = serviceId;
  await ctx.editMessageText("Please input expiration date").catch(() => {});
};

export const restrictOwner = async (ctx: BotContext, expiration: string) => {
  const expiresAt = moment.utc(expiration);

  if (!expiresAt.isValid()) {
    await ctx.reply("You entered invalid date. Please try again.");
  } else if (expiresAt < moment()) {
    await ctx.reply("You entered past date. Please try again.");
  } else {
    const service = await Service.findById(ctx.session.serviceId);
    const owner = await User.findOne({ userId: service?.ownerId });
    if (!service || !owner) {
      logger.error(`Set service expiration date: not found ${ctx.session.serviceId}`);
      return;
    }

    owner.status = ServiceStatus.EnabledUntil;
    owner.expiresAt = expiresAt.toDate();
    await owner.save();

    // notify to owner
    await ctx.telegram.sendMessage(service.ownerId, `Administrator enabled you until ${expiresAt.format("YYYY-MM-DD HH:mm")}`);
    await ctx.reply("Successfully set expiration date", Markup.inlineKeyboard([Markup.button.callback("« Back to owners", "a_owners")]));
  }
};
