// Owner functions

import { Telegraf } from "telegraf";

import { logger } from "../../helper/logger";
import { BotContext } from "../context";
import { displayDashboard } from "./Dashboard";
import {
  displayServiceDetail,
  displayServicePlans,
  displayServices,
  enablePlan,
  enableTrial,
  manageService,
  setConfirmMsg,
  setCurrency,
  setPlanInfo,
  setServiceInfo,
  setUserOption,
  showMsg4ConfirmMsg,
  showMsg4Currency,
  showMsg4EditService,
  showMsg4PlanInfo,
  showMsg4UserOption,
} from "./Service";
import {
  displayPaymentMethods,
  displayPayPalInfo,
  displayStripeInfo,
  recvNewPayPalInfo,
  recvNewStripeInfo,
  setPayPalInfo,
  setStripeInfo,
  showMsg4EditPayPal,
  showMsg4EditStripe,
  showMsg4NewPaymentGateway,
  showMsg4NewPayPal,
  showMsg4NewStripe,
} from "./PaymentGateway";
import { recvRegistrationInfo, recvServicePlan, showMsg4ContinueRegistration, showMsg4Register, showMsg4Upgrade } from "./Registration";
import { SessionState, UserRole } from "../../common/types";
import {
  displaySubscriptionInfo,
  payServiceFee,
  purchaseServicePlan,
  setServicePlan,
  showMsg4FullVersion,
  showMsg4ServicePlan,
} from "./Subscription";

export const handleOwnerCommand = (bot: Telegraf<BotContext>) => {
  // service owner registration
  bot.command("register", (ctx) => showMsg4Upgrade(ctx));
  bot.action(/^c_service_plan_(\d)$/, (ctx) => recvServicePlan(ctx, parseInt(ctx.match[1])));

  /**
   * Dashboard
   */
  bot.command("dashboard", (ctx) => displayDashboard(ctx, false));
  bot.action("o_dashboard", (ctx) => displayDashboard(ctx, true));
  bot.action(/o_manage_services_(\d*)/, (ctx) => displayServices(ctx, parseInt(ctx.match[1]), true));
  bot.action("o_manage_subscription", (ctx) => displaySubscriptionInfo(ctx, true));
  bot.action("o_manage_payment", (ctx) => displayPaymentMethods(ctx, true));

  // subscription
  bot.action("o_pay_service", (ctx) => payServiceFee(ctx));

  bot.action("o_pay_full_version", (ctx) => showMsg4FullVersion(ctx));
  bot.action(/^o_purchase_service_plan_(\d*)$/, (ctx) => purchaseServicePlan(ctx, parseInt(ctx.match[1])));

  bot.action("o_edit_service_plan", (ctx) => showMsg4ServicePlan(ctx));
  bot.action(/^o_set_service_plan_(\d*)$/, (ctx) => setServicePlan(ctx, parseInt(ctx.match[1])));

  // services
  bot.command("addserver", (ctx) => showMsg4Register(ctx, false));
  bot.action("o_addserver", (ctx) => showMsg4Register(ctx, true));
  bot.action(/^o_service_plan_(\d)$/, (ctx) => recvServicePlan(ctx, parseInt(ctx.match[1])));
  bot.action(/^o_manage_service_([0-9a-fA-F]{24})$/, (ctx) => manageService(ctx, ctx.match[1]));
  bot.action("o_manage_service", (ctx) => displayServiceDetail(ctx, true));
  bot.action(/^o_edit_service_(.*)$/, async (ctx) => showMsg4EditService(ctx, ctx.match[1]));

  // service
  bot.action(/o_edit_plans_(.*)/, (ctx) => displayServicePlans(ctx, parseInt(ctx.match[1]), true));
  bot.action("o_edit_server_info", (ctx) => displayServiceDetail(ctx, true, "server_info"));
  bot.action("o_edit_confirm_msg", (ctx) => showMsg4ConfirmMsg(ctx));
  bot.action("o_edit_user_option", (ctx) => displayServiceDetail(ctx, true, "user_option"));
  bot.action(/^o_edit_profile_option$/, (ctx) => showMsg4UserOption(ctx));
  bot.action(/^o_profile_option_(.*)$/, (ctx) => setUserOption(ctx, parseInt(ctx.match[1])));
  bot.action(/^o_set_plan_titles_(loop|all)$/, (ctx) => showMsg4PlanInfo(ctx, ctx.match[1], ctx.match[2], true));
  bot.action(/^o_set_plan_(price|title)s_(loop|all)$/, (ctx) => showMsg4PlanInfo(ctx, ctx.match[1], ctx.match[2], true));
  bot.action(/^o_set_plan_(.*)$/, (ctx) => showMsg4PlanInfo(ctx, ctx.match[1], "single", true));
  bot.action(/^o_(enable|disable)_plan$/, (ctx) => enablePlan(ctx, ctx.match[1] === "enable", false));
  bot.action(/^o_(enable|disable)_all_plans$/, (ctx) => enablePlan(ctx, ctx.match[1] === "enable", true));
  bot.action(/^o_(enable|disable)_trial$/, (ctx) => enableTrial(ctx, ctx.match[1] === "enable"));
  bot.action("o_edit_currency", (ctx) => showMsg4Currency(ctx));
  bot.action(/^o_set_currency_(.*)$/, (ctx) => setCurrency(ctx, ctx.match[1]));
  // back button
  bot.action(/^o_manage_service_(.*)$/, (ctx) => displayServiceDetail(ctx, true, ctx.match[1]));

  // payment gateways
  bot.action("o_new_payment_gateway", (ctx) => showMsg4NewPaymentGateway(ctx));
  bot.action("o_add_paypal", (ctx) => showMsg4NewPayPal(ctx));
  bot.action("o_edit_paypal", (ctx) => displayPayPalInfo(ctx, true));
  bot.action(/^o_edit_paypal_(.*)$/, (ctx) => showMsg4EditPayPal(ctx, ctx.match[1]));

  bot.action("o_add_stripe", (ctx) => showMsg4NewStripe(ctx));
  bot.action("o_edit_stripe", (ctx) => displayStripeInfo(ctx, true));
  bot.action(/^o_edit_stripe_(.*)$/, (ctx) => showMsg4EditStripe(ctx, ctx.match[1]));

  // payment callback
  bot.action("c_continue_register", (ctx) => showMsg4ContinueRegistration(ctx));
  bot.action("o_continue_add", (ctx) => showMsg4ContinueRegistration(ctx));
  bot.action("o_goto_service", (ctx) => displayServiceDetail(ctx, false));
  bot.action("o_goto_dashboard", (ctx) => displayDashboard(ctx, false));
};

