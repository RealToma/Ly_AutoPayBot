// Bot admin functions

import { Telegraf } from "telegraf";

import { BotContext } from "../context";
import {
  displayOwners,
  showRestrictMsg,
  restrictOwner,
  handleOwnerRegistration,
  displayOwnerServices,
  displayService,
  changeServiceStatus,
  deleteService,
} from "./ManageUser";
import {
  displayAdminPanel,
  setAdminPayPalInfo,
  setAdminStripeInfo,
  setPayPalAccount,
  setServiceCost,
  showMsg4PaypalInfo,
  showMsg4ServiceCost,
  showMsg4StripeInfo,
  showMsg4CryptoInfo, setAdminCryptoInfo
} from "./BotConfigure";
import { authAdmin, showMsg4AuthAdmin } from "./Authenticate";
import { logger } from "../../helper/logger";
import { SessionState, UserRole } from "../../common/types";

export const handleAdminCommand = (bot: Telegraf<BotContext>) => {
  bot.command("admin", async (ctx) => await showMsg4AuthAdmin(ctx));

  bot.command("botconfig", (ctx) => displayAdminPanel(ctx, "main", false));
  bot.action("a_dashboard", (ctx) => displayAdminPanel(ctx, "main", true));

  bot.command("owners", (ctx) => displayOwners(ctx, false));
  bot.action("a_owners", (ctx) => displayOwners(ctx, true));

  bot.action("a_edit_cost", (ctx) => displayAdminPanel(ctx, "cost", true));
  bot.action("a_edit_paypal", (ctx) => displayAdminPanel(ctx, "paypal", true));
  bot.action("a_edit_stripe", (ctx) => displayAdminPanel(ctx, "stripe", true));
  bot.action("a_edit_crypto", (ctx) => displayAdminPanel(ctx, "crypto", true));

  bot.action(/^a_set_(.*)_cost$/, (ctx) => showMsg4ServiceCost(ctx, ctx.match[1]));

  bot.action(/^a_set_paypal_(.*)$/, (ctx) => showMsg4PaypalInfo(ctx, ctx.match[1]));
  bot.action(/^a_set_stripe_(.*)$/, (ctx) => showMsg4StripeInfo(ctx, ctx.match[1]));
  bot.action(/^a_set_crypto_(.*)$/, (ctx) => showMsg4CryptoInfo(ctx, ctx.match[1]));

  bot.action(/^a_edit_owner_(\d*)$/, (ctx) => displayOwnerServices(ctx, ctx.match[1], true));

  bot.action(/^a_edit_service_([0-9a-fA-F]{24})$/, (ctx) => displayService(ctx, ctx.match[1], true));

  bot.action(/^a_(accept|reject)_owner_(\d*)$/, (ctx) => handleOwnerRegistration(ctx, ctx.match[1], ctx.match[2]));

  bot.action(/^a_(enable|disable)_service_([0-9a-fA-F]{24})$/, (ctx) => changeServiceStatus(ctx, ctx.match[1], ctx.match[2]));

  bot.action(/^a_delete_service_([0-9a-fA-F]{24})$/, (ctx) => deleteService(ctx, ctx.match[1]));

  bot.action(/^a_try_delete_service_([0-9a-fA-F]{24})$/, (ctx) => displayService(ctx, ctx.match[1], true, "delete"));

  bot.action(/^a_restrict_service_([0-9a-fA-F]{24})$/, (ctx) => showRestrictMsg(ctx, ctx.match[1]));
};

export const handleAdminMessage = (bot: Telegraf<BotContext>) => {
  // message handler for admin registration
  bot.on("text", async (ctx, next) => {
    if (ctx.session.status !== SessionState.AuthenticateAdmin) {
      next();
      return;
    }
    await authAdmin(ctx, ctx.message.text);
  });

  // message handler for Admin
  bot.on("text", async (ctx, next) => {
    const user = ctx.session.user;

    if (user.role !== UserRole.Admin) {
      next();
      return;
    }

    switch (ctx.session.status) {
      case SessionState.ReceiveOwnerExpirationDate: {
        await restrictOwner(ctx, ctx.message.text);
        break;
      }
      case SessionState.EditAdminPayPalEmail: {
        setPayPalAccount(ctx, ctx.message.text);
        break;
      }
      case SessionState.EditServiceCost: {
        setServiceCost(ctx, ctx.message.text);
        break;
      }
      case SessionState.EditAdminPayPalInfo: {
        setAdminPayPalInfo(ctx, ctx.message.text);
        break;
      }
      case SessionState.EditAdminStripeInfo: {
        setAdminStripeInfo(ctx, ctx.message.text);
        break;
      }
      case SessionState.EditAdminCryptoInfo: {
        setAdminCryptoInfo(ctx, ctx.message.text);
        break;
      }
      default: {
        logger.warn(`Admin message from ${user.username}: invalid status - ${SessionState[ctx.session.status]}`);
        next();
        break;
      }
    }
  });
};
