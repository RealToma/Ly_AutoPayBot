// Customer fuctions

import { Telegraf } from "telegraf";
import { logger } from "../../helper/logger";

import { BotContext } from "../context";
import {
  cancelPurchase,
  deleteOrder,
  displayOrder,
  displayOrders,
  showMsg4IncompleteOrder,
  initPurchase,
  payIncompleteOrder,
  recvPurchaseInfo,
  recvRenewOrder,
  setOrderInfo,
  showMsg4EditOrder,
  showMsg4RenewOrder,
  finishIncompleteOrder,
} from "./Order";
import { ActionType, SessionState, UserRole } from "../../common/types";

export const handleCustomerCommand = (bot: Telegraf<BotContext>) => {
  bot.command("trial", (ctx) => initPurchase(ctx, ActionType.TrialOrder));
  bot.command("purchase", (ctx) => initPurchase(ctx, ActionType.PurchaseOrder));
  bot.command("add", (ctx) => initPurchase(ctx, ActionType.AddOrder));
  bot.command("renew", (ctx) => initPurchase(ctx, ActionType.RenewOrder));

  // show & manage orders of the user
  bot.command("manage", (ctx) => displayOrders(ctx, false));
  bot.action("c_orders", (ctx) => displayOrders(ctx, true));

  // bot.action(/^c_pay_by_(.*)$/, (ctx) => payOrder(ctx, ctx.match[1]));

  bot.action(/^c_cancel_purchase_([0-9a-fA-F]{24})$/, (ctx) => cancelPurchase(ctx, ctx.match[1]));

  bot.action(/^c_edit_order_([0-9a-fA-F]{24})$/, (ctx) => displayOrder(ctx, ctx.match[1], true));

  bot.action(/^c_edit_order_(username|password)_([0-9a-fA-F]{24})$/, (ctx) => showMsg4EditOrder(ctx, ctx.match[1], ctx.match[2]));

  bot.action(/^c_renew_order_([0-9a-fA-F]{24})$/, (ctx) => showMsg4RenewOrder(ctx, ctx.match[1], true));

  bot.action(/^c_delete_order_([0-9a-fA-F]{24})$/, (ctx) => deleteOrder(ctx, ctx.match[1]));

  bot.action(/^c_pay_order_([0-9a-fA-F]{24})$/, (ctx) => payIncompleteOrder(ctx, ctx.match[1]));

  bot.action(/^c_finish_purchase_order_([0-9a-fA-F]{24})$/, (ctx) => showMsg4IncompleteOrder(ctx, ctx.match[1]));
};

export const handleCustomerMessage = (bot: Telegraf<BotContext>) => {
  bot.on("text", async (ctx, next) => {
    switch (ctx.session.status) {
      case SessionState.PurchaseOrRenew: {
        await recvPurchaseInfo(ctx, ctx.message.text);
        break;
      }
      case SessionState.EditOrderField: {
        await setOrderInfo(ctx, ctx.message.text);
        break;
      }
      case SessionState.RenewUserLine: {
        await recvRenewOrder(ctx, ctx.message.text);
        break;
      }
      case SessionState.AuthenticateAdmin:
      case SessionState.RegisterService:
        // these two status are handled by owner & admin module
        next();
        break;
      case SessionState.FixIncompleteOrder:
        finishIncompleteOrder(ctx, ctx.message.text);
        break;
      default: {
        if (ctx.session.user.role === UserRole.Customer) {
          logger.warn(`Customer message from ${ctx.session.user.username}: invalid status - ${SessionState[ctx.session.status]}`);
        }
        next();
        break;
      }
    }
  });
};