export const handleOwnerMessage = (bot: Telegraf<BotContext>) => {
  // Registration for owner
  bot.on("text", async (ctx, next) => {
    if (ctx.session.status !== SessionState.RegisterService) {
      next();
      return;
    }
    await recvRegistrationInfo(ctx, ctx.message.text);
  });

  bot.on("text", async (ctx, next) => {
    const user = ctx.session.user;

    // message handler for owner role
    if (!user || user.role !== UserRole.Owner) {
      next();
      return;
    }

    switch (ctx.session.status) {
      case SessionState.EditServiceField: {
        await setServiceInfo(ctx, ctx.message.text);
        break;
      }
      case SessionState.ReceivePayPalInfo: {
        await recvNewPayPalInfo(ctx, ctx.message.text);
        break;
      }
      case SessionState.EditPayPalInfo: {
        await setPayPalInfo(ctx, ctx.message.text);
        break;
      }
      case SessionState.ReceiveStripeInfo: {
        await recvNewStripeInfo(ctx, ctx.message.text);
        break;
      }
      case SessionState.EditStripeInfo: {
        await setStripeInfo(ctx, ctx.message.text);
        break;
      }
      case SessionState.EditConfirmMsg: {
        await setConfirmMsg(ctx, ctx.message.text);
        break;
      }
      case SessionState.EditPlanInfo:
      case SessionState.EditPlanInfoAll: {
        await setPlanInfo(ctx, ctx.message.text);
        break;
      }
      default: {
        logger.warn(`Owner message from ${user.username}: invalid status - ${SessionState[ctx.session.status]}`);
        next();
        break;
      }
    }
  });
};
