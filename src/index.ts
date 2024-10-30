import { Markup, Telegraf } from "telegraf";
import * as mongoose from "mongoose";
import LocalSession from "telegraf-session-local";
import * as schedule from "node-schedule";
import express from "express";

import { BOT_COMMANDS, BOT_WELCOME_MESSAGE, getHelpContent } from "./common/string";
import { BOT_TOKEN, MONGO_URI, WEB_PORT } from "./config/env";
import { logger } from "./helper/logger";
import { BotContext } from "./bot/context";
import { handleOwnerCommand, handleOwnerMessage } from "./bot/owner";
import { handleCustomerCommand, handleCustomerMessage } from "./bot/customer";
import { handleAdminCommand, handleAdminMessage } from "./bot/admin";
import { User } from "./model/User";
import { checkExpiration, notifyExpriration, removeExpiredOrders } from "./task";
import { IPaymentCallbackParams, onPaymentSuccess } from "./web/callback";
import { ServiceMode, SessionState, UserRole } from "./common/types";

async function main() {
  // prepare db
  logger.info("Connecting to database...");
  logger.debug(`DB connection URI: ${MONGO_URI}`);

  await mongoose.connect(MONGO_URI, {
    autoCreate: true,
    autoIndex: true,
  });

  const bot = new Telegraf<BotContext>(BOT_TOKEN);

  // Set bot commands
  bot.telegram
    .setMyCommands(BOT_COMMANDS.filter((cmd) => cmd.displayRole === UserRole.Customer))
    .then(
      () => logger.info("Set bot command successfully."),
      (reason) => logger.warn(`Failed to set bot command - ${reason}`)
    )
    .catch((err) => logger.error(err));

  // bot.use(Telegraf.log(logger.debug)); // enable log

  // use LocalSession to persistance session data
  bot.use(new LocalSession({ database: "data/session.db.json" }).middleware());

  // load or update user info
  bot.on("callback_query", async (ctx, next) => {
    const userId = ctx.chat?.id;

    const user = await User.findOne({ userId });

    if (user) {
      ctx.session.user = user;
    } else {
      const username = ctx.from?.username || `${ctx.from?.first_name} ${ctx.from?.last_name}`;
      const serviceName = `${username}'s service`;
      ctx.session.user = await User.create({
        userId,
        username,
        role: UserRole.Customer,
        serviceName,
        serviceMode: ServiceMode.None,
      });
    }

    next();
  });

  bot.on("message", async (ctx, next) => {
    const userId = ctx.chat.id;

    const user = await User.findOne({ userId });

    if (user) {
      ctx.session.user = user;
    } else {
      const username = ctx.from?.username || `${ctx.from?.first_name} ${ctx.from?.last_name}`;
      const serviceName = `${username}'s service`;
      ctx.session.user = await User.create({
        userId,
        username,
        role: UserRole.Customer,
        serviceName,
        serviceMode: ServiceMode.None,
      });
    }

    next();
  });

  // command role check & reset session status
  BOT_COMMANDS.forEach((cmd) => {
    bot.command(cmd.command, (ctx, next) => {
      const user = ctx.session.user;
      ctx.session.status = SessionState.None;
      logger.debug(`CMD ${cmd.command} by ${user.username}`);
      if (cmd.role && user.role != cmd.role) {
        logger.warn(`Unauthorized command: ${cmd.command} by ${user.username}`);
        return;
      }
      next();
    });
  });

  // skip pinned message
  bot.on("pinned_message", () => {});

  // action role check
  // action format - caller_action
  bot.action(/^a_(.*)$/, async (ctx, next) => {
    const user = ctx.session.user;
    const action = ctx.match[1];
    logger.debug(`Action: ${ctx.match[1]} by ${user.username}`);
    if (user.role !== UserRole.Admin) {
      logger.warn(`Unauthorized admin action: ${action} by ${user.username}`);
      return;
    }
    next();
  });
  bot.action(/^o_(.*)$/, async (ctx, next) => {
    const user = ctx.session.user;
    const action = ctx.match[1];
    logger.debug(`Action: ${ctx.match[1]} by ${user.username}`);
    if (user.role !== UserRole.Owner) {
      logger.warn(`Unauthorized owner action: ${action} by ${user.username}`);
      return;
    }
    next();
  });
  bot.action(/^c_(.*)$/, async (ctx, next) => {
    const user = ctx.session.user;
    logger.debug(`Action: ${ctx.match[1]} by ${user.username}`);
    next();
  });

  // start and help commands
  bot.start(async (ctx) => {
    ctx.session.status = SessionState.None;
    const msg = await ctx.replyWithHTML(BOT_WELCOME_MESSAGE, Markup.removeKeyboard());
    await ctx.pinChatMessage(msg.message_id);
  });
  bot.help(async (ctx) => await ctx.replyWithHTML(getHelpContent(ctx), Markup.removeKeyboard()));

  handleCustomerCommand(bot);
  handleOwnerCommand(bot);
  handleAdminCommand(bot);

  handleCustomerMessage(bot);
  handleOwnerMessage(bot);
  handleAdminMessage(bot);

  bot.on("message", async (ctx) => await ctx.reply("Invalid message. Please use /help for more information", Markup.removeKeyboard()));

  // schedule job - notification to user
  schedule.scheduleJob("0 * * * * *", async () => await checkExpiration(bot));
  const rule = new schedule.RecurrenceRule();
  rule.hour = 0;
  rule.minute = 0;
  rule.tz = "Etc/UTC";
  schedule.scheduleJob(rule, async () => await notifyExpriration(bot));
  schedule.scheduleJob(rule, async () => await removeExpiredOrders(bot));

  logger.info("Starting bot...");
  bot.launch();
  logger.info("Bot started.");

  /**
   * Payment callback handler
   */
  const app = express();

  // return callback
  app.get("/success/:method", async (req, res) => {
    const params: IPaymentCallbackParams = {
      method: req.params.method,
      paypal: {
        payerId: req.query.PayerID as string,
        paymentId: req.query.paymentId as string,
      },
      stripe: {
        requestId: req.query.requestId as string,
      },
    };
    if (await onPaymentSuccess(params, bot)) {
      res.redirect("https://autopay.solutions/payment-successful");
    } else {
      res.redirect("https://autopay.solutions/payment-failed");
    }
  });

  // cancel callback
  app.get("/cancel", (req, res) => res.redirect("https://autopay.solutions/payment-cancelled"));

  // start server
  app.listen(WEB_PORT, "0.0.0.0", () => logger.info(`Payment callback server is started at port ${WEB_PORT}`));

  // Enable graceful stop
  process.once("SIGINT", async () => {
    logger.info("Terminating due to SIGINT...");
    await schedule.gracefulShutdown();
    bot.stop("SIGINT");
    process.exit(0);
  });

  process.once("SIGTERM", async () => {
    logger.info("Terminating due to SIGTERM...");
    await schedule.gracefulShutdown();
    bot.stop("SIGTERM");
    process.exit(0);
  });
}

main().catch((err) => logger.error(err));
