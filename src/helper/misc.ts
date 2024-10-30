import { BotContext } from "../bot/context";

export const sleep_ms = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const clearCallbackButton = async (ctx: BotContext) => {
  await ctx.telegram.editMessageReplyMarkup(ctx.chat?.id, (ctx.message?.message_id as number) - 1, undefined, undefined).catch(() => {});
};
