import { Markup } from "telegraf";
import { logger } from "../../helper/logger";
import { escape, getButtons } from "../../helper/string_util";
import { getOwnerProfile } from "../../model/User";
import { BotContext } from "../context";
import { SessionState, UserRole } from "../../common/types";

export const displayDashboard = async (ctx: BotContext, isCallbackMode: boolean) => {
  const user = await getOwnerProfile(ctx.chat?.id as number);

  if (!user || user.role !== UserRole.Owner) {
    await ctx.reply("Only service owners are allowed. Use /register to register your own service.", Markup.removeKeyboard());
    return;
  }

  let message = "";

  message += `<b><u>${escape(user.username || "")}'s Dashboard</u></b>\n\n`;

  message += `<b>Services:</b> `;

  if (user.services.length == 0) {
    // logger.error(`Owner dashboard: no service(${ctx.chat?.id})`);
    message += `No service registered.\n`;
  } else {
    message += `${user.services.length} service(s) registered.\n`;
  }
  user.services.forEach((service) => {
    message += `${service.serviceCode} - ${escape(service.url)}\n`;
  });

  message += "\n";

  if (user.paymentGateway) {
    let hasGateway = false;

    message += "<b>Registered payment methods:</b>\n";
    message += "<pre>";
    if (user.paymentGateway.paypal) {
      message += `  Paypal(${escape(user.paymentGateway.paypal.accountEmail)})`;
      if (!user.paymentGateway.paypal.isValid) {
        message += " ⚠️";
      }
      message += "\n";
      hasGateway = true;
    }

    if (user.paymentGateway.stripe) {
      message += `  Stripe(${escape(user.paymentGateway.stripe.accountEmail)})`;
      if (!user.paymentGateway.stripe.isValid) {
        message += " ⚠️";
      }
      message += "\n";
      hasGateway = true;
    }

    message += "</pre>";

    // TODO: add more payment gateways

    if (!hasGateway) {
      message += "  No payment methods are added.";
    }

    message += "\n\n";
  } else {
    message += "No payment method is registered.\n\n";
  }

  // message += `<b>Currency:</b> ${user.currency || "GBP"}\n\n`;

  /*
  message += "<b>Status:</b> ";
  switch (user.status) {
    case ServiceStatus.Pending:
      message += "Pending  👋\n";
      break;
    case ServiceStatus.Enabled:
      message += "Enabled  ✅\n";
      break;
    case ServiceStatus.EnabledUntil:
      message += "Enabled";
      message += ` (${moment(user.expiresAt).utc().format("YYYY-MM-DD")})`;

      const expiresAt = moment(user.expiresAt);

      // expiration is less than 1 week
      if (expiresAt < moment().add(7, "days")) {
        message += "  ⏰\n";
      } else {
        message += "  ✅\n";
      }
      break;
    case ServiceStatus.Disabled:
      message += "Disabled  🚫\n";
      break;
  }
  */

  const buttons = [
    [
      Markup.button.callback("Manage Your Service(s)", "o_manage_services_0"),
      Markup.button.callback("Manage Your Subscription", "o_manage_subscription"),
    ],
    [
      Markup.button.callback("Manage Payment Method(s)", "o_manage_payment"),
      Markup.button.callback("View Registered Customers", "o_show_customers"),
    ],
    [Markup.button.url("Documentation", "https://support.autopay.solutions/"), Markup.button.url("Support", "https://t.me/Amber_APS")],
  ];

  ctx.session.status = SessionState.None;

  if (isCallbackMode) {
    await ctx
      .editMessageText(message, {
        reply_markup: Markup.inlineKeyboard(buttons).reply_markup,
        parse_mode: "HTML",
      })
      .catch(() => {});
  } else {
    if (ctx.callbackQuery) {
      await ctx.editMessageReplyMarkup(undefined);
    }
    await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons));
  }
};
